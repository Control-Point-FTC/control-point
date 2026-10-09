import * as Y from 'yjs';
import { ApiError, apiJson } from '../services/api';
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';

export type SyncStatus = 'joining' | 'saved' | 'saving' | 'offline' | 'conflict' | 'unavailable' | 'error';
export interface SyncResponse {
  epoch: string; update: string; vector: string; revision: number; title: string;
  protected: boolean; editable: boolean; updatedBy: number | null; updatedAt: string;
  peers?: { clientId: number; memberId: number; name: string; color: string; cursor: unknown; clock: number }[];
}
export function encodeBytes(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16_384) text += String.fromCharCode(...bytes.subarray(i, i + 16_384));
  return btoa(text);
}
export function decodeBytes(text: string): Uint8Array { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }

/** A durable CRDT transport. Polls carry state-vector deltas, not whole-page
 * overwrites. Content stays in memory here; offline persistence is separate and
 * must never cache protected pages. One request at a time preserves acknowledgments.
 */
export class NotebookSync {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  status: SyncStatus = 'joining';
  error = '';
  data: SyncResponse | null = null;
  private generation = 0;
  private acknowledged = 0;
  private serverVector: Uint8Array | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;
  private abort = new AbortController();
  private listeners = new Set<() => void>();
  private events = new Map<string, Set<(...args: any[]) => void>>();
  constructor(readonly pageId: number) {
    this.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      this.generation++;
      if (this.data && !this.stopped && !['conflict', 'unavailable', 'error'].includes(this.status)) {
        this.status = 'saving'; this.emit(); this.schedule(800);
      }
    });
  }
  get pending() { return this.generation > this.acknowledged; }
  on(event: string, fn: (...args: any[]) => void) {
    const listeners = this.events.get(event) ?? new Set(); listeners.add(fn); this.events.set(event, listeners);
    // Tiptap attaches after the initial join. Let its stable-ID extension see
    // the completed sync without requiring another network round trip.
    if (event === 'synced' && this.data) queueMicrotask(() => { if (!this.stopped && listeners.has(fn)) fn({ state: true }); });
    return this;
  }
  off(event: string, fn: (...args: any[]) => void) { this.events.get(event)?.delete(fn); return this; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(fn => fn()); }
  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => { void this.exchange(); }, ms);
  }
  async start() { await this.exchange(); }
  private exchange(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopped || ['conflict', 'unavailable', 'error'].includes(this.status)) return Promise.resolve();
    const sent = this.generation;
    this.running = (async () => {
      try {
        const body = this.data ? {
          epoch: this.data.epoch, vector: encodeBytes(Y.encodeStateVector(this.doc)),
          ...(this.pending ? { update: encodeBytes(Y.encodeStateAsUpdate(this.doc, this.serverVector)) } : {}),
        } : {};
        Object.assign(body, { clientId: this.doc.clientID, cursor: this.awareness.getLocalState()?.cursor ?? null });
        const request = new AbortController();
        const abort = () => request.abort();
        this.abort.signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(abort, 15_000);
        let res: SyncResponse;
        try {
          res = await apiJson<SyncResponse>(`/api/notebook/pages/${this.pageId}/sync`, {
            method: 'POST', body: JSON.stringify(body), cache: 'no-store', signal: request.signal,
          });
        } finally { clearTimeout(timeout); this.abort.signal.removeEventListener('abort', abort); }
        if (this.stopped) return;
        Y.applyUpdate(this.doc, decodeBytes(res.update), this);
        this.serverVector = decodeBytes(res.vector);
        const first = !this.data;
        this.data = res;
        const peers = new Map((res.peers ?? []).filter(p => p.clientId !== this.doc.clientID).map(p => [p.clientId, p]));
        const removed = [...this.awareness.getStates().keys()].filter(id => id !== this.doc.clientID && !peers.has(id));
        const encoded = encoding.createEncoder();
        encoding.writeVarUint(encoded, peers.size + removed.length);
        for (const [id, peer] of peers) {
          encoding.writeVarUint(encoded, id); encoding.writeVarUint(encoded, peer.clock);
          encoding.writeVarString(encoded, JSON.stringify({ user: { name: peer.name, color: peer.color }, cursor: peer.cursor }));
        }
        for (const id of removed) {
          encoding.writeVarUint(encoded, id); encoding.writeVarUint(encoded, (this.awareness.meta.get(id)?.clock ?? 0) + 1); encoding.writeVarString(encoded, 'null');
        }
        applyAwarenessUpdate(this.awareness, encoding.toUint8Array(encoded), this);
        this.acknowledged = sent;
        this.status = this.pending ? 'saving' : 'saved'; this.error = '';
        if (first) this.events.get('synced')?.forEach(fn => fn({ state: true }));
        this.schedule(this.pending ? 100 : document.visibilityState === 'hidden' ? 5_000 : 1_000);
      } catch (e) {
        if (this.stopped) return;
        this.error = e instanceof Error ? e.message : 'Cannot connect to the notebook';
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          // Access loss removes editor content immediately; no protected source
          // or stale title survives in this provider or a browser cache.
          this.status = 'unavailable'; this.data = null;
          this.doc.transact(() => {
            this.doc.getXmlFragment('prosemirror').delete(0, this.doc.getXmlFragment('prosemirror').length);
            this.doc.getMap('meta').clear();
          }, this);
          this.doc.destroy();
        } else if (e instanceof ApiError && e.status === 409) this.status = 'conflict';
        else if (e instanceof ApiError && e.status < 500) this.status = 'error';
        else { this.status = 'offline'; this.schedule(5_000); }
      } finally { this.running = undefined; this.emit(); }
    })();
    return this.running;
  }
  async flush(): Promise<boolean> {
    await this.exchange();
    // An edit may have arrived while the first request was in flight.
    if (this.pending && this.status === 'saving') await this.exchange();
    return !this.pending && this.status === 'saved';
  }
  retry() { if (this.status === 'offline') { this.schedule(0); } }
  destroy() { this.stopped = true; clearTimeout(this.timer); this.abort.abort(); this.listeners.clear(); this.events.clear(); this.awareness.destroy(); this.doc.destroy(); }
}

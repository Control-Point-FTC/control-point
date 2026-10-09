import * as Y from 'yjs';
import { ApiError, apiJson } from '../services/api';
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import { readNotebookJournal, writeNotebookJournal, deleteNotebookJournal, type NotebookJournal } from './offlineJournal';
import { registerNotebookSession } from './notebookRuntime';

export type SyncStatus = 'joining' | 'saved' | 'saving' | 'offline' | 'conflict' | 'unavailable' | 'error';
export interface SyncResponse {
  epoch: string; update: string; vector: string; revision: number; title: string;
  protected: boolean; editable: boolean; updatedBy: number | null; updatedAt: string; createdAt?: string; legacyCanvas?: unknown;
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
  storageError = '';
  data: SyncResponse | null = null;
  private generation = 0;
  private acknowledged = 0;
  private durableGeneration = -1;
  private serverVector: Uint8Array | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;
  private abort = new AbortController();
  private listeners = new Set<() => void>();
  private events = new Map<string, Set<(...args: any[]) => void>>();
  private cached: NotebookJournal | undefined;
  private revalidate = false;
  private detached = false;
  private workspaceChanged = false;
  private journalKey: string | undefined;
  private unregister: () => void;
  private unload = (event: BeforeUnloadEvent) => { if (this.pending && !this.locallyDurable) { event.preventDefault(); event.returnValue = ''; } };
  constructor(readonly pageId: number, readonly scope?: { memberId: number; teamId: number }) {
    this.unregister = registerNotebookSession(this);
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.unload);
    this.journalKey = scope ? `${scope.memberId}:${scope.teamId}:${pageId}` : undefined;
    this.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      this.generation++;
      void this.persist();
      if (this.data && !this.stopped && !['conflict', 'unavailable', 'error'].includes(this.status)) {
        this.status = 'saving'; this.emit(); this.schedule(800);
      }
    });
  }
  get pending() { return this.generation > this.acknowledged; }
  get locallyDurable() { return !this.data?.protected && this.generation <= this.durableGeneration; }
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
  async start() {
    if (this.journalKey) {
      try { this.cached = await readNotebookJournal(this.journalKey); }
      catch (e) { this.storageError = e instanceof Error ? e.message : 'Offline storage unavailable'; }
    }
    await this.exchange();
  }
  private async purgeJournal() {
    if (!this.journalKey) return;
    try { await deleteNotebookJournal(this.journalKey); }
    catch { this.storageError = 'This device could not remove its offline copy. Clear notebook site storage before sharing this device.'; this.emit(); }
  }
  async persist(): Promise<boolean> {
    if (!this.scope || !this.journalKey || !this.data || ['conflict','unavailable','error'].includes(this.status)) return false;
    if (this.data.protected) { await this.purgeJournal(); return false; }
    try {
      const generation = this.generation;
      await writeNotebookJournal({ key: this.journalKey, pageId: this.pageId, ...this.scope,
        epoch: this.data.epoch, state: encodeBytes(Y.encodeStateAsUpdate(this.doc)), pending: this.pending,
        title: String(this.doc.getMap('meta').get('title') ?? this.data.title), revision: this.data.revision,
        editable: this.data.editable, updatedBy: this.data.updatedBy, updatedAt: this.data.updatedAt });
      this.durableGeneration = Math.max(this.durableGeneration, generation); this.storageError = ''; return true;
    } catch (e) {
      this.storageError = (e as any)?.name === 'QuotaExceededError' ? 'Device storage is full. Free space or download your unsaved changes.' : (e as any)?.message ?? 'Offline storage failed; download your changes';
      this.emit(); return false;
    }
  }
  private restoreCached() {
    if (!this.cached || this.data) return;
    const cached = this.cached;
    Y.applyUpdate(this.doc, decodeBytes(cached.state), this);
    this.generation = cached.pending ? 1 : 0;
    this.durableGeneration = this.generation;
    this.data = { epoch: cached.epoch, update: cached.state, vector: encodeBytes(Y.encodeStateVector(this.doc)), revision: cached.revision, title: cached.title, protected: false, editable: cached.editable, updatedBy: cached.updatedBy, updatedAt: cached.updatedAt, peers: [] };
    this.cached = undefined; this.revalidate = true;
  }
  private exchange(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopped || ['conflict', 'unavailable', 'error'].includes(this.status)) return Promise.resolve();
    const sent = this.revalidate ? this.acknowledged : this.generation;
    this.running = (async () => {
      try {
        const body = this.data && !this.revalidate ? {
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
            headers: this.scope ? { 'X-CP-Notebook-Team': String(this.scope.teamId) } : undefined,
          });
        } finally { clearTimeout(timeout); this.abort.signal.removeEventListener('abort', abort); }
        if (this.stopped) return;
        const oldEpoch = this.data?.epoch ?? this.cached?.epoch;
        if (res.protected) await this.purgeJournal();
        if (this.stopped) return;
        // Journal removal can yield while the editor accepts new input.
        // Decide whether replacement is safe only after that await.
        const hasRecovery = this.pending || this.cached?.pending;
        if (hasRecovery && oldEpoch && oldEpoch !== res.epoch) {
          if (this.cached && !this.data) { Y.applyUpdate(this.doc, decodeBytes(this.cached.state), this); if (this.cached.pending) this.generation++; this.durableGeneration = this.generation; }
          this.data = res; this.cached = undefined; this.status = 'conflict';
          this.error = 'This page was restored or replaced. Download your unsaved changes before rejoining.';
          return;
        }
        if (oldEpoch && oldEpoch !== res.epoch) {
          // A clean cached generation still belongs to its old Yjs document.
          // Remove it before applying the replacement, rather than merging two
          // independent histories and resurrecting text after a restore.
          this.doc.transact(() => {
            const fragment = this.doc.getXmlFragment('prosemirror'); fragment.delete(0, fragment.length);
            this.doc.getMap('meta').clear();
            if (this.doc.share.has('canvas')) this.doc.getMap('canvas').clear();
          }, this);
          this.awareness.setLocalStateField('cursor', null);
          this.events.get('reset')?.forEach(fn => fn());
        }
        Y.applyUpdate(this.doc, decodeBytes(res.update), this);
        if (this.cached?.pending && this.cached.epoch === res.epoch) { Y.applyUpdate(this.doc, decodeBytes(this.cached.state), this); this.generation++; }
        this.cached = undefined;
        this.revalidate = false;
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
        if (this.pending && !res.editable) { this.status = 'conflict'; this.error = 'Editing permission changed. Download your unsaved changes; the shared page has not been overwritten.'; return; }
        if (first) this.events.get('synced')?.forEach(fn => fn({ state: true }));
        await this.persist();
        this.schedule(this.pending ? 100 : document.visibilityState === 'hidden' ? 5_000 : 1_000);
      } catch (e) {
        if (this.stopped) return;
        this.error = e instanceof Error ? e.message : 'Cannot connect to the notebook';
        if (e instanceof ApiError && e.status === 403 && e.body?.readable) {
          this.status = 'conflict';
          if (this.data) this.data = { ...this.data, editable: false };
        } else if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          // Access loss removes editor content immediately; no protected source
          // or stale title survives in this provider or a browser cache.
          this.status = 'unavailable'; this.data = null;
          this.acknowledged = this.generation; this.unregister();
          await this.purgeJournal(); this.cached = undefined;
          this.doc.transact(() => {
            this.doc.getXmlFragment('prosemirror').delete(0, this.doc.getXmlFragment('prosemirror').length);
            this.doc.getMap('meta').clear();
            if (this.doc.share.has('canvas')) this.doc.getMap('canvas').clear();
          }, this);
          this.doc.destroy();
        } else if (e instanceof ApiError && e.status === 409) {
          this.workspaceChanged = !!e.body?.workspaceChanged;
          if (e.body?.epoch && !this.pending && !this.workspaceChanged) { this.revalidate = true; this.status = 'offline'; this.error = ''; this.schedule(0); }
          else this.status = 'conflict';
          if (this.data?.protected) await this.purgeJournal();
        }
        else if (e instanceof ApiError && e.status < 500) this.status = 'error';
        else { this.restoreCached(); this.revalidate = true; this.status = 'offline'; this.schedule(5_000); }
      } finally { this.running = undefined; this.emit(); if (this.detached && this.status === 'saved' && !this.pending) this.destroy(); }
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
  resume() { this.detached = false; if (this.workspaceChanged) { this.workspaceChanged = false; this.revalidate = true; this.status = 'offline'; } if (!['conflict','error','unavailable'].includes(this.status)) this.schedule(0); }
  async discardRecovery() { this.acknowledged = this.generation; this.destroy(); await this.purgeJournal(); }
  async release() {
    if (!this.pending) { this.destroy(); return; }
    // Route teardown must not abort the last debounced save. Ordinary changes
    // are journaled first; protected changes remain memory-only until sent.
    this.detached = true; await this.persist();
    await this.flush();
  }
  destroy() { if (this.stopped) return; this.stopped = true; this.unregister(); if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.unload); clearTimeout(this.timer); this.abort.abort(); this.listeners.clear(); this.events.clear(); this.awareness.destroy(); this.doc.destroy(); }
}

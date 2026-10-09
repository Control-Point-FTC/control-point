import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ApiError, apiJson } from '../../services/api';
import { NotebookSync, decodeBytes, encodeBytes } from '../NotebookSync';
import { clearNotebookJournals, readNotebookJournal, pendingNotebookJournals } from '../offlineJournal';
import { prepareNotebookExit, findNotebookSession } from '../notebookRuntime';
import * as journal from '../offlineJournal';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const providers: NotebookSync[] = [], docs: Y.Doc[] = [];
beforeEach(async () => { await clearNotebookJournals(); });
afterEach(async () => { providers.splice(0).forEach(p => p.destroy()); docs.splice(0).forEach(d => d.destroy()); vi.restoreAllMocks(); vi.resetAllMocks(); await clearNotebookJournals(); });
const scope = { memberId: 41, teamId: 73 };
function provider(memberId = scope.memberId) { const p = new NotebookSync(15, { ...scope, memberId }); providers.push(p); return p; }
function server() {
  const doc = new Y.Doc(); docs.push(doc); doc.getMap('meta').set('title', 'Team journal');
  let epoch = 'original', protectedPage = false;
  const request = async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (body.update) Y.applyUpdate(doc, decodeBytes(body.update));
    return { epoch, protected: protectedPage, editable: true, revision: 1, title: doc.getMap('meta').get('title'), updatedBy: 41, updatedAt: 'now', peers: [], vector: encodeBytes(Y.encodeStateVector(doc)), update: encodeBytes(Y.encodeStateAsUpdate(doc, body.vector ? decodeBytes(body.vector) : undefined)) } as any;
  };
  vi.mocked(apiJson).mockImplementation(request);
  return { doc, request, protect: () => { protectedPage = true; }, restore: () => { epoch = 'restored'; doc.getMap('meta').set('title', 'Restored title'); } };
}
describe('ordinary-page durable offline journal', () => {
  it('allows sign-out when storage is unavailable and there is no known pending work', async () => {
    vi.spyOn(journal, 'pendingNotebookJournals').mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    expect(await prepareNotebookExit('logout')).toBe(true);
  });
  it('does not let an older release destroy a provider that has already resumed', async () => {
    const remote = server(), current = provider(); await current.start();
    current.doc.getMap('meta').set('title', 'Leaving then returning'); await current.persist();
    let finish!: (value: boolean) => void;
    vi.spyOn(current, 'persist').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const leaving = current.release(); current.resume(); finish(true); await leaving;
    expect(findNotebookSession(15, scope)).toBe(current);
    current.doc.getMap('meta').set('title', 'Still saving'); expect(await current.flush()).toBe(true);
    expect(remote.doc.getMap('meta').get('title')).toBe('Still saving');
  });
  it('replaces a clean offline cache after an epoch change without resurrecting old text', async () => {
    const remote = server(); const old = new Y.XmlText(); old.insert(0, 'Removed old text'); remote.doc.getXmlFragment('prosemirror').insert(0, [old]);
    const first = provider(); await first.start(); await first.persist(); first.destroy();
    vi.mocked(apiJson).mockRejectedValueOnce(new TypeError('Offline'));
    const current = provider(); await current.start(); expect(current.pending).toBe(false);
    const replacement = new Y.Doc(); docs.push(replacement); replacement.getMap('meta').set('title', 'New version'); const text = new Y.XmlText(); text.insert(0, 'Restored text'); replacement.getXmlFragment('prosemirror').insert(0, [text]);
    vi.mocked(apiJson).mockImplementation(async (_url, init) => { const body = JSON.parse(String(init?.body)); if (body.update) Y.applyUpdate(replacement, decodeBytes(body.update)); return { epoch: 'new-generation', protected: false, editable: true, revision: 2, title: 'New version', updatedBy: 41, updatedAt: 'now', peers: [], vector: encodeBytes(Y.encodeStateVector(replacement)), update: encodeBytes(Y.encodeStateAsUpdate(replacement)) } as any; });
    expect(await current.flush()).toBe(true); expect(current.doc.getXmlFragment('prosemirror').toString()).toBe('Restored text');
    current.doc.getMap('meta').set('title', 'New edit'); expect(await current.flush()).toBe(true);
    expect(replacement.getXmlFragment('prosemirror').toString()).toBe('Restored text');
  });
  it('refuses logout when a pending journal survives without a mounted editor', async () => {
    server(); const current = provider(); await current.start();
    current.doc.getMap('meta').set('title', 'Must survive logout'); await current.persist(); current.destroy();
    expect(await prepareNotebookExit('logout')).toBe(false);
    expect((await pendingNotebookJournals())[0].title).toBe('Must survive logout');
    const recovered = provider(); await recovered.start(); await recovered.flush();
    expect(await prepareNotebookExit('logout')).toBe(true);
  });
  it('retains a detached dirty provider until its save completes and allows it to resume', async () => {
    const remote = server(), current = provider(); await current.start();
    current.doc.getMap('meta').set('title', 'Last debounced edit');
    vi.mocked(apiJson).mockRejectedValueOnce(new TypeError('Offline'));
    await current.release();
    expect(findNotebookSession(15, scope)).toBe(current);
    expect(current.pending).toBe(true); expect(current.locallyDurable).toBe(true);
    current.resume(); expect(await current.flush()).toBe(true);
    expect(remote.doc.getMap('meta').get('title')).toBe('Last debounced edit');
  });
  it('keeps the old ordinary journal after a server restore rejects its queued update', async () => {
    server(); const current = provider(); await current.start();
    current.doc.getMap('meta').set('title', 'Recover me'); await current.persist();
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(409, 'Restored'));
    await current.flush();
    expect((await readNotebookJournal('41:73:15'))?.pending).toBe(true);
    await current.discardRecovery();
    expect(await readNotebookJournal('41:73:15')).toBeUndefined();
    expect(findNotebookSession(15, scope)).toBeUndefined();
  });
  it('recovers unsaved edits across reload and revalidates before merging them', async () => {
    const remote = server(), first = provider(); await first.start();
    first.doc.getMap('meta').set('title', 'Offline discovery');
    vi.mocked(apiJson).mockRejectedValueOnce(new TypeError('Offline'));
    expect(await first.flush()).toBe(false); expect(await first.persist()).toBe(true);
    first.destroy();
    const next = provider(); vi.mocked(apiJson).mockRejectedValueOnce(new TypeError('Still offline')); await next.start();
    expect(next.status).toBe('offline'); expect(next.doc.getMap('meta').get('title')).toBe('Offline discovery');
    expect(next.pending).toBe(true); expect(next.locallyDurable).toBe(true);
    const calls = vi.mocked(apiJson).mock.calls.length;
    expect(await next.flush()).toBe(true);
    expect(JSON.parse(String(vi.mocked(apiJson).mock.calls[calls][1]?.body)).update).toBeUndefined();
    expect(remote.doc.getMap('meta').get('title')).toBe('Offline discovery');
    expect((await readNotebookJournal('41:73:15'))?.pending).toBe(false);
  });
  it('does not expose one account’s cached page in another account or team', async () => {
    server(); const first = provider(); await first.start(); first.doc.getMap('meta').set('title', 'Account-specific pending work'); await first.persist(); first.destroy();
    vi.mocked(apiJson).mockRejectedValueOnce(new TypeError('Offline'));
    const other = provider(42); await other.start(); expect(other.data).toBeNull(); expect(other.doc.getMap('meta').size).toBe(0);
    expect(await readNotebookJournal('41:74:15')).toBeUndefined();
  });
  it('purges an ordinary cache when protection is learned and never journals protected edits', async () => {
    const remote = server(), current = provider(); await current.start(); expect(await readNotebookJournal('41:73:15')).toBeTruthy();
    remote.protect(); await current.flush(); expect(current.data?.protected).toBe(true);
    current.doc.getMap('meta').set('title', 'Admin-only work'); expect(await current.persist()).toBe(false);
    expect(await readNotebookJournal('41:73:15')).toBeUndefined();
  });
  it('purges cached plaintext when membership/read access is revoked', async () => {
    server(); const current = provider(); await current.start(); current.doc.getMap('meta').set('title', 'Pending'); await current.persist();
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(404, 'Unavailable'));
    await current.flush(); expect(current.status).toBe('unavailable'); expect(await readNotebookJournal('41:73:15')).toBeUndefined();
    expect(current.doc.getMap('meta').size).toBe(0);
  });
  it('keeps both versions recoverable when a restore changes the epoch', async () => {
    const remote = server(), current = provider(); await current.start(); current.doc.getMap('meta').set('title', 'Unsaved old version'); await current.persist(); current.destroy();
    remote.restore(); const next = provider(); await next.start();
    expect(next.status).toBe('conflict'); expect(next.doc.getMap('meta').get('title')).toBe('Unsaved old version');
    expect(next.pending).toBe(true);
    expect(next.data?.title).toBe('Restored title'); expect(remote.doc.getMap('meta').get('title')).toBe('Restored title');
    expect((await readNotebookJournal('41:73:15'))?.epoch).toBe('original');
  });
  it('reports quota failures without claiming local durability', async () => {
    server(); const current = provider(); await current.start();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError'); });
    current.doc.getMap('meta').set('title', 'Not yet durable');
    expect(await current.persist()).toBe(false); expect(current.locallyDurable).toBe(false); expect(current.storageError).toContain('Device storage is full');
  });
});

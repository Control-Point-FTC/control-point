import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ApiError, apiJson } from '../../services/api';
import { NotebookSync, decodeBytes, encodeBytes, type SyncResponse } from '../NotebookSync';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const providers: NotebookSync[] = [];
const documents: Y.Doc[] = [];
afterEach(() => { providers.splice(0).forEach(p => p.destroy()); documents.splice(0).forEach(d => d.destroy()); vi.resetAllMocks(); });
function setup() {
  const server = new Y.Doc(); documents.push(server);
  server.getMap('meta').set('title', 'Shared');
  const response = (body: any = {}): SyncResponse => {
    if (body.update) Y.applyUpdate(server, decodeBytes(body.update));
    return { epoch: 'epoch', update: encodeBytes(Y.encodeStateAsUpdate(server, body.vector ? decodeBytes(body.vector) : undefined)), vector: encodeBytes(Y.encodeStateVector(server)), title: String(server.getMap('meta').get('title')), revision: 1, protected: false, editable: true, updatedBy: 1, updatedAt: 'now' };
  };
  vi.mocked(apiJson).mockImplementation(async (_url, init) => response(JSON.parse(String(init?.body ?? '{}'))) as any);
  const provider = new NotebookSync(1); providers.push(provider);
  return { provider, server, response };
}
describe('notebook CRDT transport', () => {
  it('joins once, sends deltas, acknowledges only durable changes and reloads another client', async () => {
    const { provider, server } = setup();
    await provider.start();
    expect(provider.doc.getMap('meta').get('title')).toBe('Shared');
    expect(provider.pending).toBe(false);
    provider.doc.getMap('meta').set('title', 'Updated');
    expect(provider.pending).toBe(true);
    expect(await provider.flush()).toBe(true);
    expect(server.getMap('meta').get('title')).toBe('Updated');
    const other = new NotebookSync(1); providers.push(other); await other.start();
    expect(other.doc.getMap('meta').get('title')).toBe('Updated');
  });
  it('does not acknowledge an edit that arrives while an earlier save is in flight', async () => {
    const { provider, server, response } = setup(); await provider.start();
    let finish!: (value: any) => void;
    vi.mocked(apiJson).mockImplementationOnce(async (_url, init) => {
      const res = response(JSON.parse(String(init?.body)));
      return await new Promise(resolve => { finish = resolve; }) as any;
    });
    provider.doc.getMap('meta').set('title', 'First');
    const saving = provider.flush();
    provider.doc.getMap('meta').set('title', 'Second');
    finish(response());
    expect(await saving).toBe(true);
    expect(server.getMap('meta').get('title')).toBe('Second');
  });
  it('keeps unsaved edits pending during a connection failure and retries without duplication', async () => {
    const { provider, server } = setup(); await provider.start();
    provider.doc.getMap('meta').set('title', 'Offline');
    vi.mocked(apiJson).mockRejectedValueOnce(new TypeError('Network unavailable'));
    expect(await provider.flush()).toBe(false);
    expect(provider.status).toBe('offline'); expect(provider.pending).toBe(true);
    expect(await provider.flush()).toBe(true);
    expect(server.getMap('meta').get('title')).toBe('Offline');
  });
  it('purges protected content after access revocation and stops retrying it', async () => {
    const { provider } = setup(); await provider.start();
    provider.doc.getMap('meta').set('title', 'Admin secret');
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(404, 'Unavailable'));
    expect(await provider.flush()).toBe(false);
    expect(provider.status).toBe('unavailable'); expect(provider.data).toBeNull();
    expect(provider.doc.getMap('meta').size).toBe(0);
    const count = vi.mocked(apiJson).mock.calls.length;
    await provider.flush(); expect(vi.mocked(apiJson).mock.calls.length).toBe(count);
  });
  it('retains recoverable changes on a restore conflict without resending into a new epoch', async () => {
    const { provider } = setup(); await provider.start();
    provider.doc.getMap('meta').set('title', 'Recovered work');
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(409, 'Restored'));
    expect(await provider.flush()).toBe(false); expect(provider.status).toBe('conflict');
    expect(provider.doc.getMap('meta').get('title')).toBe('Recovered work');
    const count = vi.mocked(apiJson).mock.calls.length;
    await provider.flush(); expect(vi.mocked(apiJson).mock.calls.length).toBe(count);
  });
});

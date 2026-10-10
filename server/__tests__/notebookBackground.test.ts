// @vitest-environment node
// Draw → Format Background: shared through the live document, persisted in the
// page canvas, its picture tracked as a page attachment under page permissions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { NotebookStore } from '../notebook';
import { BACKGROUND_KEY } from '../../src/notebook/canvasModel';
import { startTestServer, seedTeam, seedMember, type TestServer } from './helpers/testServer';

let t: TestServer, store: NotebookStore, team: number, admin: number, section: number;
const ctx = (memberId = admin) => ({ memberId, teamId: team, source: 'human' as const });
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const upload = async (pageId: number) => {
  const r = await t.db.execute({ sql: "INSERT INTO stored_files(team_id,member_id,kind,filename,mime_type,size,data) VALUES(?,?,'notebook','grid.png','image/png',4,?)", args: [team, admin, new Uint8Array([137, 80, 78, 71])] });
  const fileId = Number(r.lastInsertRowid); await store.registerFile(ctx(), pageId, fileId); return fileId;
};
/** Join the page, set the background in a client document, send the update. */
async function setBackground(pageId: number, value: unknown) {
  const join: any = await store.sync(ctx(), pageId, {});
  const client = new Y.Doc(); Y.applyUpdate(client, Buffer.from(join.update, 'base64'));
  const before = Y.encodeStateVector(client);
  client.getMap('meta').set(BACKGROUND_KEY, value);
  return store.sync(ctx(), pageId, { epoch: join.epoch, update: b64(Y.encodeStateAsUpdate(client, before)) });
}

beforeAll(async () => {
  t = await startTestServer('cp-notebook-background-'); store = new NotebookStore(t.db);
  team = await seedTeam(t.db, 'Background team');
  admin = await seedMember(t.db, team, 'Admin', 'bg-admin@test', 'admin');
  section = (await store.tree(ctx())).sections[0].id;
}, 120000);
afterAll(async () => { await t?.stop(); });

describe('canvas background', () => {
  it('persists a color and picture in the page canvas and references the picture', async () => {
    const p: any = await store.create(ctx(), 'page', { sectionId: section, title: 'Background page' });
    const fileId = await upload(p.id);
    await setBackground(p.id, { color: '#dcfce7', image: { type: 'image', fileId, fit: 'tile' } });
    const saved = await store.page(ctx(), p.id);
    expect((saved.canvas as any).background).toEqual({ color: '#dcfce7', image: { type: 'image', fileId, fit: 'tile' } });
    const refs = await t.db.execute({ sql: 'SELECT COUNT(*) AS n FROM notebook_file_refs WHERE page_id=? AND file_id=?', args: [p.id, fileId] });
    expect(Number(refs.rows[0].n)).toBeGreaterThan(0);
    expect((await store.fileForPage(ctx(), p.id, fileId)).id).toBe(fileId);
  });

  it("refuses another page's picture the member can't reach, and malformed values", async () => {
    const p: any = await store.create(ctx(), 'page', { sectionId: section, title: 'Thief' });
    await expect(setBackground(p.id, { color: null, image: { type: 'image', fileId: 999999, fit: 'cover' } })).rejects.toMatchObject({ status: 404 });
    await expect(setBackground(p.id, { color: 'javascript:alert(1)', image: null })).rejects.toBeTruthy();
    expect((await store.page(ctx(), p.id)).canvas).not.toHaveProperty('background');
  });
});

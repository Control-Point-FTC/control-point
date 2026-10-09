import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";
import * as Y from 'yjs';
import { insertCanvasItem, canvasJSON } from '../../src/notebook/canvasModel';
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap';

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, otherTeam: number, member: number, admin: number, peer: number;
let userSession: string, adminSession: string, peerSession: string, otherSession: string;
let section: number, book: number;
const ctx = (memberId: number, source: "human" | "bruno" = "human"): NotebookContext => ({ memberId, teamId: team, source });
const doc = (text: string) => [{ id: "block", type: "paragraph", content: [{ type: "text", text }] }];
const textCanvas = (text: string) => ({version:1,objects:[0,1].map(i=>({id:`box-${i}`,type:'text',x:0,y:i*200,width:400,height:200,z:i,rotation:0,locked:false,groupId:null,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:text.slice(i* Math.ceil(text.length/2),(i+1)*Math.ceil(text.length/2))}]}]}}))});
const get = (path: string, session = userSession) => t.api(`/api/notebook${path}`, { session });
const post = (path: string, body: any, session = userSession) => t.post(`/api/notebook${path}`, body, session);
const put = (path: string, body: any, session = userSession) => t.api(`/api/notebook${path}`, { method: "PUT", body: JSON.stringify(body), session });
const del = (path: string, session = adminSession) => t.api(`/api/notebook${path}`, { method: "DELETE", session });
const page = async (body: any = {}, session = userSession) => {
  const r = await post("/pages", { sectionId: section, title: "Shared notes", content: doc("Drive tuning"), ...body }, session);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};
beforeAll(async () => {
  t = await startTestServer("cp-team-notebook-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  otherTeam = await seedTeam(t.db, "Different team");
  member = await seedMember(t.db, team, "Ana", "ana@notebook.test");
  peer = await seedMember(t.db, team, "Lee", "lee@notebook.test");
  admin = await seedMember(t.db, team, "Admin", "admin@notebook.test", "admin");
  userSession = await t.session(member);
  peerSession = await t.session(peer);
  adminSession = await t.session(admin);
  otherSession = await t.session(await seedMember(t.db, otherTeam, "Ana", "ana@notebook.test", "admin"));
  const tr = await get("/tree");
  expect(tr.status, JSON.stringify(tr.body)).toBe(200);
  book = tr.body.notebooks[0].id;
  section = tr.body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("team notebook", () => {
  it('retains older canvas bytes while opening and editing text, and rejects unsupported new writes', async () => {
    const p = await page({content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Older text'}]}]}}); const legacy = {items:[{text:'Linear slides'}]};
    await t.db.execute({sql:'UPDATE notebook_pages SET canvas=? WHERE id=?',args:[JSON.stringify(legacy),p.id]});
    const join:any = await store.sync(ctx(member),p.id,{});
    expect(join.legacyCanvas).toEqual(legacy);
    const client = new Y.Doc();
    try {
      Y.applyUpdate(client,Buffer.from(join.update,'base64'));
      const vector = Y.encodeStateVector(client); client.getMap('meta').set('title','Edited older page');
      await store.sync(ctx(member),p.id,{epoch:join.epoch,update:Buffer.from(Y.encodeStateAsUpdate(client,vector)).toString('base64')});
      expect((await store.page(ctx(member),p.id)).canvas).toEqual(legacy);
      expect((await get('/search?q=slides')).body.map((item:any)=>item.id)).toContain(p.id);
      expect((await put(`/pages/${p.id}`,{baseRevision:2,canvas:legacy})).status).toBe(422);
      expect((await post('/pages',{sectionId:section,title:'Invalid',canvas:legacy})).status).toBe(422);
    } finally { client.destroy(); }
  });
  it('persists canvas seed identities on an older shared page before the first editor changes them', async () => {
    const p = await page({content:{type:'doc',content:[{type:'paragraph'}]}}); const join:any = await store.sync(ctx(member),p.id,{});
    const old = new Y.Doc(); Y.applyUpdate(old,Buffer.from(join.update,'base64'));
    // Empty canvas roots are not encoded by Yjs, as on pre-drawing shared pages.
    await t.db.execute({sql:'UPDATE notebook_pages SET canvas=?,crdt_state=? WHERE id=?',args:[JSON.stringify(textCanvas('Existing drawing')),Y.encodeStateAsUpdate(old),p.id]}); old.destroy();
    const seeded:any = await store.sync(ctx(member),p.id,{}); const client = new Y.Doc();
    try {
      Y.applyUpdate(client,Buffer.from(seeded.update,'base64')); const vector = Y.encodeStateVector(client);
      const map = client.getMap<Y.Map<unknown>>('canvas').get('box-0')!; map.set('x',120);
      await store.sync(ctx(member),p.id,{epoch:join.epoch,update:Buffer.from(Y.encodeStateAsUpdate(client,vector)).toString('base64')});
      expect((await store.page(ctx(member),p.id)).canvas.objects.find((x:any)=>x.id==='box-0').x).toBe(120);
    } finally { client.destroy(); }
  });
  it('bounds initial reply payloads and pages older comments without duplicates or foreign access', async () => {
    const p = await page(), created = await post(`/pages/${p.id}/comments`, { body: 'First comment' });
    const threadId = created.body.threadId;
    await t.db.batch(Array.from({ length: 22 }, (_, i) => ({ sql: 'INSERT INTO notebook_comments(team_id,thread_id,author_id,body,created_at) VALUES(?,?,?,?,?)', args: [team, threadId, member, `Reply ${i + 1}`, new Date().toISOString()] })), 'write');
    const root = (await get(`/pages/${p.id}/threads`)).body.items[0]; expect(root.comments).toHaveLength(10); expect(root.commentsBefore).toBeTruthy();
    const all = [...root.comments]; let cursor = root.commentsBefore;
    while (cursor) { const more = await get(`/pages/${p.id}/threads/${threadId}/comments?before=${cursor}`); expect(more.status).toBe(200); all.unshift(...more.body.items); cursor = more.body.next; }
    expect(all).toHaveLength(23); expect(new Set(all.map(c => c.id)).size).toBe(23); expect(all[0].body).toBe('First comment');
    expect((await get(`/pages/${p.id}/threads/${threadId}/comments`, otherSession)).status).toBe(404);
    expect((await get(`/pages/${p.id}/threads?thread=${threadId}`)).body.items[0].id).toBe(threadId);
  });
  it('supports anchored discussions, replies, edits, moderation and resolve/reopen', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'drive-block' }, content: [{ type: 'text', text: 'Drive tuning' }] }] } });
    const created = await post(`/pages/${p.id}/comments`, { body: 'Check the gearing', anchor: { kind: 'text', targetId: 'drive-block', start: 0, end: 5, quote: 'Drive' }, mentions: [peer] });
    expect(created.status).toBe(200); const cid = created.body.id, tid = created.body.threadId;
    expect((await post(`/pages/${p.id}/comments`, { body: 'Looks good', threadId: tid }, peerSession)).status).toBe(200);
    let discussions = (await get(`/pages/${p.id}/threads`)).body;
    expect(discussions.items[0]).toMatchObject({ id: tid, orphaned: false, resolved: false });
    expect(discussions.items[0].comments.map((c: any) => c.author)).toEqual(['Ana', 'Lee']);
    expect((await t.patch(`/api/notebook/pages/${p.id}/comments/${cid}`, { body: 'Impersonated' }, peerSession)).status).toBe(403);
    expect((await t.patch(`/api/notebook/pages/${p.id}/comments/${cid}`, { body: 'Check the revised gearing' }, userSession)).status).toBe(200);
    expect((await put(`/pages/${p.id}/threads/${tid}/resolved`, { resolved: true })).status).toBe(200);
    expect((await post(`/pages/${p.id}/comments`, { threadId: tid, body: 'Cannot reply while resolved' })).status).toBe(409);
    await put(`/pages/${p.id}/threads/${tid}/resolved`, { resolved: false });
    expect((await del(`/pages/${p.id}/comments/${cid}`, peerSession)).status).toBe(403);
    expect((await del(`/pages/${p.id}/comments/${cid}`, adminSession)).status).toBe(200);
    discussions = (await get(`/pages/${p.id}/threads`)).body;
    expect(discussions.items[0].comments[0]).toMatchObject({ deleted: true, body: '' });
    expect(discussions.items[0].comments[1].body).toBe('Looks good');
    await put(`/pages/${p.id}`, { baseRevision: 1, content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    expect((await get(`/pages/${p.id}/threads`)).body.items[0].orphaned).toBe(true);
  });
  it('filters protected mention recipients and removes notification snippets after protection changes', async () => {
    const p = await page();
    const created = await post(`/pages/${p.id}/comments`, { body: 'Please inspect', mentions: [peer] }); expect(created.status).toBe(200);
    expect((await get('/mentions', peerSession)).body).toEqual(expect.arrayContaining([expect.objectContaining({ commentId: created.body.id, title: p.title, read: false })]));
    await put(`/mentions/${created.body.id}/read`, {}, peerSession);
    expect((await get('/mentions', peerSession)).body.find((m: any) => m.commentId === created.body.id).read).toBe(true);
    await put(`/pages/${p.id}/protection`, { protected: true }, adminSession);
    expect((await get('/mentions', peerSession)).body.some((m: any) => m.commentId === created.body.id)).toBe(false);
    expect((await get(`/pages/${p.id}/threads`, peerSession)).status).toBe(404);
    expect((await get(`/pages/${p.id}/mention-members`, adminSession)).body.every((m: any) => m.id !== peer)).toBe(true);
    const before = (await get(`/pages/${p.id}/threads`, adminSession)).body.items.length;
    expect((await post(`/pages/${p.id}/comments`, { body: 'Do not leak', mentions: [peer] }, adminSession)).status).toBe(400);
    expect((await get(`/pages/${p.id}/threads`, adminSession)).body.items.length).toBe(before);
    await expect(store.threads(ctx(admin, 'bruno'), p.id)).rejects.toMatchObject({ status: 403 });
    expect((await get(`/pages/${p.id}/threads`, otherSession)).status).toBe(404);
    expect((await put(`/mentions/${created.body.id}/read`, {}, peerSession)).status).toBe(404);
  });
  it('rejects missing anchors, foreign threads, malformed mentions and stale workspace requests atomically', async () => {
    const p = await page(), other = await page();
    const created = await post(`/pages/${p.id}/comments`, { body: 'Original' });
    expect((await post(`/pages/${other.id}/comments`, { body: 'Wrong page', threadId: created.body.threadId })).status).toBe(404);
    expect((await post(`/pages/${p.id}/comments`, { body: 'Missing target', anchor: { kind: 'block', targetId: 'gone' } })).status).toBe(409);
    expect((await post(`/pages/${p.id}/comments`, { body: 'Invalid', mentions: 'all' })).status).toBe(400);
    expect((await get(`/pages/${p.id}/threads`)).body.items).toHaveLength(1);
    expect((await t.api(`/api/notebook/pages/${p.id}/sync`, { method: 'POST', body: '{}', session: userSession, headers: { 'X-CP-Notebook-Team': String(otherTeam) } })).body).toMatchObject({ workspaceChanged: true });
  });
  it('indexes stable page/block links and filters backlinks by inherited access', async () => {
    const target = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    const linked = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See drive note', marks: [{ type: 'link', attrs: { href: `/notebook?page=${target.id}&block=stable-block` } }] }] }] };
    const visible = await page({ title: 'Public source', content: linked });
    const secret = await page({ title: 'Secret source', content: linked, protected: true }, adminSession);
    expect((await get(`/pages/${target.id}/backlinks`)).body.map((p: any) => p.id)).toEqual([visible.id]);
    expect((await get(`/pages/${target.id}/backlinks`, adminSession)).body.map((p: any) => p.id)).toEqual([visible.id, secret.id]);
    expect((await store.backlinks(ctx(admin, 'bruno'), target.id)).map(p => p.id)).toEqual([visible.id]);
    expect((await get(`/pages/${target.id}/backlinks`, otherSession)).status).toBe(404);
    await put(`/pages/${visible.id}`, { title: 'Renamed source', baseRevision: 1 });
    expect((await get(`/pages/${target.id}/backlinks`)).body[0]).toMatchObject({ title: 'Renamed source', targetBlockId: 'stable-block' });
    await put(`/pages/${visible.id}`, { content: { type: 'doc', content: [{ type: 'paragraph' }] }, baseRevision: 2 });
    expect((await get(`/pages/${target.id}/backlinks`)).body).toEqual([]);
    const copy = (await post(`/pages/${secret.id}/duplicate`, {}, adminSession)).body;
    expect((await get(`/pages/${target.id}/backlinks`, adminSession)).body.map((p: any) => p.id)).toContain(copy.id);
    await del(`/pages/${secret.id}`);
    expect((await get(`/pages/${target.id}/backlinks`, adminSession)).body.map((p: any) => p.id)).not.toContain(secret.id);
  });
  it('indexes canvas text-box links and removes them after canvas replacement', async () => {
    const target = await page();
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Related design', marks: [{ type: 'link', attrs: { href: `/notebook/p/${target.id}` } }] }] }] };
    const box = { id: 'linked-box', type: 'text', x: 10, y: 10, width: 240, height: 120, z: 1, rotation: 0, locked: false, groupId: null, content };
    const source = await page({ canvas: { version: 1, objects: [box] } });
    expect((await get(`/pages/${target.id}/backlinks`)).body.map((p: any) => p.id)).toEqual([source.id]);
    const copied = await post(`/pages/${source.id}/duplicate`, {});
    expect((await get(`/pages/${target.id}/backlinks`)).body.map((p: any) => p.id)).toContain(copied.body.id);
    await put(`/pages/${source.id}`, { canvas: { version: 1, objects: [] }, baseRevision: 1 });
    expect((await get(`/pages/${target.id}/backlinks`)).body.map((p: any) => p.id)).not.toContain(source.id);
  });
  it('updates backlinks from durable collaboration edits', async () => {
    const target = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    const source = await page({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reference' }] }] } });
    const joined = (await post(`/pages/${source.id}/sync`, {})).body;
    const d = new Y.Doc();
    try {
      Y.applyUpdate(d, Buffer.from(joined.update, 'base64'));
      const text = (d.getXmlFragment('prosemirror').get(0) as Y.XmlElement).get(0) as Y.XmlText;
      text.format(0, 9, { link: { href: `/notebook?page=${target.id}` } });
      expect((await post(`/pages/${source.id}/sync`, { epoch: joined.epoch, update: Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64') })).status).toBe(200);
      expect((await get(`/pages/${target.id}/backlinks`)).body.map((p: any) => p.id)).toContain(source.id);
    } finally { d.destroy(); }
  });
  it('uses verified teammate identities for presence and removes revoked protected viewers', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] }, protected: true }, adminSession);
    const joined = await post(`/pages/${p.id}/sync`, { clientId: 123, name: 'Impersonation' }, adminSession);
    expect(joined.body.peers).toEqual([expect.objectContaining({ clientId: 123, memberId: admin, name: 'Admin' })]);
    expect((await post(`/pages/${p.id}/sync`, { clientId: 124 }, userSession)).status).toBe(404);
    const secondAdmin = await seedMember(t.db, team, 'Second admin', 'second-admin@notebook.test', 'admin');
    const session = await t.session(secondAdmin);
    expect((await post(`/pages/${p.id}/sync`, { clientId: 124 }, session)).body.peers).toHaveLength(2);
    expect((await post(`/pages/${p.id}/sync`, { clientId: 123 }, session)).status).toBe(409);
    await t.db.execute({ sql: "UPDATE members SET account_type='student' WHERE id=?", args: [secondAdmin] });
    const current = await post(`/pages/${p.id}/sync`, { clientId: 123 }, adminSession);
    expect(current.body.peers.map((p: any) => p.memberId)).toEqual([admin]);
  });
  it('rejects malformed cursors without applying the accompanying text update', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    const joined = (await post(`/pages/${p.id}/sync`, { clientId: 234 })).body;
    const d = new Y.Doc();
    try {
      Y.applyUpdate(d, Buffer.from(joined.update, 'base64'));
      d.getMap('meta').set('title', 'Must not commit');
      expect((await post(`/pages/${p.id}/sync`, { epoch: joined.epoch, clientId: -1, update: Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64') })).status).toBe(400);
      expect((await get(`/pages/${p.id}`)).body.title).toBe(p.title);
      expect((await post(`/pages/${p.id}/sync`, { clientId: 234, cursor: { anchor: null, head: null } })).status).toBe(400);
    } finally { d.destroy(); }
  });
  it('merges concurrent rich-text edits and survives a new store instance without duplicating initial text', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drive' }] }] } });
    const joined = await post(`/pages/${p.id}/sync`, {});
    expect(joined.status, JSON.stringify(joined.body)).toBe(200);
    const a = new Y.Doc(), b = new Y.Doc();
    try {
      Y.applyUpdate(a, Buffer.from(joined.body.update, 'base64'));
      Y.applyUpdate(b, Buffer.from(joined.body.update, 'base64'));
      const textA = a.getXmlFragment('prosemirror').get(0) as Y.XmlElement;
      const textB = b.getXmlFragment('prosemirror').get(0) as Y.XmlElement;
      (textA.get(0) as Y.XmlText).insert(5, ' A');
      (textB.get(0) as Y.XmlText).insert(5, ' B');
      const results = await Promise.all([a, b].map((d, i) => post(`/pages/${p.id}/sync`, { epoch: joined.body.epoch, vector: joined.body.vector, update: Buffer.from(Y.encodeStateAsUpdate(d, Buffer.from(joined.body.vector, 'base64'))).toString('base64') }, i ? peerSession : userSession)));
      expect(results.map(r => r.status)).toEqual([200, 200]);
      const reopened = await new NotebookStore(t.db).sync(ctx(member), p.id, {});
      Y.applyUpdate(a, Buffer.from(reopened.update, 'base64'));
      Y.applyUpdate(b, Buffer.from(reopened.update, 'base64'));
      expect(yDocToProsemirrorJSON(a)).toEqual(yDocToProsemirrorJSON(b));
      const text = JSON.stringify(yDocToProsemirrorJSON(a));
      expect(text).toContain(' A'); expect(text).toContain(' B');
      expect(text.match(/Drive/g)).toHaveLength(1);
      expect((await get(`/pages/${p.id}`)).body.content).toEqual(yDocToProsemirrorJSON(a));
      expect((await get('/search?q=Drive')).body.map((h: any) => h.id)).toContain(p.id);
      const replay = await post(`/pages/${p.id}/sync`, { epoch: joined.body.epoch, update: Buffer.from(Y.encodeStateAsUpdate(a)).toString('base64') });
      expect(replay.body.revision).toBe(reopened.revision);
    } finally { a.destroy(); b.destroy(); }
  });
  it('invalidates stale collaboration clients after a revision restoration', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    const joined = (await post(`/pages/${p.id}/sync`, {})).body;
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(joined.update, 'base64'));
      doc.getMap('meta').set('title', 'Offline edit');
      await put(`/pages/${p.id}`, { baseRevision: 1, title: 'Replacement' });
      const versions = (await get(`/pages/${p.id}/versions`)).body;
      await post(`/pages/${p.id}/versions/${versions[0].id}/restore`, { baseRevision: 2 });
      expect((await post(`/pages/${p.id}/sync`, { epoch: joined.epoch, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64') })).status).toBe(409);
      expect((await get(`/pages/${p.id}`)).body.title).toBe(p.title);
    } finally { doc.destroy(); }
  });
  it('rechecks inherited protection, membership and edit access for collaboration', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    const joined = (await post(`/pages/${p.id}/sync`, {})).body;
    expect((await post(`/pages/${p.id}/sync`, {}, otherSession)).status).toBe(404);
    await expect(store.sync(ctx(admin, 'bruno'), p.id, {})).rejects.toMatchObject({ status: 403 });
    await put(`/pages/${p.id}/protection`, { protected: true }, adminSession);
    expect((await post(`/pages/${p.id}/sync`, { epoch: joined.epoch })).status).toBe(404);
    expect((await post(`/pages/${p.id}/sync`, {}, adminSession)).status).toBe(200);
    const reader = await seedMember(t.db, team, 'Read only', 'reader-sync@notebook.test');
    await expect(store.sync(ctx(reader), p.id, {})).rejects.toMatchObject({ status: 404 });
    await put(`/pages/${p.id}/protection`, { protected: false }, adminSession);
    expect((await store.sync(ctx(reader), p.id, {})).editable).toBe(false);
    await expect(store.sync(ctx(reader), p.id, { epoch: joined.epoch, update: 'AAA=' })).rejects.toMatchObject({ status: 403 });
    await t.db.execute({ sql: 'UPDATE members SET is_active=0 WHERE id=?', args: [reader] });
    await expect(store.sync(ctx(reader), p.id, {})).rejects.toMatchObject({ status: 403 });
  });
  it('rejects unsupported collaboration documents and malformed updates atomically', async () => {
    const p = await page({ content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    const joined = (await post(`/pages/${p.id}/sync`, {})).body;
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(joined.update, 'base64'));
      doc.getMap('unsupported').set('secret', 'Must not persist');
      const response = await post(`/pages/${p.id}/sync`, { epoch: joined.epoch, update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64') });
      expect(response.status).toBe(422);
      expect((await get(`/pages/${p.id}`)).body.revision).toBe(1);
      expect((await post(`/pages/${p.id}/sync`, { epoch: joined.epoch, update: 'garbage' })).status).toBe(400);
      expect((await post(`/pages/${p.id}/sync`, { epoch: joined.epoch, update: '/w==' })).status).toBe(422);
      expect((await post(`/pages/${p.id}/sync`, { vector: '/w==' })).status).toBe(422);
      expect((await post(`/pages/${p.id}/sync`, { epoch: joined.epoch, update: Buffer.from(new Uint8Array(1_000_001)).toString('base64') })).status).toBe(413);
    } finally { doc.destroy(); }
  });
  it('preserves incompatible source instead of blanking it when collaboration is opened', async () => {
    const p = await page();
    expect((await post(`/pages/${p.id}/sync`, {})).status).toBe(422);
    expect((await get(`/pages/${p.id}`)).body.content).toEqual(doc('Drive tuning'));
  });
  it("requires sign-in", async () => { expect((await t.api("/api/notebook/tree")).status).toBe(401); });
  it("shares notebooks between members and admins but isolates the same email in another team", async () => {
    const ours = (await get("/tree")).body;
    expect((await get("/tree", peerSession)).body.notebooks).toEqual(ours.notebooks);
    expect((await get("/tree", adminSession)).body.notebooks).toEqual(ours.notebooks);
    expect((await get("/tree", otherSession)).body.notebooks.map((n: any) => n.id)).not.toContain(book);
  });
  it("initializes a starter only once during simultaneous first opens", async () => {
    const fresh = await seedTeam(t.db, "Concurrent first visit");
    const person = await seedMember(t.db, fresh, "Boss", "concurrent@notebook.test", "admin");
    const context = { memberId: person, teamId: fresh };
    const results = await Promise.all([store.tree(context), store.tree(context), store.tree(context)]);
    expect(results.map(r => r.notebooks[0].id)).toEqual(Array(3).fill(results[0].notebooks[0].id));
    expect(results[0].sections).toHaveLength(1);
  });
  it("initializes roles and the starter consistently for concurrent HTTP first visits", async () => {
    const fresh = await seedTeam(t.db, "Concurrent HTTP first visit");
    const person = await seedMember(t.db, fresh, "Member", "concurrenthttp@notebook.test");
    const session = await t.session(person);
    const results = await Promise.all(Array.from({ length: 4 }, () => get("/tree", session)));
    expect(results.map(r => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(results.map(r => r.body.notebooks[0].id)).size).toBe(1);
    const roles = (await t.db.execute({ sql: "SELECT name FROM roles WHERE team_id=?", args: [fresh] })).rows;
    expect(roles.map(r => r.name).sort()).toEqual(["Admin", "Member", "Verified Member"]);
  });
  it("forbids HTTP caching of notebook response bodies", async () => {
    const res = await fetch(`${t.base}/api/notebook/tree`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("persists authored text and canvas and shares saves with another member", async () => {
    const p = await page();
    const saved = await put(`/pages/${p.id}`, { content: doc("Odometry calibration"), canvas: textCanvas("Linear slides"), baseRevision: p.revision });
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(2);
    expect((await get(`/pages/${p.id}`, peerSession)).body.content).toEqual(doc("Odometry calibration"));
    expect((await get("/search?q=slides")).body.map((p: any) => p.id)).toContain(p.id);
  });
  it("allows exactly one concurrent save from the same revision", async () => {
    const p = await page();
    const results = await Promise.all([put(`/pages/${p.id}`, { title: "One", baseRevision: 1 }), put(`/pages/${p.id}`, { title: "Two", baseRevision: 1 }, peerSession)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = results.find(r => r.status === 200)!.body;
    expect((await get(`/pages/${p.id}`)).body.title).toBe(winner.title);
    expect(results.find(r => r.status === 409)!.body.page.revision).toBe(2);
  });
  it("rejects unconditional overwrites", async () => {
    const p = await page();
    expect((await put(`/pages/${p.id}`, { title: "No revision" })).status).toBe(409);
  });
  it("retains authors and restores a revision without deleting the current version", async () => {
    const p = await page({ title: "Original" });
    await put(`/pages/${p.id}`, { title: "Edited", baseRevision: 1 }, peerSession);
    const versions = (await get(`/pages/${p.id}/versions`)).body;
    expect(versions[0].authorId).toBe(member);
    const restored = await post(`/pages/${p.id}/versions/${versions[0].id}/restore`, { baseRevision: 2 });
    expect(restored.body).toMatchObject({ title: "Original", revision: 3, updatedBy: member });
    expect((await get(`/pages/${p.id}/versions`)).body).toHaveLength(2);
    expect((await post(`/pages/${p.id}/versions/${versions[0].id}/restore`, { baseRevision: 2 })).status).toBe(409);
  });
  it("escapes search wildcards", async () => {
    const p = await page({ content: doc("100%_literal") });
    expect((await get("/search?q=100%25_literal")).body.map((p: any) => p.id)).toEqual([p.id]);
    expect((await get("/search?q=%25")).body.every((p: any) => p.snippet.includes("%"))).toBe(true);
  });
  it("does not index attachment metadata", async () => {
    await page({ content: [{ attachments: [{ text: "hiddenattachmentindex" }], text: "Ordinary note" }] });
    expect((await get("/search?q=hiddenattachmentindex")).body).toEqual([]);
  });
  it("applies the search result limit after protection filtering across batches", async () => {
    const visible = await page({ title: "searchlimitunique" });
    for (let i = 0; i < 55; i++) await page({ title: "searchlimitunique", protected: true }, adminSession);
    expect((await get("/search?q=searchlimitunique&limit=1")).body.map((p: any) => p.id)).toEqual([visible.id]);
    expect((await store.search(ctx(admin, "bruno"), "searchlimitunique", 1)).map(p => p.id)).toEqual([visible.id]);
  });
  it("checks fresh membership on every store operation", async () => {
    const person = await seedMember(t.db, team, "Leaving", "leaving@notebook.test", "admin");
    const context = ctx(person);
    await store.tree(context);
    await t.db.execute({ sql: "UPDATE members SET is_active=0 WHERE id=?", args: [person] });
    await expect(store.export(context)).rejects.toMatchObject({ status: 403 });
  });
  it("treats read, edit, organize and delete as independent capabilities", async () => {
    const reader = await seedMember(t.db, team, "Reader", "reader@notebook.test");
    const context = ctx(reader);
    expect((await store.tree(context)).permissions).toEqual({ read: true, edit: false, organize: false, delete: false, protect: false });
    await expect(store.create(context, "page", { sectionId: section, title: "No" })).rejects.toMatchObject({ status: 403 });
    const role = await t.db.execute({ sql: "INSERT INTO roles(team_id,name,permissions) VALUES(?, 'Notebook editor', '[\"edit_notebook\"]')", args: [team] });
    await t.db.execute({ sql: "INSERT INTO member_roles(member_id,role_id) VALUES(?,?)", args: [reader, Number(role.lastInsertRowid)] });
    const p = await store.create(context, "page", { sectionId: section, title: "Allowed" });
    await expect(store.create(context, "notebook", { title: "No organization" })).rejects.toMatchObject({ status: 403 });
    await expect(store.remove(context, "page", p.id)).rejects.toMatchObject({ status: 403 });
    await t.db.execute({ sql: "DELETE FROM member_roles WHERE member_id=?", args: [reader] });
    await expect(store.save(context, p.id, { title: "Revoked", baseRevision: 1 })).rejects.toMatchObject({ status: 403 });
  });
  it.each(["read", "save", "delete", "versions", "protect"])("rejects foreign-team page %s by direct ID", async action => {
    const p = await page();
    const route = `/pages/${p.id}`;
    const r = action === "read" ? await get(route, otherSession)
      : action === "save" ? await put(route, { title: "Foreign", baseRevision: 1 }, otherSession)
      : action === "delete" ? await del(route, otherSession)
      : action === "versions" ? await get(`${route}/versions`, otherSession)
      : await put(`${route}/protection`, { protected: true }, otherSession);
    expect(r.status).toBe(404);
  });
  it("rejects foreign parents and sections", async () => {
    const p = await page();
    expect((await post("/pages", { sectionId: section, title: "Foreign" }, otherSession)).status).toBe(404);
    const otherSection = (await get("/tree", otherSession)).body.sections[0].id;
    expect((await post("/pages", { sectionId: otherSection, parentId: p.id, title: "Foreign" }, otherSession)).status).toBe(404);
  });
  it("enforces six page levels", async () => {
    let parent = await page();
    for (let depth = 2; depth <= 6; depth++) parent = await page({ parentId: parent.id });
    expect((await post("/pages", { sectionId: section, parentId: parent.id, title: "Too deep" })).status).toBe(400);
  });
  it("moves a subtree between sections, reorders siblings and rejects cycles", async () => {
    const target = (await post("/sections", { notebookId: book, title: "Move target" })).body;
    const parent = await page(), child = await page({ parentId: parent.id });
    expect((await post("/move", { kind: "page", id: parent.id, to: { parentId: child.id }, index: 0 })).status).toBe(400);
    expect((await post("/move", { kind: "page", id: parent.id, to: { sectionId: target.id }, index: 0 })).status).toBe(200);
    expect((await get(`/pages/${child.id}`)).body).toMatchObject({ sectionId: target.id, parentId: parent.id });
    const sibling = await page({ sectionId: target.id });
    const moved = await post("/move", { kind: "page", id: sibling.id, to: {}, index: 0 });
    expect(moved.body.pages.filter((p: any) => p.sectionId === target.id && !p.parentId).map((p: any) => p.id)).toEqual([sibling.id, parent.id]);
  });
  it("rejects moves exceeding the depth limit, including a whole subtree", async () => {
    let target = await page();
    for (let i = 2; i <= 5; i++) target = await page({ parentId: target.id });
    const root = await page();
    await page({ parentId: root.id });
    expect((await post("/move", { kind: "page", id: root.id, to: { parentId: target.id } })).status).toBe(400);
    expect((await get(`/pages/${root.id}`)).body.parentId).toBeNull();
  });
  it("retains inherited protection on copies and moves out of a protected section", async () => {
    const secret = (await post("/sections", { notebookId: book, title: "Move secret", protected: true }, adminSession)).body;
    const original = await page({ sectionId: secret.id }, adminSession);
    const child = await page({ sectionId: secret.id, parentId: original.id }, adminSession);
    expect((await get(`/pages/${child.id}`, adminSession)).body).toMatchObject({ protected: true, ownProtected: false });
    const copy = (await post(`/pages/${original.id}/duplicate`, {}, adminSession)).body;
    expect(copy.protected).toBe(true);
    expect((await post("/move", { kind: "page", id: original.id, to: { sectionId: section } }, adminSession)).status).toBe(200);
    expect((await get(`/pages/${original.id}`)).status).toBe(404);
    expect((await get(`/pages/${child.id}`)).status).toBe(404);
    expect((await post(`/pages/${original.id}/duplicate`, {})).status).toBe(404);
    await expect(store.move(ctx(admin, "bruno"), "page", original.id, { sectionId: section }, 0)).rejects.toMatchObject({ status: 403 });
  });
  it("duplicates one page without silently duplicating its descendants", async () => {
    const original = await page({ title: "Original to copy" });
    await page({ parentId: original.id });
    const copy = (await post(`/pages/${original.id}/duplicate`, {})).body;
    expect(copy).toMatchObject({ title: "Original to copy (copy)", content: original.content, parentId: null });
    expect((await get("/tree")).body.pages.filter((p: any) => p.parentId === copy.id)).toEqual([]);
  });
  it("snapshots authored revisions before a move without attributing unchanged text to the organizer", async () => {
    const original = await page({ title: "Ana authored" });
    const child = await page({ parentId: original.id, title: "Ana child" });
    expect((await post("/move", { kind: "page", id: original.id, to: {}, index: 0 }, peerSession)).status).toBe(200);
    for (const p of [original, child]) {
      expect((await get(`/pages/${p.id}`)).body.updatedBy).toBe(member);
      expect((await get(`/pages/${p.id}/versions`)).body).toEqual([expect.objectContaining({ revision: 1, authorId: member })]);
      await put(`/pages/${p.id}`, { title: "Admin's edit", baseRevision: 2 }, adminSession);
      expect((await get(`/pages/${p.id}/versions`)).body).toEqual([
        expect.objectContaining({ revision: 2, authorId: member }), expect.objectContaining({ revision: 1, authorId: member }),
      ]);
    }
  });
  it("frees active page capacity when a whole notebook is trashed", async () => {
    const fresh = await seedTeam(t.db, "Notebook capacity");
    const person = await seedMember(t.db, fresh, "Boss", "capacity@notebook.test", "admin");
    const context = { memberId: person, teamId: fresh };
    const initial = await store.tree(context);
    const oldSection = initial.sections[0].id;
    await t.db.execute({ sql: `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<20000)
      INSERT INTO notebook_pages(team_id,section_id,title,created_at,updated_at)
      SELECT ?,?,'Capacity page','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z' FROM seq`, args: [fresh, oldSection] });
    await expect(store.create(context, "page", { sectionId: oldSection, title: "Full" })).rejects.toMatchObject({ message: "Page limit reached" });
    const source = Number((await t.db.execute({ sql: "SELECT MIN(id) AS id FROM notebook_pages WHERE team_id=?", args: [fresh] })).rows[0].id);
    await expect(store.duplicate(context, source)).rejects.toMatchObject({ message: "Page limit reached" });
    await store.remove(context, "notebook", initial.notebooks[0].id);
    const replacement = await store.create(context, "notebook", { title: "Replacement" });
    const target = await store.create(context, "section", { notebookId: replacement.id, title: "Replacement section" });
    const p = await store.create(context, "page", { sectionId: target.id, title: "Allowed again" });
    expect((await store.duplicate(context, p.id)).title).toBe("Allowed again (copy)");
  });
  it("bounds the total export response rather than accumulating unlimited page bodies", async () => {
    const fresh = await seedTeam(t.db, "Large export");
    const person = await seedMember(t.db, fresh, "Boss", "exportlimit@notebook.test", "admin");
    const context = { memberId: person, teamId: fresh };
    const tr = await store.tree(context);
    for (let i = 0; i < 2; i++) await store.create(context, "page", { sectionId: tr.sections[0].id, title: "Large", content: doc("x".repeat(1_800_000)), canvas: textCanvas("x".repeat(3_600_000)) });
    await expect(store.export(context)).rejects.toMatchObject({ status: 413 });
    expect((await store.tree(context)).pages).toHaveLength(2);
  });
  it.each(["section", "page"] as const)("inherits %s protection for members and Bruno, while admitting the team's admin", async kind => {
    const s = kind === "section" ? (await post("/sections", { notebookId: book, title: "Secret section", protected: true }, adminSession)).body.id : section;
    const parent = await page({ sectionId: s, title: `protected-${kind}-unique`, protected: kind === "page" }, adminSession);
    const child = await page({ sectionId: s, parentId: parent.id, title: `secretchild-${kind}-unique` }, adminSession);
    await put(`/pages/${child.id}`, { baseRevision: 1, content: doc("Secret revision") }, adminSession);
    for (const p of [parent, child]) {
      expect((await get(`/pages/${p.id}`)).status).toBe(404);
      expect((await get(`/pages/${p.id}/versions`)).status).toBe(404);
      expect((await put(`/pages/${p.id}`, { baseRevision: 1, title: "No" })).status).toBe(404);
      expect((await get(`/pages/${p.id}`, adminSession)).status).toBe(200);
      await expect(store.page(ctx(admin, "bruno"), p.id)).rejects.toMatchObject({ status: 404 });
      await expect(store.versions(ctx(admin, "bruno"), p.id)).rejects.toMatchObject({ status: 404 });
    }
    expect((await get(`/search?q=unique`)).body.map((p: any) => p.id)).not.toContain(parent.id);
    expect((await get("/tree")).body.pages.map((p: any) => p.id)).not.toContain(child.id);
    expect((await get("/export")).body.pages.map((p: any) => p.id)).not.toContain(child.id);
    expect((await store.export(ctx(admin, "bruno"))).pages.map(p => p.id)).not.toContain(child.id);
    expect((await store.search(ctx(admin, "bruno"), "unique")).map(p => p.id)).not.toContain(parent.id);
  });
  it("never accepts a client admin/source override", async () => {
    expect((await post("/pages", { sectionId: section, title: "No", protected: true, admin: true, source: "human" })).status).toBe(403);
    expect((await put(`/sections/${section}/protection`, { protected: true, admin: true })).status).toBe(403);
  });
  it("changes protection immediately without passwords or unlocks", async () => {
    const p = await page();
    expect((await put(`/pages/${p.id}/protection`, { protected: true }, adminSession)).status).toBe(200);
    expect((await get(`/pages/${p.id}`)).status).toBe(404);
    await put(`/pages/${p.id}/protection`, { protected: false }, adminSession);
    expect((await get(`/pages/${p.id}`)).status).toBe(200);
    expect((await post(`/sections/${section}/unlock`, { password: "anything" })).status).toBe(404);
  });
  it("Bruno can read permitted content but never bypass write confirmation through the store", async () => {
    const p = await page();
    expect((await store.page(ctx(admin, "bruno"), p.id)).title).toBe(p.title);
    await expect(store.save(ctx(admin, "bruno"), p.id, { title: "No direct AI writes", baseRevision: 1 })).rejects.toMatchObject({ status: 403 });
  });
  it("soft deletes an ancestor and hides its descendants from tree, search and direct access", async () => {
    const parent = await page({ title: "Trash ancestor" });
    const child = await page({ parentId: parent.id, title: "trashchildunique" });
    expect((await del(`/pages/${parent.id}`)).status).toBe(200);
    expect((await get(`/pages/${child.id}`)).status).toBe(404);
    expect((await get("/search?q=trashchildunique")).body).toEqual([]);
    expect((await get("/tree")).body.pages.map((p: any) => p.id)).not.toContain(child.id);
    expect((await t.db.execute({ sql: "SELECT content FROM notebook_pages WHERE id=?", args: [child.id] })).rows).toHaveLength(1);
  });
  it("does not let an ordinary deleter delete a protected descendant through its public ancestor", async () => {
    const person = await seedMember(t.db, team, "Deleter", "deleter@notebook.test");
    const role = await t.db.execute({ sql: "INSERT INTO roles(team_id,name,permissions) VALUES(?, 'Deleter', '[\"delete_notebook\"]')", args: [team] });
    await t.db.execute({ sql: "INSERT INTO member_roles(member_id,role_id) VALUES(?,?)", args: [person, Number(role.lastInsertRowid)] });
    const parent = await page();
    await page({ parentId: parent.id, protected: true }, adminSession);
    await expect(store.remove(ctx(person), "page", parent.id)).rejects.toMatchObject({ status: 404 });
    expect((await get(`/pages/${parent.id}`)).status).toBe(200);
  });
  it("keeps team content after its author is deleted", async () => {
    const author = await seedMember(t.db, team, "Temporary author", "temporary@notebook.test", "admin");
    const p = await store.create(ctx(author), "page", { sectionId: section, title: "Team retains this" });
    await t.db.execute({ sql: "DELETE FROM members WHERE id=?", args: [author] });
    expect((await get(`/pages/${p.id}`)).body).toMatchObject({ title: "Team retains this", createdBy: null, updatedBy: null });
  });
  it("deleting a workspace removes all of its notebook rows and preserves other teams", async () => {
    const newTeam = await seedTeam(t.db, "Delete notebook team");
    const boss = await seedMember(t.db, newTeam, "Boss", "deleteworkspace@notebook.test", "admin");
    const session = await t.session(boss);
    const context = { memberId: boss, teamId: newTeam };
    const tr = await store.tree(context);
    const p = await store.create(context, "page", { sectionId: tr.sections[0].id, title: "Cleanup" });
    await store.save(context, p.id, { title: "Cleanup saved", baseRevision: 1 });
    const r = await t.api(`/api/teams/${newTeam}`, { method: "DELETE", session });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    for (const table of ["notebook_versions", "notebook_pages", "notebook_sections", "notebook_books"]) expect((await t.db.execute({ sql: `SELECT id FROM ${table} WHERE team_id=?`, args: [newTeam] })).rows).toEqual([]);
    expect((await get("/tree")).body.notebooks.map((n: any) => n.id)).toContain(book);
  });
  it.each(["", "x".repeat(201), 22, null])("rejects invalid titles %s without silently truncating", async value => {
    expect((await post("/pages", { sectionId: section, title: value })).status).toBe(400);
  });
  it("validates document sizes as UTF-8 bytes", async () => {
    const p = await page();
    expect((await put(`/pages/${p.id}`, { baseRevision: 1, content: doc("é".repeat(1_010_000)) })).status).toBe(413);
    expect((await get(`/pages/${p.id}`)).body.revision).toBe(1);
  });
  it("accepts text and canvas within both field limits over HTTP, even when their sum exceeds 5 MiB", async () => {
    const fresh = await seedTeam(t.db, "Large HTTP document");
    const person = await seedMember(t.db, fresh, "Boss", "largehttp@notebook.test", "admin");
    const session = await t.session(person);
    const sectionId = (await get("/tree", session)).body.sections[0].id;
    const content = doc("x".repeat(1_800_000)), canvas = textCanvas("x".repeat(3_600_000));
    const created = await post("/pages", { sectionId, title: "Within field limits", content, canvas }, session);
    expect(created.status, JSON.stringify(created.body?.error)).toBe(200);
    const saved = await put(`/pages/${created.body.id}`, { content, canvas, baseRevision: 1 }, session);
    expect(saved.status, JSON.stringify(saved.body?.error)).toBe(200);
    expect(saved.body.revision).toBe(2);
  });
});

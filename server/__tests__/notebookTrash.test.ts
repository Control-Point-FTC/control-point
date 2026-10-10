import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {NotebookStore,type NotebookContext} from '../notebook';
import {seedMember,seedTeam,startTestServer,type TestServer} from './helpers/testServer';
import {withSession} from './helpers/session';
vi.setConfig({testTimeout:30000});
let server:TestServer,store:NotebookStore,team:number,other:number,admin:number,foreign:number,deleter:number,reader:number,section:number,role:number,session:string;
const ctx=(memberId=admin,source:'human'|'bruno'='human'):NotebookContext=>({memberId,teamId:team,source});
const page=(body:any={})=>store.create(ctx(),'page',{sectionId:section,title:'Deleted experiment',...body});
beforeAll(async()=>{
  server=await startTestServer('cp-notebook-trash-');store=new NotebookStore(server.db);
  team=await seedTeam(server.db,'Trash fixture');other=await seedTeam(server.db,'Different team');
  admin=await seedMember(server.db,team,'Deleting admin','trash-admin@test','admin');
  foreign=await seedMember(server.db,other,'Foreign private name','foreign-trash@test','admin');
  deleter=await seedMember(server.db,team,'Deleter','trash-deleter@test');reader=await seedMember(server.db,team,'Reader','trash-reader@test');
  session=await server.session(admin);section=(await server.api('/api/notebook/tree',{session})).body.sections[0].id;
  const grant=await server.db.execute({sql:"INSERT INTO roles(team_id,name,permissions) VALUES(?,'Trash manager','[\"delete_notebook\"]')",args:[team]});role=Number(grant.lastInsertRowid);
  await server.db.execute({sql:'INSERT INTO member_roles(member_id,role_id) VALUES(?,?)',args:[deleter,role]});
},120000);
afterAll(async()=>{await server?.stop();});
describe('notebook trash metadata and visibility',()=>{
  it('attributes a tombstone to its deleting member and lists only the deleted root',async()=>{
    const parent=await page(),child=await page({parentId:parent.id,title:'Nested experiment'});
    await store.remove(ctx(),'page',child.id);await store.remove(ctx(),'page',parent.id);
    const listing=await store.trash(ctx());
    expect(listing.items.find(item=>item.id===parent.id&&item.kind==='page')).toMatchObject({deletedBy:'Deleting admin',deletedById:admin,deletedAt:expect.any(String)});
    expect(listing.items.some(item=>item.id===child.id&&item.kind==='page')).toBe(false);
    expect(listing.retention).toContain('Automatic expiration is disabled');
  });
  it('hides direct and inherited protected titles from ordinary deleters and rejects Bruno',async()=>{
    const protectedPage=await page({protected:true,title:'Admin secret'}),child=await page({parentId:protectedPage.id,title:'Inherited secret'});
    await store.remove(ctx(),'page',child.id);
    expect((await store.trash(ctx(deleter))).items.some(item=>item.title==='Inherited secret')).toBe(false);
    expect((await store.trash(ctx())).items.some(item=>item.title==='Inherited secret')).toBe(true);
    await store.remove(ctx(),'page',protectedPage.id);
    expect((await store.trash(ctx(deleter))).items.some(item=>item.title==='Admin secret')).toBe(false);
    await expect(store.trash(ctx(admin,'bruno'))).rejects.toMatchObject({status:403});
  });
  it('does not expose another team or its author names through corrupted attribution',async()=>{
    const target=await page({title:'Public deleted page'});await store.remove(ctx(),'page',target.id);
    await server.db.execute({sql:'UPDATE notebook_pages SET deleted_by=? WHERE id=?',args:[foreign,target.id]});
    expect((await store.trash(ctx())).items.find(item=>item.id===target.id&&item.kind==='page')).toMatchObject({deletedBy:'Unknown or former team member',deletedById:null});
    const foreignCtx={memberId:foreign,teamId:other};const tree=await store.tree(foreignCtx);
    const otherPage=await store.create(foreignCtx,'page',{sectionId:tree.sections[0].id,title:'Other workspace secret'});await store.remove(foreignCtx,'page',otherPage.id);
    expect((await store.trash(ctx())).items.some(item=>item.title==='Other workspace secret')).toBe(false);
  });
  it('requires a current delete grant and returns no-store responses',async()=>{
    await expect(store.trash(ctx(reader))).rejects.toMatchObject({status:403});
    await server.db.execute({sql:'DELETE FROM member_roles WHERE member_id=? AND role_id=?',args:[deleter,role]});
    await expect(store.trash(ctx(deleter))).rejects.toMatchObject({status:403});
    const response=await fetch(`${server.base}/api/notebook/trash`,{headers:withSession(new Headers(),session)});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('continues past 100 entries with equal deletion timestamps and rejects malformed cursors',async()=>{
    await server.db.batch(Array.from({length:103},(_,index)=>({sql:"INSERT INTO notebook_pages(team_id,section_id,title,created_at,updated_at,deleted_at,deleted_by) VALUES(?,?,?,'2030-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z',?)",args:[team,section,`Pagination ${index}`,admin]})),'write');
    const first=(await server.api('/api/notebook/trash',{session})).body;
    expect(first.items).toHaveLength(100);expect(first.hasMore).toBe(true);expect(first.nextCursor).toEqual(expect.any(String));
    const second=(await server.api(`/api/notebook/trash?cursor=${encodeURIComponent(first.nextCursor)}`,{session})).body;
    expect(second.hasMore).toBe(false);expect(second.nextCursor).toBeNull();
    const all=[...first.items,...second.items].filter((item:any)=>item.title.startsWith('Pagination '));
    expect(all).toHaveLength(103);expect(new Set(all.map((item:any)=>item.id)).size).toBe(103);
    expect((await server.api('/api/notebook/trash?cursor=bad',{session})).status).toBe(400);
    await expect(store.trash(ctx(reader),first.nextCursor)).rejects.toMatchObject({status:403});
  });
  it('collapses a trashed section and notebook into their own root entries',async()=>{
    const tree=await store.tree(ctx()),book=tree.notebooks[0].id;
    const extra=await store.create(ctx(),'section',{notebookId:book,title:'Old section'});
    const nested=await page({sectionId:extra.id});await store.remove(ctx(),'page',nested.id);await store.remove(ctx(),'section',extra.id);
    expect((await store.trash(ctx())).items.some(item=>item.kind==='page'&&item.id===nested.id)).toBe(false);
    await store.remove(ctx(),'notebook',book);
    const items=(await store.trash(ctx())).items;expect(items.some(item=>item.kind==='notebook'&&item.id===book)).toBe(true);expect(items.some(item=>item.kind!=='notebook')).toBe(false);
  });
});

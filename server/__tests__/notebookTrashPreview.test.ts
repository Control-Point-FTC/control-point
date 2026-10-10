import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {NotebookStore} from '../notebook';
import {seedMember,seedTeam,startTestServer,type TestServer} from './helpers/testServer';
let server:TestServer,store:NotebookStore,team:number,other:number,admin:number,deleter:number,foreign:number,section:number,session:string,role:number;
const ctx=(memberId=admin)=>({memberId,teamId:team});
beforeAll(async()=>{
  server=await startTestServer('cp-notebook-trash-preview-test-');store=new NotebookStore(server.db);team=await seedTeam(server.db,'Preview team');other=await seedTeam(server.db,'Other preview team');
  admin=await seedMember(server.db,team,'Admin','preview-admin@test','admin');deleter=await seedMember(server.db,team,'Deleter','preview-deleter@test');foreign=await seedMember(server.db,other,'Foreign','preview-foreign@test','admin');
  session=await server.session(admin);section=(await server.api('/api/notebook/tree',{session})).body.sections[0].id;
  const grant=await server.db.execute({sql:"INSERT INTO roles(team_id,name,permissions) VALUES(?,'Trash preview','[\"delete_notebook\"]')",args:[team]});role=Number(grant.lastInsertRowid);await server.db.execute({sql:'INSERT INTO member_roles(member_id,role_id) VALUES(?,?)',args:[deleter,role]});
},120000);
afterAll(async()=>{await server?.stop();});
describe('explicit retained trash content reads',()=>{
  it('returns retained notes through the scoped route and rejects active pages',async()=>{
    const target=await store.create(ctx(),'page',{sectionId:section,title:'Retained notes',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original measurements'}]}]}});
    await expect(store.trashPage(ctx(),target.id)).rejects.toMatchObject({status:404});await store.remove(ctx(),'page',target.id);
    const result=await server.api(`/api/notebook/trash/pages/${target.id}`,{session});expect(result.status).toBe(200);expect(result.body).toMatchObject({title:'Retained notes',deletedAt:expect.any(String)});expect(JSON.stringify(result.body.content)).toContain('Original measurements');
    expect(await store.trashPage(ctx(deleter),target.id)).toMatchObject({id:target.id});
  });
  it('blocks directly protected and inherited protected tombstones for ordinary members and Bruno',async()=>{
    const parent=await store.create(ctx(),'page',{sectionId:section,title:'Secret ancestor',protected:true}),child=await store.create(ctx(),'page',{sectionId:section,parentId:parent.id,title:'Secret retained child'});
    await store.remove(ctx(),'page',child.id);await store.remove(ctx(),'page',parent.id);
    for(const id of [parent.id,child.id]){
      expect(await store.trashPage(ctx(),id)).toMatchObject({protected:true});await expect(store.trashPage(ctx(deleter),id)).rejects.toMatchObject({status:404});await expect(store.trashPage({...ctx(),source:'bruno'},id)).rejects.toMatchObject({status:403});
    }
  });
  it('does not disclose a foreign team tombstone by direct ID',async()=>{
    const foreignCtx={memberId:foreign,teamId:other},tree=await store.tree(foreignCtx),target=await store.create(foreignCtx,'page',{sectionId:tree.sections[0].id,title:'Foreign secret'});await store.remove(foreignCtx,'page',target.id);
    await expect(store.trashPage(ctx(),target.id)).rejects.toMatchObject({status:404});
  });
  it('rechecks revoked grants and stops exposing an item after restoration',async()=>{
    const target=await store.create(ctx(),'page',{sectionId:section,title:'Temporary deleted note'});await store.remove(ctx(),'page',target.id);
    await server.db.execute({sql:'DELETE FROM member_roles WHERE member_id=? AND role_id=?',args:[deleter,role]});await expect(store.trashPage(ctx(deleter),target.id)).rejects.toMatchObject({status:403});
    await store.restore(ctx(),'page',target.id);await expect(store.trashPage(ctx(),target.id)).rejects.toMatchObject({status:404});
  });
});

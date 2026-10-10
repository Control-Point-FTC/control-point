import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {NotebookStore,type NotebookContext} from '../notebook';
import {seedMember,seedTeam,startTestServer,type TestServer} from './helpers/testServer';
vi.setConfig({testTimeout:30000});
let server:TestServer,store:NotebookStore,team:number,admin:number,member:number,foreign:number,section:number,book:number,session:string;
const ctx=(memberId=admin,source:'human'|'bruno'='human'):NotebookContext=>({memberId,teamId:team,source});
const page=(body:any={})=>store.create(ctx(),'page',{sectionId:section,title:'Retained experiment',...body});
async function retainedState(ids:number[]){
  const slots=ids.map(()=>'?').join(',');
  const rows=(await server.db.execute({sql:`SELECT * FROM notebook_pages WHERE id IN (${slots}) ORDER BY id`,args:ids})).rows;
  const versions=(await server.db.execute({sql:`SELECT * FROM notebook_versions WHERE page_id IN (${slots}) ORDER BY id`,args:ids})).rows;
  return {rows,versions};
}
beforeAll(async()=>{
  server=await startTestServer('cp-notebook-recovery-');store=new NotebookStore(server.db);
  team=await seedTeam(server.db,'Recovery fixture');admin=await seedMember(server.db,team,'Admin','recovery-admin@test','admin');member=await seedMember(server.db,team,'Member','recovery-member@test');
  const other=await seedTeam(server.db,'Foreign fixture');foreign=await seedMember(server.db,other,'Foreign admin','recovery-foreign@test','admin');
  session=await server.session(admin);const tree=(await server.api('/api/notebook/tree',{session})).body;section=tree.sections[0].id;book=tree.notebooks[0].id;
},120000);
afterAll(async()=>{await server?.stop();});
describe('safe notebook trash recovery',()=>{
  it('restores a page subtree and content without reviving independently deleted descendants',async()=>{
    const parent=await page({content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Keep these engineering notes'}]}]}});
    const retained=await store.page(ctx(),parent.id);
    const child=await page({parentId:parent.id}),trashed=await page({parentId:parent.id});
    await store.remove(ctx(),'page',trashed.id);await store.remove(ctx(),'page',parent.id);
    const response=await server.post(`/api/notebook/pages/${parent.id}/restore`,{},session);
    expect(response.status).toBe(200);expect(response.body.tree.pages.map((p:any)=>p.id)).toEqual(expect.arrayContaining([parent.id,child.id]));
    expect(response.body.tree.pages.some((p:any)=>p.id===trashed.id)).toBe(false);
    expect((await store.page(ctx(),parent.id)).content).toEqual(retained.content);
    expect((await store.trash(ctx())).items.some(item=>item.id===parent.id&&item.kind==='page')).toBe(false);
    await expect(store.restore(ctx(),'page',parent.id)).rejects.toMatchObject({status:409});
  });
  it('requires an explicit active destination when the original parent is deleted',async()=>{
    const parent=await page(),child=await page({parentId:parent.id});
    await store.remove(ctx(),'page',child.id);await store.remove(ctx(),'page',parent.id);
    await expect(store.restore(ctx(),'page',child.id)).rejects.toMatchObject({status:409,extra:{destinationRequired:true}});
    await store.restore(ctx(),'page',child.id,{sectionId:section,parentId:null});
    expect(await store.page(ctx(),child.id)).toMatchObject({parentId:null,sectionId:section});
    await expect(store.page(ctx(),parent.id)).rejects.toMatchObject({status:404});
  });
  it('retains inherited admin protection after moving recovery into a public section',async()=>{
    const secret=await store.create(ctx(),'section',{notebookId:book,title:'Protected source',protected:true});
    const target=await page({sectionId:secret.id});await store.remove(ctx(),'page',target.id);await store.remove(ctx(),'section',secret.id);
    await store.restore(ctx(),'page',target.id,{sectionId:section,parentId:null});
    expect(await store.page(ctx(),target.id)).toMatchObject({ownProtected:true,protected:true});
    await expect(store.page(ctx(member),target.id)).rejects.toMatchObject({status:404});
    await expect(store.page(ctx(admin,'bruno'),target.id)).rejects.toMatchObject({status:404});
  });
  it('rotates restored descendants collaboration epochs and retains the saved revision',async()=>{
    const parent=await page(),child=await page({parentId:parent.id});
    const before=await store.sync(ctx(),child.id,{});await store.remove(ctx(),'page',parent.id);await store.restore(ctx(),'page',parent.id);
    await expect(store.sync(ctx(),child.id,{epoch:before.epoch})).rejects.toMatchObject({status:409});
    const after=await store.sync(ctx(),child.id,{});expect(after.epoch).not.toBe(before.epoch);expect(after.revision).toBeGreaterThan(before.revision);
    expect(await store.versions(ctx(),child.id)).toEqual(expect.arrayContaining([expect.objectContaining({revision:before.revision})]));
  });
  it('enforces current human grants, team scope, and destination protection',async()=>{
    const target=await page();await store.remove(ctx(),'page',target.id);
    await expect(store.restore(ctx(member),'page',target.id)).rejects.toMatchObject({status:403});
    await expect(store.restore(ctx(admin,'bruno'),'page',target.id)).rejects.toMatchObject({status:403});
    await expect(store.restore({memberId:foreign,teamId:(await server.db.execute({sql:'SELECT team_id FROM members WHERE id=?',args:[foreign]})).rows[0].team_id as number},'page',target.id)).rejects.toMatchObject({status:404});
    const grant=await server.db.execute({sql:"INSERT INTO roles(team_id,name,permissions) VALUES(?,'Recovery manager','[\"delete_notebook\",\"organize_notebook\"]')",args:[team]});
    await server.db.execute({sql:'INSERT INTO member_roles(member_id,role_id) VALUES(?,?)',args:[member,Number(grant.lastInsertRowid)]});
    const secret=await store.create(ctx(),'section',{notebookId:book,title:'Admin destination',protected:true});
    await expect(store.restore(ctx(member),'page',target.id,{sectionId:secret.id})).rejects.toMatchObject({status:404});
    await store.restore(ctx(member),'page',target.id);
    const next=await page();await store.remove(ctx(),'page',next.id);await server.db.execute({sql:'DELETE FROM member_roles WHERE member_id=?',args:[member]});
    await expect(store.restore(ctx(member),'page',next.id)).rejects.toMatchObject({status:403});
  });
  it('rejects a destination inside its own subtree without changing the tombstone',async()=>{
    const parent=await page(),child=await page({parentId:parent.id});await store.remove(ctx(),'page',parent.id);
    await expect(store.restore(ctx(),'page',parent.id,{parentId:child.id})).rejects.toMatchObject({status:400});
    await expect(store.page(ctx(),parent.id)).rejects.toMatchObject({status:404});
  });
  it('restores sections and notebooks while retaining independent child deletion',async()=>{
    const otherBook=await store.create(ctx(),'notebook',{title:'Recovery book'}),otherSection=await store.create(ctx(),'section',{notebookId:otherBook.id,title:'Recovery section'});
    const active=await page({sectionId:otherSection.id}),deleted=await page({sectionId:otherSection.id});await store.remove(ctx(),'page',deleted.id);await store.remove(ctx(),'section',otherSection.id);await store.remove(ctx(),'notebook',otherBook.id);
    await expect(store.restore(ctx(),'section',otherSection.id)).rejects.toMatchObject({status:409,extra:{destinationRequired:true}});
    await store.restore(ctx(),'notebook',otherBook.id);await store.restore(ctx(),'section',otherSection.id);
    expect((await store.tree(ctx())).pages.map(p=>p.id)).toContain(active.id);await expect(store.page(ctx(),deleted.id)).rejects.toMatchObject({status:404});
  });
  it('rolls back an over-depth relocation and permits the exact six-level boundary',async()=>{
    let last:number|null=null,depthFour=0;
    for(let depth=1;depth<=5;depth++){const next=await page({parentId:last});last=next.id;if(depth===4)depthFour=next.id;}
    const root=await page(),child=await page({parentId:root.id});await store.sync(ctx(),root.id,{});await store.sync(ctx(),child.id,{});await store.remove(ctx(),'page',root.id);
    const before=await retainedState([root.id,child.id]);
    await expect(store.restore(ctx(),'page',root.id,{parentId:last})).rejects.toMatchObject({status:400,message:'Maximum page depth is six'});
    expect(await retainedState([root.id,child.id])).toEqual(before);
    await store.restore(ctx(),'page',root.id,{parentId:depthFour});expect(await store.page(ctx(),root.id)).toMatchObject({parentId:depthFour});
  });
  it('leaves section ancestry and descendant revisions unchanged at the 500-section destination limit',async()=>{
    const full=await store.create(ctx(),'notebook',{title:'Full destination'});
    await server.db.execute({sql:"WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<500) INSERT INTO notebook_sections(team_id,notebook_id,title,created_at) SELECT ?,?,'Capacity '||value,'2026-10-09T00:00:00.000Z' FROM n",args:[team,full.id]});
    const source=await store.create(ctx(),'section',{notebookId:book,title:'Recover source'}),child=await page({sectionId:source.id});await store.sync(ctx(),child.id,{});await store.remove(ctx(),'section',source.id);
    const before=await retainedState([child.id]);const sectionBefore=(await server.db.execute({sql:'SELECT * FROM notebook_sections WHERE id=?',args:[source.id]})).rows;
    await expect(store.restore(ctx(),'section',source.id,{notebookId:full.id})).rejects.toMatchObject({status:400,message:'Section limit reached'});
    expect(await retainedState([child.id])).toEqual(before);expect((await server.db.execute({sql:'SELECT * FROM notebook_sections WHERE id=?',args:[source.id]})).rows).toEqual(sectionBefore);
  });
  it('rolls back relocation and tombstone clearing when recovery exceeds 20,000 active pages',async()=>{
    const root=await page(),child=await page({parentId:root.id});await store.sync(ctx(),root.id,{});await store.sync(ctx(),child.id,{});await store.remove(ctx(),'page',root.id);
    const before=await retainedState([root.id,child.id]),active=(await store.tree(ctx())).pages.length;
    await server.db.execute({sql:"WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<?) INSERT INTO notebook_pages(team_id,section_id,title,created_at,updated_at) SELECT ?,?,'Capacity '||value,'2026-10-09T00:00:00.000Z','2026-10-09T00:00:00.000Z' FROM n",args:[20_000-active,team,section]});
    const destination=await store.create(ctx(),'section',{notebookId:book,title:'Different restore section'});
    await expect(store.restore(ctx(),'page',root.id,{sectionId:destination.id,parentId:null})).rejects.toMatchObject({status:400,message:'Page limit reached'});
    expect(await retainedState([root.id,child.id])).toEqual(before);await expect(store.page(ctx(),root.id)).rejects.toMatchObject({status:404});
  });
});

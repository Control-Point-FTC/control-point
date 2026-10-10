import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {NotebookStore,type NotebookContext} from '../notebook';
import {seedMember,seedTeam,startTestServer,type TestServer} from './helpers/testServer';
vi.setConfig({testTimeout:30000});
let server:TestServer,store:NotebookStore,team:number,admin:number,member:number,section:number,book:number,session:string;
const ctx=(memberId=admin,source:'human'|'bruno'='human'):NotebookContext=>({memberId,teamId:team,source});
const page=(body:any={})=>store.create(ctx(),'page',{sectionId:section,title:'Disposable experiment',...body});
const doc=(fileId:number)=>({type:'doc',content:[{type:'notebookFile',attrs:{fileId,id:'file',name:'source.pdf',mimeType:'application/pdf',size:4,display:'pdf',width:640}}]});
const empty={type:'doc',content:[]};
const exists=async(table:string,id:number)=>!!(await server.db.execute({sql:`SELECT 1 FROM ${table} WHERE id=?`,args:[id]})).rows.length;
const upload=async(pageId:number)=>{
  const result=await server.db.execute({sql:"INSERT INTO stored_files(team_id,member_id,kind,filename,mime_type,size,data) VALUES(?,?,'notebook','source.pdf','application/pdf',4,?)",args:[team,admin,new Uint8Array([37,80,68,70])]});
  const fileId=Number(result.lastInsertRowid);await store.registerFile(ctx(),pageId,fileId);return fileId;
};
beforeAll(async()=>{
  server=await startTestServer('cp-notebook-purge-');store=new NotebookStore(server.db);team=await seedTeam(server.db,'Purge fixture');
  admin=await seedMember(server.db,team,'Admin','purge-admin@test','admin');member=await seedMember(server.db,team,'Member','purge-member@test');
  session=await server.session(admin);const tree=await store.tree(ctx());section=tree.sections[0].id;book=tree.notebooks[0].id;
},120000);
afterAll(async()=>{await server?.stop();});
describe('confirmed notebook permanent removal',()=>{
  it('requires a trashed root and exact title without changing content or files on rejection',async()=>{
    const target=await page(),file=await upload(target.id);
    await expect(store.purge(ctx(),'page',target.id,target.title)).rejects.toMatchObject({status:409});
    await store.remove(ctx(),'page',target.id);
    for(const confirmation of [undefined,'',target.title+' ',{}])await expect(store.purge(ctx(),'page',target.id,confirmation)).rejects.toMatchObject({status:400});
    expect(await exists('notebook_pages',target.id)).toBe(true);expect(await exists('stored_files',file)).toBe(true);
    const response=await server.post(`/api/notebook/pages/${target.id}/purge`,{confirmationTitle:target.title},session);
    expect(response.status).toBe(200);expect(response.body).toMatchObject({ok:true,filesRemoved:1});
    expect(await exists('notebook_pages',target.id)).toBe(false);expect(await exists('stored_files',file)).toBe(false);
  });
  it('checks current human grants, team scope, and protected descendants',async()=>{
    const root=await page(),child=await page({parentId:root.id,protected:true});await store.remove(ctx(),'page',root.id);
    await expect(store.purge(ctx(member),'page',root.id,root.title)).rejects.toMatchObject({status:403});
    const role=await server.db.execute({sql:"INSERT INTO roles(team_id,name,permissions) VALUES(?,'Purge manager','[\"delete_notebook\"]')",args:[team]});
    await server.db.execute({sql:'INSERT INTO member_roles(member_id,role_id) VALUES(?,?)',args:[member,Number(role.lastInsertRowid)]});
    await expect(store.purge(ctx(member),'page',root.id,root.title)).rejects.toMatchObject({status:404});
    await expect(store.purge(ctx(admin,'bruno'),'page',root.id,root.title)).rejects.toMatchObject({status:403});
    const foreignTeam=await seedTeam(server.db,'Foreign purge fixture'),foreign=await seedMember(server.db,foreignTeam,'Other','purge-foreign@test','admin');
    await expect(store.purge({memberId:foreign,teamId:foreignTeam},'page',root.id,root.title)).rejects.toMatchObject({status:404});
    expect(await exists('notebook_pages',child.id)).toBe(true);await store.purge(ctx(),'page',root.id,root.title);expect(await exists('notebook_pages',child.id)).toBe(false);
    const publicPage=await page();await store.remove(ctx(),'page',publicPage.id);await server.db.execute({sql:'DELETE FROM member_roles WHERE member_id=?',args:[member]});
    await expect(store.purge(ctx(member),'page',publicPage.id,publicPage.title)).rejects.toMatchObject({status:403});
  });
  it('retains files used by copies and historical revisions until the last retained page is removed',async()=>{
    const source=await page(),file=await upload(source.id);await store.save(ctx(),source.id,{baseRevision:1,content:doc(file)});
    const copy=await store.duplicate(ctx(),source.id);await store.save(ctx(),copy.id,{baseRevision:1,content:empty});
    await store.remove(ctx(),'page',source.id);expect((await store.purge(ctx(),'page',source.id,source.title)).deletedFiles).toEqual([]);
    expect(await exists('stored_files',file)).toBe(true);await store.remove(ctx(),'page',copy.id);
    expect((await store.purge(ctx(),'page',copy.id,copy.title)).deletedFiles).toEqual([file]);expect(await exists('stored_files',file)).toBe(false);
  });
  it('retains an upload anchored to another existing page even after a reference is removed',async()=>{
    const source=await page(),file=await upload(source.id);await store.save(ctx(),source.id,{baseRevision:1,content:doc(file)});const copy=await store.duplicate(ctx(),source.id);
    await store.remove(ctx(),'page',copy.id);expect((await store.purge(ctx(),'page',copy.id,copy.title)).deletedFiles).toEqual([]);expect(await exists('stored_files',file)).toBe(true);
    await store.remove(ctx(),'page',source.id);await store.purge(ctx(),'page',source.id,source.title);expect(await exists('stored_files',file)).toBe(false);
  });
  it('removes a batch of orphaned attachments while retaining one shared file',async()=>{
    const target=await page(),files:number[]=[];for(let i=0;i<30;i++)files.push(await upload(target.id));
    await store.save(ctx(),target.id,{baseRevision:1,content:{type:'doc',content:files.flatMap(file=>doc(file).content)}});
    const shared=await page({content:doc(files[0])});await store.remove(ctx(),'page',target.id);
    const result=await store.purge(ctx(),'page',target.id,target.title);expect(result.deletedFiles.sort((a,b)=>a-b)).toEqual(files.slice(1).sort((a,b)=>a-b));
    expect(await exists('stored_files',files[0])).toBe(true);expect((await store.page(ctx(),shared.id)).content).toEqual(doc(files[0]));
  });
  it('cascades section and notebook descendants and saved history while leaving another notebook intact',async()=>{
    const extra=await store.create(ctx(),'notebook',{title:'Disposable season'}),s=await store.create(ctx(),'section',{notebookId:extra.id,title:'Disposable section'});
    const parent=await page({sectionId:s.id}),child=await page({sectionId:s.id,parentId:parent.id});await store.save(ctx(),child.id,{baseRevision:1,content:empty,title:'Saved child'});
    const versions=await store.versions(ctx(),child.id);expect(Array.isArray(versions)&&versions.length>0).toBe(true);await store.remove(ctx(),'section',s.id);await store.purge(ctx(),'section',s.id,s.title);
    expect(await exists('notebook_pages',parent.id)).toBe(false);expect(await exists('notebook_pages',child.id)).toBe(false);
    expect((await server.db.execute({sql:'SELECT 1 FROM notebook_versions WHERE page_id=?',args:[child.id]})).rows).toEqual([]);
    const next=await store.create(ctx(),'section',{notebookId:extra.id,title:'Another disposable section'});await page({sectionId:next.id});
    await store.remove(ctx(),'notebook',extra.id);await store.purge(ctx(),'notebook',extra.id,extra.title);expect(await exists('notebook_sections',next.id)).toBe(false);expect(await exists('notebook_books',book)).toBe(true);
  });
  it('removes discussions, mentions and incoming links without deleting the referring page',async()=>{
    const target=await page(),referring=await page();
    const comment=await store.comment(ctx(),target.id,{body:'Disposable review',mentions:[member]});
    await store.save(ctx(),referring.id,{baseRevision:1,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'See experiment',marks:[{type:'link',attrs:{href:`/notebook/p/${target.id}`}}]}]}]}});
    expect((await server.db.execute({sql:'SELECT 1 FROM notebook_links WHERE target_page_id=?',args:[target.id]})).rows.length).toBe(1);
    await store.remove(ctx(),'page',target.id);await store.purge(ctx(),'page',target.id,target.title);
    for(const [table,column,id] of [['notebook_threads','page_id',target.id],['notebook_comments','id',comment.id],['notebook_mentions','comment_id',comment.id],['notebook_links','target_page_id',target.id]] as const)
      expect((await server.db.execute({sql:`SELECT 1 FROM ${table} WHERE ${column}=?`,args:[id]})).rows).toEqual([]);
    expect(await exists('notebook_pages',referring.id)).toBe(true);
  });
});

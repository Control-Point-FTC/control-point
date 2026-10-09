// @vitest-environment node
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { NotebookStore } from '../notebook';
import { startTestServer,seedTeam,seedMember,type TestServer } from './helpers/testServer';
import { withSession } from './helpers/session';
import express from 'express';
import { registerNotebookFileRoutes, notebookUploadMetadata } from '../notebookFiles';
import { notebookAttachmentIds } from '../../src/notebook/attachmentReferences';
let t:TestServer,store:NotebookStore,team:number,other:number,admin:number,reader:number,section:number;
const ctx = (memberId=admin,source:'human'|'bruno'='human')=>({memberId,teamId:team,source});
const content = (fileId:number)=>({type:'doc',content:[{type:'notebookFile',attrs:{fileId}}]});
const page = ()=>store.create(ctx(),'page',{sectionId:section,title:'File page'});
const upload = async (pageId:number)=>{
  const r=await t.db.execute({sql:"INSERT INTO stored_files(team_id,member_id,kind,filename,mime_type,size,data) VALUES(?,?,'notebook','drawing.pdf','application/pdf',4,?)",args:[team,admin,new Uint8Array([37,80,68,70])]});
  const fileId=Number(r.lastInsertRowid);await store.registerFile(ctx(),pageId,fileId);return fileId;
};
beforeAll(async()=>{
  t=await startTestServer('cp-notebook-files-'); store=new NotebookStore(t.db);
  team=await seedTeam(t.db,'Files team');other=await seedTeam(t.db,'Other');
  admin=await seedMember(t.db,team,'Admin','files-admin@test','admin');reader=await seedMember(t.db,team,'Reader','files-reader@test');
  section=(await store.tree(ctx())).sections[0].id;
},120000);
afterAll(async()=>{await t?.stop();});
describe('notebook file reference boundary',()=>{
  it('uploads and serves only through page-scoped authenticated routes',async()=>{
    const p=await page(),session=await t.session(admin),peerSession=await t.session(reader);
    const form=new FormData();form.append('file',new Blob(['%PDF-1.7\n'],{type:'text/html'}),'../../source.pdf');
    const response=await fetch(`${t.base}/api/notebook/pages/${p.id}/files`,{method:'POST',headers:withSession(new Headers({'X-CP-Notebook-Team':String(team)}),session),body:form});
    const f=await response.json();expect(response.status,JSON.stringify(f)).toBe(200);
    expect(f).toMatchObject({name:'source.pdf',mimeType:'application/pdf'});
    expect((await t.api(`/api/files/${f.id}`,{session})).status).toBe(404);
    expect((await t.api(`/api/notebook/pages/${p.id}/files/${f.id}`,{session:peerSession})).status).toBe(404);
    await store.save(ctx(),p.id,{baseRevision:1,content:content(f.id)});
    const allowed=await fetch(`${t.base}/api/notebook/pages/${p.id}/files/${f.id}`,{headers:withSession(new Headers(),peerSession)});
    expect(allowed.status).toBe(200);expect(allowed.headers.get('cache-control')).toBe('no-store');
    expect(await allowed.text()).toBe('%PDF-1.7\n');
    await store.protect(ctx(),'page',p.id,true);
    expect((await t.api(`/api/notebook/pages/${p.id}/files/${f.id}`,{session:peerSession})).status).toBe(404);
  });
  it('rejects files over 25 MB without storing a row',async()=>{
    const p=await page(),session=await t.session(admin),form=new FormData();
    form.append('file',new Blob([new Uint8Array(25*1024*1024+1)]),'too-large.bin');
    const before=Number((await t.db.execute('SELECT COUNT(*) AS n FROM stored_files')).rows[0].n);
    const response=await fetch(`${t.base}/api/notebook/pages/${p.id}/files`,{method:'POST',headers:withSession(new Headers(),session),body:form});
    expect(response.status).toBe(413);expect((await response.json()).error).toContain('25 MB');
    expect(Number((await t.db.execute('SELECT COUNT(*) AS n FROM stored_files')).rows[0].n)).toBe(before);
  });
  it('rechecks page permission after an asynchronous storage read',async()=>{
    const p=await page(),f=await upload(p.id);await store.save(ctx(),p.id,{baseRevision:1,content:content(f)});
    const app=express();let reads=0;
    registerNotebookFileRoutes(app,{
      requireAuth:async()=>({memberId:reader,teamId:team}),ensureRolesSeeded:async()=>{},
      storeFile:async()=>{throw new Error('not used');},deleteStoredRow:async()=>{},
      readStoredBytes:async()=>{reads++;await store.protect(ctx(),'page',p.id,true);return Buffer.from('protected bytes');}
    },store);
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    try {
      const address=server.address() as {port:number};
      const response=await fetch(`http://127.0.0.1:${address.port}/api/notebook/pages/${p.id}/files/${f}`);
      expect(reads).toBe(1);expect(response.status).toBe(404);expect(await response.text()).not.toContain('protected bytes');
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it('never trusts supplied MIME and removes filename path/control characters',()=>{
    expect(notebookUploadMetadata('..\\folder\\bad\r\n.html',Buffer.from('<script>'))).toEqual({name:'bad.html',mimeType:'application/octet-stream'});
  });
  it('reads only authored attachment references and rejects invalid IDs',()=>{
    expect(notebookAttachmentIds({url:'/api/files/99',metadata:{type:'notebookFile',attrs:{fileId:99}},content:[{type:'notebookFile',attrs:{fileId:3}}]})).toEqual([3]);
    expect(()=>notebookAttachmentIds(content(-1))).toThrow();
    expect(()=>notebookAttachmentIds({objects:Array.from({length:501},(_,i)=>({type:'image',fileId:i+1}))})).toThrow();
  });
  it('limits uninserted uploads to their uploader, then shares through the authored page',async()=>{
    const p=await page(),f=await upload(p.id);
    expect((await store.fileForPage(ctx(),p.id,f)).filename).toBe('drawing.pdf');
    await expect(store.fileForPage(ctx(reader),p.id,f)).rejects.toMatchObject({status:404});
    await store.save(ctx(),p.id,{baseRevision:1,content:content(f)});
    expect((await store.fileForPage(ctx(reader),p.id,f)).id).toBe(f);
    await store.protect(ctx(),'section',section,true);
    try {
      await expect(store.fileForPage(ctx(reader),p.id,f)).rejects.toMatchObject({status:404});
      await expect(store.fileForPage(ctx(admin,'bruno'),p.id,f)).rejects.toMatchObject({status:404});
      expect((await store.fileForPage(ctx(),p.id,f)).id).toBe(f);
    } finally {await store.protect(ctx(),'section',section,false);}
  });
  it('keeps history and copied references while denying IDs from another team',async()=>{
    const p=await page(),f=await upload(p.id);
    await store.save(ctx(),p.id,{baseRevision:1,content:content(f)});
    const copy=await store.duplicate(ctx(),p.id);
    await store.save(ctx(),p.id,{baseRevision:2,content:{type:'doc',content:[{type:'paragraph'}]}});
    expect((await store.fileForPage(ctx(reader),p.id,f)).id).toBe(f);
    await store.remove(ctx(),'page',p.id);
    expect((await store.fileForPage(ctx(reader),copy.id,f)).id).toBe(f);
    const outsider=await seedMember(t.db,other,'Other admin','files-outsider@test','admin');
    await expect(store.fileForPage({memberId:outsider,teamId:other},copy.id,f)).rejects.toMatchObject({status:404});
  });
  it('rolls back an attempted reference to an inaccessible protected file',async()=>{
    const hidden=await page(),f=await upload(hidden.id),visible=await page();
    await store.save(ctx(),hidden.id,{baseRevision:1,content:content(f)});
    await store.protect(ctx(),'page',hidden.id,true);
    // An admin in Bruno mode must never promote a protected file into an ordinary page.
    await expect(store.fileForPage(ctx(admin,'bruno'),hidden.id,f)).rejects.toMatchObject({status:404});
    await expect(store.save(ctx(),visible.id,{baseRevision:1,content:content(f)})).rejects.toMatchObject({status:404});
    const pending=await upload(hidden.id);
    await expect(store.save(ctx(),visible.id,{baseRevision:1,content:content(pending)})).rejects.toMatchObject({status:404});
    expect((await store.page(ctx(),visible.id)).revision).toBe(1);
  });
});

import multer from 'multer';
import { NotebookError, type NotebookStore, type Session } from './notebook.js';
import { notebookAttachmentIds } from '../src/notebook/attachmentReferences.js';

export async function authorizeNotebookUpload(s: Session, pageId: number) {
  s.require('edit_notebook'); await s.item('page',pageId);
  const count = await s.one('SELECT COUNT(*) AS n FROM notebook_files WHERE team_id=? AND uploaded_page_id=?',s.ctx.teamId,pageId);
  if (Number(count?.n) >= 200) throw new NotebookError('This page has 200 uploaded files. Use another page for more files.',413);
}
export async function registerNotebookFile(s: Session, pageId: number, fileId: number) {
  await authorizeNotebookUpload(s,pageId);
  const file = await s.one("SELECT id,filename,mime_type,size FROM stored_files WHERE id=? AND team_id=? AND member_id=? AND kind='notebook'",fileId,s.ctx.teamId,s.ctx.memberId);
  if (!file) throw new NotebookError('Notebook file unavailable',404);
  await s.run('INSERT INTO notebook_files(file_id,team_id,uploaded_page_id,uploaded_by,created_at) VALUES(?,?,?,?,?)',fileId,s.ctx.teamId,pageId,s.ctx.memberId,new Date().toISOString());
  return { id:file.id, name:file.filename, mimeType:file.mime_type, size:file.size };
}
export async function indexNotebookFiles(s: Session, pageId: number, content: unknown, canvas: unknown, revision = 0, trustedCopy = false) {
  let ids: number[];
  try { ids = notebookAttachmentIds(content,canvas); } catch (e) { throw new NotebookError((e as Error).message); }
  let visible: Map<number, boolean> | undefined;
  const destinationProtected = await s.isProtected(await s.item('page',pageId));
  for (const fileId of ids) {
    const file = await s.one("SELECT n.*,f.kind FROM notebook_files n JOIN stored_files f ON f.id=n.file_id AND f.team_id=n.team_id WHERE n.team_id=? AND n.file_id=?",s.ctx.teamId,fileId);
    if (!file || file.kind !== 'notebook') throw new NotebookError('Notebook file unavailable',404);
    if (trustedCopy) continue;
    const existing = await s.one('SELECT 1 FROM notebook_file_refs WHERE team_id=? AND page_id=? AND file_id=? LIMIT 1',s.ctx.teamId,pageId,fileId);
    if (existing) continue;
    if (file.uploaded_page_id === pageId && file.uploaded_by === s.ctx.memberId && s.access.human) continue;
    visible ??= new Map((await s.tree()).pages.map((page: any)=>[page.id,!!page.protected]));
    const refs = await s.all('SELECT DISTINCT page_id FROM notebook_file_refs WHERE team_id=? AND file_id=?',s.ctx.teamId,fileId);
    if (!refs.some(ref=>visible!.has(ref.page_id) && (destinationProtected || !visible!.get(ref.page_id)))) throw new NotebookError('Notebook file unavailable',404);
  }
  await s.run('DELETE FROM notebook_file_refs WHERE team_id=? AND page_id=? AND revision=?',s.ctx.teamId,pageId,revision);
  for (const fileId of ids) await s.run('INSERT INTO notebook_file_refs(team_id,page_id,file_id,revision) VALUES(?,?,?,?)',s.ctx.teamId,pageId,fileId,revision);
}
export async function notebookFileForPage(s: Session, pageId: number, fileId: number) {
  await s.item('page',pageId);
  const file = await s.one("SELECT f.id,f.filename,f.mime_type,f.size,f.r2_key,length(f.data) AS blob_len,n.uploaded_page_id,n.uploaded_by FROM notebook_files n JOIN stored_files f ON f.id=n.file_id AND f.team_id=n.team_id WHERE n.team_id=? AND n.file_id=? AND f.kind='notebook'",s.ctx.teamId,fileId);
  if (!file) throw new NotebookError('Notebook file unavailable',404);
  const referenced = await s.one('SELECT 1 FROM notebook_file_refs WHERE team_id=? AND page_id=? AND file_id=? LIMIT 1',s.ctx.teamId,pageId,fileId);
  const ownPending = s.access.human && file.uploaded_page_id === pageId && file.uploaded_by === s.ctx.memberId;
  if (!referenced && !ownPending) throw new NotebookError('Notebook file unavailable',404);
  return file;
}

export function notebookUploadMetadata(filename: string, bytes: Buffer) {
  const name = filename.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,200) || 'Attachment';
  let mimeType = 'application/octet-stream';
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType='image/png';
  else if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) mimeType='image/jpeg';
  else if (['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString('ascii'))) mimeType='image/gif';
  else if (bytes.subarray(0,4).toString('ascii')==='RIFF' && bytes.subarray(8,12).toString('ascii')==='WEBP') mimeType='image/webp';
  else if (bytes.subarray(0,5).toString('ascii')==='%PDF-') mimeType='application/pdf';
  return {name,mimeType};
}
type FileRouteDeps = {
  requireAuth:(req:any,res:any)=>Promise<{memberId:number;teamId:number|null}|null>;
  ensureRolesSeeded:(teamId:number)=>Promise<void>;
  storeFile:(opts:{teamId:number;memberId:number;kind:string;filename:string;mimeType:string;buffer:Buffer})=>Promise<number>;
  deleteStoredRow:(id:number)=>Promise<void>;
  readStoredBytes:(table:'stored_files',id:number,key:string|null,length:number)=>Promise<Buffer|null>;
};
export function registerNotebookFileRoutes(app:any,deps:FileRouteDeps,store:NotebookStore) {
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1,fields:0,parts:2}}).single('file');
  const context=async(req:any,res:any)=>{
    res.setHeader('Cache-Control','no-store');
    const auth=await deps.requireAuth(req,res); if(!auth) return null;
    if(!auth.teamId) throw new NotebookError('Select an active team',403);
    if(req.headers['x-cp-notebook-team']!==undefined && Number(req.headers['x-cp-notebook-team'])!==auth.teamId)
      throw new NotebookError('Workspace changed; reopen this notebook',409,{workspaceChanged:true});
    await deps.ensureRolesSeeded(auth.teamId);
    return {memberId:auth.memberId,teamId:auth.teamId,source:'human' as const};
  };
  const fail=(res:any,e:unknown)=>{
    if(res.headersSent || res.destroyed) return;
    if(e instanceof NotebookError) res.status(e.status).json({error:e.message,...e.extra});
    else if(e instanceof multer.MulterError) res.status(e.code==='LIMIT_FILE_SIZE'?413:400).json({error:e.code==='LIMIT_FILE_SIZE'?'Files must be 25 MB or smaller.':'Upload one file at a time.'});
    else res.status(500).json({error:'Notebook file request failed. Try again.'});
  };
  app.post('/api/notebook/pages/:id/files',async(req:any,res:any)=>{
    let fileId:number|undefined;
    try {
      const ctx=await context(req,res);if(!ctx)return;
      const pageId=Number(req.params.id);await store.authorizeFileUpload(ctx,pageId);
      await new Promise<void>((resolve,reject)=>upload(req,res,(e:any)=>e?reject(e):resolve()));
      if(!req.file?.buffer?.length)throw new NotebookError('Choose a nonempty file');
      const metadata=notebookUploadMetadata(req.file.originalname,req.file.buffer);
      fileId=await deps.storeFile({teamId:ctx.teamId,memberId:ctx.memberId,kind:'notebook',filename:metadata.name,mimeType:metadata.mimeType,buffer:req.file.buffer});
      const fresh=await context(req,res);
      if(!fresh || fresh.memberId!==ctx.memberId || fresh.teamId!==ctx.teamId || req.aborted || res.destroyed)
        throw new NotebookError('Upload interrupted or workspace changed',409);
      const file=await store.registerFile(fresh,pageId,fileId);res.json(file);fileId=undefined;
    } catch(e) {
      if(fileId!==undefined)await deps.deleteStoredRow(fileId).catch(()=>undefined);
      fail(res,e);
    }
  });
  app.get('/api/notebook/pages/:id/files/:fileId',async(req:any,res:any)=>{
    try {
      const ctx=await context(req,res);if(!ctx)return;
      const pageId=Number(req.params.id),fileId=Number(req.params.fileId);
      const file=await store.fileForPage(ctx,pageId,fileId);
      const bytes=await deps.readStoredBytes('stored_files',fileId,file.r2_key,Number(file.blob_len)||0);
      const fresh=await context(req,res);if(!fresh)return;
      if(fresh.memberId!==ctx.memberId || fresh.teamId!==ctx.teamId)throw new NotebookError('Workspace changed; reopen this notebook',409,{workspaceChanged:true});
      await store.fileForPage(fresh,pageId,fileId);
      if(!bytes)throw new NotebookError('File bytes are unavailable. Try again.',404);
      const inline=['image/png','image/jpeg','image/webp','image/gif','application/pdf'].includes(file.mime_type) && req.query.download!=='1';
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
      res.setHeader('Content-Type',inline?file.mime_type:'application/octet-stream');
      const name=String(file.filename||'Attachment');
      res.setHeader('Content-Disposition',`${inline?'inline':'attachment'}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`);
      res.setHeader('Content-Length',bytes.length);res.send(bytes);
    }catch(e){fail(res,e);}
  });
}

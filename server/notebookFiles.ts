import { NotebookError, type Session } from './notebook.js';
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

import {NotebookError,type Session} from './notebook';
type Kind='notebook'|'section'|'page';
const tables={notebook:'notebook_books',section:'notebook_sections',page:'notebook_pages'};

/** Permanently remove one confirmed deletion root, retaining all shared file references. */
export async function notebookPurge(s:Session,kind:Kind,itemId:number,confirmation:unknown){
  s.require('delete_notebook');
  const row=await s.item(kind,itemId,true),team=s.ctx.teamId;
  if(!row.deleted_at)throw new NotebookError('Move this item to trash before permanently removing it',409);
  await s.checkChildren(kind,row);
  if(typeof confirmation!=='string'||confirmation!==row.title)throw new NotebookError('Type the exact item title to confirm permanent removal');
  const targets=`WITH RECURSIVE targets(id) AS (
    SELECT p.id FROM notebook_pages p JOIN notebook_sections sec ON sec.id=p.section_id AND sec.team_id=p.team_id
    WHERE p.team_id=? AND ((?='page' AND p.id=?) OR (?='section' AND p.section_id=?) OR (?='notebook' AND sec.notebook_id=?))
    UNION SELECT child.id FROM notebook_pages child JOIN targets parent ON child.parent_id=parent.id WHERE child.team_id=?
  )`;
  const targetArgs=[team,kind,row.id,kind,row.id,kind,row.id,team];
  const candidates=await s.all(`${targets} SELECT n.file_id FROM notebook_files n WHERE n.team_id=? AND (
    n.uploaded_page_id IN (SELECT id FROM targets) OR EXISTS (
      SELECT 1 FROM notebook_file_refs refs WHERE refs.file_id=n.file_id AND refs.team_id=? AND refs.page_id IN (SELECT id FROM targets)))`,...targetArgs,team,team);
  // Incoming edges intentionally have no target foreign key. Remove their index
  // while preserving the authored link text in surviving pages and revisions.
  await s.run(`${targets} DELETE FROM notebook_links WHERE team_id=? AND target_page_id IN (SELECT id FROM targets)`,...targetArgs,team);
  // Foreign keys remove revisions, discussions, outgoing links and file references atomically.
  await s.run(`DELETE FROM ${tables[kind]} WHERE id=? AND team_id=?`,row.id,team);
  const deletedFiles:number[]=[];
  for(const file of candidates){
    const retained=await s.one('SELECT 1 FROM notebook_file_refs WHERE file_id=? LIMIT 1',file.file_id);
    const upload=await s.one('SELECT uploaded_page_id FROM notebook_files WHERE file_id=? AND team_id=?',file.file_id,team);
    if(retained||upload?.uploaded_page_id!=null)continue;
    const removed=await s.run("DELETE FROM stored_files WHERE id=? AND team_id=? AND kind='notebook'",file.file_id,team);
    if(removed.rowsAffected)deletedFiles.push(Number(file.file_id));
  }
  return {deletedFiles};
}

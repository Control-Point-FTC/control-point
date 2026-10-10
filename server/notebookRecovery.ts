import {NotebookError,type Session} from './notebook';
import {randomUUID} from 'node:crypto';

type Kind='notebook'|'section'|'page';
const tables={notebook:'notebook_books',section:'notebook_sections',page:'notebook_pages'};
function itemId(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new NotebookError('Invalid restore destination');return n;}

/** Restore a tombstone transactionally; independent child tombstones stay deleted. */
export async function notebookRestore(s:Session,kind:Kind,target:number,to:Record<string,unknown>={}){
  s.require('delete_notebook');s.require('organize_notebook');
  if(!to||typeof to!=='object'||Array.isArray(to))throw new NotebookError('Invalid restore destination');
  const allowed=kind==='section'?['notebookId']:kind==='page'?['sectionId','parentId']:[];
  if(Object.keys(to).some(key=>!allowed.includes(key)))throw new NotebookError('Invalid restore destination');
  const row=await s.item(kind,target,true),team=s.ctx.teamId;
  if(!row.deleted_at)throw new NotebookError('This item is already active',409);
  await s.checkChildren(kind,row);
  const originalParent=async(kind:'notebook'|'section'|'page',id:number)=>{
    try{return await s.item(kind,id);}catch(error){
      if(error instanceof NotebookError&&error.status===404)throw new NotebookError('The original parent is unavailable. Choose an active restore destination.',409,{destinationRequired:true});
      throw error;
    }
  };
  let pages:Record<string,any>[]=[];
  if(kind==='notebook'){
    if(Object.keys(to).length)throw new NotebookError('Notebooks restore into their owning team');
    if(Number((await s.one('SELECT COUNT(*) AS n FROM notebook_books WHERE team_id=? AND deleted_at IS NULL',team))?.n)>=200)throw new NotebookError('Notebook limit reached');
    const sections=await s.all('SELECT id FROM notebook_sections WHERE notebook_id=? AND team_id=? AND deleted_at IS NULL',row.id,team);
    if(sections.length>500)throw new NotebookError('Section limit reached');
    pages=await s.all('SELECT p.id FROM notebook_pages p JOIN notebook_sections sec ON sec.id=p.section_id AND sec.team_id=p.team_id WHERE sec.notebook_id=? AND p.team_id=?',row.id,team);
  }else if(kind==='section'){
    const notebook=to.notebookId===undefined?await originalParent('notebook',row.notebook_id):await s.item('notebook',itemId(to.notebookId));
    if(Number((await s.one('SELECT COUNT(*) AS n FROM notebook_sections WHERE notebook_id=? AND team_id=? AND deleted_at IS NULL',notebook.id,team))?.n)>=500)throw new NotebookError('Section limit reached');
    pages=await s.all('SELECT id FROM notebook_pages WHERE section_id=? AND team_id=?',row.id,team);
    await s.run('UPDATE notebook_sections SET notebook_id=? WHERE id=? AND team_id=?',notebook.id,row.id,team);
  }else{
    const protectedPage=await s.isProtected(row);
    const section=to.sectionId===undefined?await originalParent('section',row.section_id):await s.item('section',itemId(to.sectionId));
    const parentId=to.parentId===undefined?(section.id===row.section_id?row.parent_id:null):to.parentId===null?null:itemId(to.parentId);
    pages=await s.descendants(row.id);
    if(pages.some(page=>page.id===parentId))throw new NotebookError('A page cannot be nested inside itself or its descendants');
    let parentDepth=0;
    if(parentId){
      let parent=to.parentId===undefined?await originalParent('page',parentId):await s.item('page',parentId);
      if(parent.section_id!==section.id)throw new NotebookError('Parent must belong to the section');
      parentDepth=1;
      while(parent.parent_id){parent=await s.item('page',parent.parent_id);parentDepth++;}
    }
    const depths=new Map<number,number>([[row.id,1]]);
    for(const page of pages)if(page.id!==row.id)depths.set(page.id,(depths.get(page.parent_id)??6)+1);
    if(parentDepth+Math.max(...depths.values())>6)throw new NotebookError('Maximum page depth is six');
    // Preserve inherited restrictions when an admin chooses a public destination.
    await s.run('UPDATE notebook_pages SET parent_id=?,protected=? WHERE id=? AND team_id=?',parentId,protectedPage?1:0,row.id,team);
    for(const page of pages)await s.run('UPDATE notebook_pages SET section_id=? WHERE id=? AND team_id=?',section.id,page.id,team);
  }
  await s.run(`UPDATE ${tables[kind]} SET deleted_at=NULL,deleted_by=NULL WHERE id=? AND team_id=?`,row.id,team);
  if(await s.activePageCount()>20_000)throw new NotebookError('Page limit reached');
  const now=new Date().toISOString();
  for(const page of pages){
    await s.snapshot(page);
    // Old collaborators must rejoin; their pre-deletion journal cannot overwrite recovery.
    // Content authors stay attributed to the original member.
    await s.run('UPDATE notebook_pages SET revision=revision+1,updated_at=?,crdt_state=NULL,crdt_epoch=? WHERE id=? AND team_id=?',now,randomUUID(),page.id,team);
  }
  return {ok:true,tree:await s.tree()};
}

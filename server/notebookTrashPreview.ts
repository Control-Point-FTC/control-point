import {NotebookError,type Session} from './notebook';

/** An explicit read of retained content; files remain identifiers, never fetched here. */
export async function notebookTrashPage(s:Session,pageId:number){
  s.require('delete_notebook');
  const row=await s.item('page',pageId,true);
  if(!row.deleted_at)throw new NotebookError('Deleted page unavailable',404);
  return {...await s.page(row),deletedAt:row.deleted_at};
}

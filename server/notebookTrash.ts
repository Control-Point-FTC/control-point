import {NotebookError,type Session} from './notebook';

type Cursor=[string,'notebook'|'section'|'page',number];
function decodeCursor(value:unknown):Cursor|null{
  if(value===undefined)return null;
  try{
    if(typeof value!=='string'||value.length>256||! /^[A-Za-z0-9_-]+$/.test(value))throw new Error();
    const cursor=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(!Array.isArray(cursor)||cursor.length!==3||typeof cursor[0]!=='string'||cursor[0].length>40||!Number.isFinite(Date.parse(cursor[0]))||!['notebook','section','page'].includes(cursor[1])||!Number.isSafeInteger(cursor[2])||cursor[2]<=0)throw new Error();
    return cursor as Cursor;
  }catch{throw new NotebookError('Invalid trash continuation cursor');}
}

/** Return tombstone roots only, under the current team and inherited protection. */
export async function notebookTrash(s:Session,value?:unknown){
  s.require('delete_notebook');
  const cursor=decodeCursor(value);
  const team=s.ctx.teamId,admin=s.access.human&&s.access.admin?1:0;
  const rows=await s.all(`WITH RECURSIVE pages AS (
    SELECT p.id,p.section_id,p.title,p.deleted_at,p.deleted_by,
      (p.protected OR sec.protected) AS hidden,
      (sec.deleted_at IS NOT NULL OR b.deleted_at IS NOT NULL) AS ancestor_deleted,1 AS depth
    FROM notebook_pages p
    JOIN notebook_sections sec ON sec.id=p.section_id AND sec.team_id=p.team_id
    JOIN notebook_books b ON b.id=sec.notebook_id AND b.team_id=p.team_id
    WHERE p.team_id=? AND p.parent_id IS NULL
    UNION ALL
    SELECT child.id,child.section_id,child.title,child.deleted_at,child.deleted_by,
      (parent.hidden OR child.protected),
      (parent.ancestor_deleted OR parent.deleted_at IS NOT NULL),parent.depth+1
    FROM notebook_pages child JOIN pages parent ON child.parent_id=parent.id AND child.section_id=parent.section_id
    WHERE child.team_id=? AND parent.depth<6
  ), deleted AS (
    SELECT id,'notebook' AS kind,title,deleted_at,deleted_by FROM notebook_books WHERE team_id=? AND deleted_at IS NOT NULL
    UNION ALL
    SELECT sec.id,'section',sec.title,sec.deleted_at,sec.deleted_by FROM notebook_sections sec
    JOIN notebook_books b ON b.id=sec.notebook_id AND b.team_id=sec.team_id
    WHERE sec.team_id=? AND sec.deleted_at IS NOT NULL AND b.deleted_at IS NULL AND (? OR sec.protected=0)
    UNION ALL
    SELECT id,'page',title,deleted_at,deleted_by FROM pages WHERE deleted_at IS NOT NULL AND ancestor_deleted=0 AND (? OR hidden=0)
  ) SELECT d.*,m.name AS deleting_name FROM deleted d LEFT JOIN members m ON m.id=d.deleted_by AND m.team_id=?
  ${cursor?'WHERE d.deleted_at<? OR (d.deleted_at=? AND (d.kind>? OR (d.kind=? AND d.id<?)))':''}
  ORDER BY d.deleted_at DESC,d.kind,d.id DESC LIMIT 101`,team,team,team,team,admin,admin,team,...(cursor?[cursor[0],cursor[0],cursor[1],cursor[1],cursor[2]]:[]));
  const last=rows[99];
  return {
    items:rows.slice(0,100).map(row=>({id:row.id,kind:row.kind,title:row.title,deletedAt:row.deleted_at,deletedById:row.deleting_name?row.deleted_by:null,deletedBy:row.deleting_name?String(row.deleting_name).slice(0,80):'Unknown or former team member'})),
    hasMore:rows.length>100,
    nextCursor:rows.length>100?Buffer.from(JSON.stringify([last.deleted_at,last.kind,last.id])).toString('base64url'):null,
    retention:'Deleted content is retained until explicitly permanently removed. Automatic expiration is disabled.',
  };
}

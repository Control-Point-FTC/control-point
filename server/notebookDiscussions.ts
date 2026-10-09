import { NotebookError, type Session } from './notebook.js';

type Row = Record<string, any>;
function integer(value: unknown) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new NotebookError('Invalid discussion ID'); return n; }
function human(s: Session) { if (!s.access.human) throw new NotebookError('Discussions are available to team members only', 403); }
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 10_000) throw new NotebookError('Use a comment between 1 and 10,000 characters');
  return value.trim();
}
function anchor(value: any): Row {
  if (value == null) return { kind: 'page' };
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['page', 'block', 'text', 'canvas', 'image', 'pdf'].includes(value.kind)) throw new NotebookError('Invalid comment anchor');
  const allowed = new Set(['kind', 'targetId', 'quote', 'start', 'end']);
  if (Object.keys(value).some(k => !allowed.has(k))) throw new NotebookError('Unsupported comment anchor');
  if (value.kind !== 'page' && (typeof value.targetId !== 'string' || !/^[\w-]{1,100}$/.test(value.targetId))) throw new NotebookError('Invalid anchor target');
  if (value.quote !== undefined && (typeof value.quote !== 'string' || value.quote.length > 500)) throw new NotebookError('Invalid anchor quote');
  if (value.kind === 'text' && (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.start < 0 || value.end <= value.start || value.end > 2_000_000)) throw new NotebookError('Invalid text anchor range');
  return { kind: value.kind, ...(value.kind !== 'page' ? { targetId: value.targetId } : {}), ...(value.quote ? { quote: value.quote } : {}), ...(value.kind === 'text' ? { start: value.start, end: value.end } : {}) };
}
function targetExists(page: Row, a: Row): boolean {
  if (a.kind === 'page') return true;
  let found = false;
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 60 || found) return;
    if (node.id === a.targetId || node.attrs?.id === a.targetId) {
      if (a.kind !== 'text' || !a.quote) { found = true; return; }
      const collect = (v: any): string => !v || typeof v !== 'object' ? '' : typeof v.text === 'string' ? v.text : Array.isArray(v.content) ? v.content.map(collect).join('') : '';
      found = collect(node).includes(a.quote); return;
    }
    for (const [key, child] of Object.entries(node)) if (key !== 'attachments') {
      if (Array.isArray(child)) child.forEach(v => walk(v, depth + 1)); else walk(child, depth + 1);
    }
  };
  walk(JSON.parse(page.content), 0); walk(JSON.parse(page.canvas), 0); return found;
}
async function thread(s: Session, pageId: number, threadId: unknown) {
  const row = await s.one('SELECT * FROM notebook_threads WHERE id=? AND page_id=? AND team_id=?', integer(threadId), pageId, s.ctx.teamId);
  if (!row) throw new NotebookError('Discussion unavailable', 404); return row;
}
export async function notebookMentionMembers(s: Session, pageId: number) {
  human(s); const page = await s.item('page', pageId); const restricted = await s.isProtected(page);
  const members = await s.all('SELECT id,name,account_type FROM members WHERE team_id=? AND COALESCE(is_active,1)=1 ORDER BY name,id LIMIT 500', s.ctx.teamId);
  if (!restricted) return members.map(m => ({ id: m.id, name: m.name }));
  const roles = await s.all('SELECT mr.member_id,r.permissions FROM member_roles mr JOIN roles r ON r.id=mr.role_id WHERE r.team_id=?', s.ctx.teamId);
  const admins = new Set<number>();
  for (const r of roles) { try { const p = JSON.parse(r.permissions); if (Array.isArray(p) && (p.includes('*') || p.includes('manage_members'))) admins.add(r.member_id); } catch { /* malformed grants nothing */ } }
  return members.filter(m => m.account_type === 'admin' || admins.has(m.id)).map(m => ({ id: m.id, name: m.name }));
}
async function mentions(s: Session, pageId: number, commentId: number, value: unknown) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 30) throw new NotebookError('Mention up to 30 team members');
  const ids = [...new Set(value.map(integer))];
  const eligible = new Set((await notebookMentionMembers(s, pageId)).map(m => m.id));
  if (ids.some(id => !eligible.has(id))) throw new NotebookError('A mentioned member cannot access this page');
  const previous = new Set((await s.all('SELECT member_id FROM notebook_mentions WHERE team_id=? AND comment_id=?', s.ctx.teamId, commentId)).map(r => r.member_id));
  for (const old of previous) if (!ids.includes(old)) await s.run('DELETE FROM notebook_mentions WHERE team_id=? AND comment_id=? AND member_id=?', s.ctx.teamId, commentId, old);
  for (const memberId of ids) if (!previous.has(memberId) && memberId !== s.ctx.memberId) await s.run('INSERT INTO notebook_mentions(team_id,comment_id,member_id,created_at) VALUES(?,?,?,?)', s.ctx.teamId, commentId, memberId, new Date().toISOString());
}
function commentView(s: Session, row: Row) {
  const recipients: number[] = row.deleted_at ? [] : JSON.parse(row.mention_ids ?? '[]');
  return { id: row.id, threadId: row.thread_id, authorId: row.author_id, author: row.author_name ?? 'Former team member', body: row.deleted_at ? '' : row.body,
    createdAt: row.created_at, editedAt: row.edited_at, deleted: !!row.deleted_at, mentions: recipients,
    canEdit: !row.deleted_at && row.author_id === s.ctx.memberId && s.can('edit_notebook'), canDelete: !row.deleted_at && (row.author_id === s.ctx.memberId && s.can('edit_notebook') || s.access.admin || s.can('delete_notebook')) };
}
export async function notebookThreads(s: Session, pageId: number, before?: unknown, focus?: unknown) {
  human(s); const page = await s.item('page', pageId);
  const rows = await s.all('SELECT * FROM notebook_threads WHERE team_id=? AND page_id=? AND id<? ORDER BY id DESC LIMIT 31', s.ctx.teamId, pageId, before === undefined ? Number.MAX_SAFE_INTEGER : integer(before));
  const selected = rows.slice(0, 30);
  if (focus !== undefined && !selected.some(row => row.id === integer(focus))) selected.unshift(await thread(s, pageId, focus));
  const items = [];
  for (const row of selected) {
    const a = JSON.parse(row.anchor);
    const comments = await notebookThreadComments(s, pageId, row.id);
    items.push({ id: row.id, anchor: a, orphaned: !targetExists(page, a), resolved: !!row.resolved_at, resolvedAt: row.resolved_at, resolvedBy: row.resolved_by,
      comments: comments.items, commentsBefore: comments.next });
  }
  return { items, next: rows.length > 30 ? rows[29].id : null, canComment: s.can('edit_notebook') };
}
export async function notebookThreadComments(s: Session, pageId: number, threadId: number, before?: unknown, requestedLimit?: unknown) {
  human(s); await s.item('page', pageId); await thread(s, pageId, threadId);
  const limit = requestedLimit === undefined ? 10 : integer(requestedLimit); if (limit > 100) throw new NotebookError('Load up to 100 replies at a time');
  const rows = await s.all('SELECT c.*,m.name AS author_name,(SELECT json_group_array(n.member_id) FROM notebook_mentions n WHERE n.team_id=c.team_id AND n.comment_id=c.id) AS mention_ids FROM notebook_comments c LEFT JOIN members m ON m.id=c.author_id AND m.team_id=c.team_id WHERE c.team_id=? AND c.thread_id=? AND c.id<? ORDER BY c.id DESC LIMIT ?', s.ctx.teamId, threadId, before === undefined ? Number.MAX_SAFE_INTEGER : integer(before), limit + 1);
  return { items: rows.slice(0, limit).reverse().map(c => commentView(s, c)), next: rows.length > limit ? rows[limit - 1].id : null };
}
export async function notebookComment(s: Session, pageId: number, body: Row) {
  human(s); s.require('edit_notebook'); const page = await s.item('page', pageId); const message = text(body.body);
  let root: Row;
  if (body.threadId !== undefined) {
    root = await thread(s, pageId, body.threadId);
    if (root.resolved_at) throw new NotebookError('Reopen this discussion before replying', 409);
    const count = await s.one('SELECT COUNT(*) AS n FROM notebook_comments WHERE team_id=? AND thread_id=?', s.ctx.teamId, root.id);
    if (Number(count?.n) >= 100) throw new NotebookError('This discussion is full; start another thread', 409);
  } else {
    const a = anchor(body.anchor);
    if (!targetExists(page, a)) throw new NotebookError('The comment target no longer exists', 409);
    const count = await s.one('SELECT COUNT(*) AS n FROM notebook_threads WHERE team_id=? AND page_id=?', s.ctx.teamId, pageId);
    if (Number(count?.n) >= 1000) throw new NotebookError('This page has reached its discussion limit', 409);
    const inserted = await s.run('INSERT INTO notebook_threads(team_id,page_id,anchor,created_by,created_at) VALUES(?,?,?,?,?)', s.ctx.teamId, pageId, JSON.stringify(a), s.ctx.memberId, new Date().toISOString());
    root = { id: Number(inserted.lastInsertRowid) };
  }
  const result = await s.run('INSERT INTO notebook_comments(team_id,thread_id,author_id,body,created_at) VALUES(?,?,?,?,?)', s.ctx.teamId, root.id, s.ctx.memberId, message, new Date().toISOString());
  await mentions(s, pageId, Number(result.lastInsertRowid), body.mentions ?? []);
  return { id: Number(result.lastInsertRowid), threadId: root.id };
}
export async function notebookEditComment(s: Session, pageId: number, commentId: number, body: Row, remove: boolean) {
  human(s); await s.item('page', pageId);
  const c = await s.one('SELECT c.* FROM notebook_comments c JOIN notebook_threads t ON t.id=c.thread_id AND t.team_id=c.team_id WHERE c.id=? AND c.team_id=? AND t.page_id=?', commentId, s.ctx.teamId, pageId);
  if (!c || c.deleted_at) throw new NotebookError('Comment unavailable', 404);
  if (remove ? !(c.author_id === s.ctx.memberId && s.can('edit_notebook') || s.access.admin || s.can('delete_notebook')) : !(c.author_id === s.ctx.memberId && s.can('edit_notebook'))) throw new NotebookError('Comment permission required', 403);
  if (remove) {
    await s.run("UPDATE notebook_comments SET body='',deleted_at=? WHERE id=? AND team_id=?", new Date().toISOString(), commentId, s.ctx.teamId);
    await s.run('DELETE FROM notebook_mentions WHERE comment_id=? AND team_id=?', commentId, s.ctx.teamId);
  } else {
    await s.run('UPDATE notebook_comments SET body=?,edited_at=? WHERE id=? AND team_id=?', text(body.body), new Date().toISOString(), commentId, s.ctx.teamId);
    await mentions(s, pageId, commentId, body.mentions);
  }
  return { id: commentId };
}
export async function notebookResolveThread(s: Session, pageId: number, threadId: number, resolved: unknown) {
  human(s); s.require('edit_notebook'); await s.item('page', pageId); await thread(s, pageId, threadId);
  if (typeof resolved !== 'boolean') throw new NotebookError('Specify whether the discussion is resolved');
  await s.run('UPDATE notebook_threads SET resolved_at=?,resolved_by=? WHERE id=? AND team_id=?', resolved ? new Date().toISOString() : null, resolved ? s.ctx.memberId : null, threadId, s.ctx.teamId);
  return { id: threadId, resolved };
}
export async function notebookMentionInbox(s: Session) {
  human(s); const visible = new Set((await s.tree()).pages.map(p => p.id));
  // Filter source access before returning any title, comment snippet or unread
  // count. Generic notifications must never retain protected snippets.
  const rows = await s.all('SELECT n.*,c.body,c.deleted_at,t.page_id,t.id AS thread_id,t.anchor,p.title FROM notebook_mentions n JOIN notebook_comments c ON c.id=n.comment_id AND c.team_id=n.team_id JOIN notebook_threads t ON t.id=c.thread_id AND t.team_id=c.team_id JOIN notebook_pages p ON p.id=t.page_id AND p.team_id=t.team_id WHERE n.team_id=? AND n.member_id=? ORDER BY n.created_at DESC,n.comment_id DESC LIMIT 1000', s.ctx.teamId, s.ctx.memberId);
  return rows.filter(r => !r.deleted_at && visible.has(r.page_id)).slice(0, 100).map(r => ({ commentId: r.comment_id, threadId: r.thread_id, pageId: r.page_id, title: r.title, snippet: r.body.slice(0, 160), anchor: JSON.parse(r.anchor), createdAt: r.created_at, read: !!r.read_at }));
}
export async function notebookReadMention(s: Session, commentId: number) {
  human(s); const row = await s.one('SELECT t.page_id FROM notebook_mentions n JOIN notebook_comments c ON c.id=n.comment_id AND c.team_id=n.team_id JOIN notebook_threads t ON t.id=c.thread_id AND t.team_id=c.team_id WHERE n.comment_id=? AND n.team_id=? AND n.member_id=? AND c.deleted_at IS NULL', commentId, s.ctx.teamId, s.ctx.memberId);
  if (!row) throw new NotebookError('Mention unavailable', 404); await s.item('page', row.page_id);
  await s.run('UPDATE notebook_mentions SET read_at=COALESCE(read_at,?) WHERE comment_id=? AND team_id=? AND member_id=?', new Date().toISOString(), commentId, s.ctx.teamId, s.ctx.memberId);
  return { commentId, read: true };
}

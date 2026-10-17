// "@Jenny" in a notebook page: picking a member from the @ list pings them.
// Each ping is a row in notebook_page_mentions (the notebook's Mentions inbox)
// plus a notification that opens the page. Only members who can open the page
// can be mentioned, and the notification never carries a protected title.
import { NotebookError, type Session } from './notebook.js';
import { notebookMentionMembers } from './notebookDiscussions.js';

/** The same person pinged on the same page by the same member within this window counts once (undo/redo, retyping). */
export const PAGE_MENTION_REPEAT_MS = 10 * 60 * 1000;
const MAX_PER_PING = 10;

export type PageMentionResult = {
  /** Members who were pinged now (not ones pinged moments ago, and never the author). */
  notified: { id: number; name: string }[];
  /** For the notification: who did it, and the page's title unless the page is protected. */
  by: string; pageId: number; title: string | null;
};

function human(s: Session) { if (!s.access.human) throw new NotebookError('Mentions are available to team members only', 403); }

export async function notebookPageMention(s: Session, pageId: number, body: Record<string, any>): Promise<PageMentionResult> {
  human(s); s.require('edit_notebook');
  const page = await s.item('page', pageId);
  const raw = body?.memberIds;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_PER_PING) throw new NotebookError(`Mention 1 to ${MAX_PER_PING} team members at a time`);
  const ids = [...new Set(raw.map(Number))];
  if (ids.some(n => !Number.isSafeInteger(n) || n < 1)) throw new NotebookError('Invalid member');
  const eligible = new Map((await notebookMentionMembers(s, pageId)).map(m => [m.id, m.name] as const));
  if (ids.some(n => !eligible.has(n))) throw new NotebookError('A mentioned member cannot open this page');
  const now = new Date(), since = new Date(now.getTime() - PAGE_MENTION_REPEAT_MS).toISOString();
  const notified: { id: number; name: string }[] = [];
  for (const memberId of ids) {
    if (memberId === s.ctx.memberId) continue;
    const recent = await s.one('SELECT id FROM notebook_page_mentions WHERE team_id=? AND page_id=? AND member_id=? AND mentioned_by=? AND created_at>=?', s.ctx.teamId, pageId, memberId, s.ctx.memberId, since);
    if (recent) continue;
    await s.run('INSERT INTO notebook_page_mentions(team_id,page_id,member_id,mentioned_by,created_at) VALUES(?,?,?,?,?)', s.ctx.teamId, pageId, memberId, s.ctx.memberId, now.toISOString());
    notified.push({ id: memberId, name: eligible.get(memberId) ?? 'Team member' });
  }
  const me = await s.one('SELECT name FROM members WHERE id=? AND team_id=?', s.ctx.memberId, s.ctx.teamId);
  return { notified, by: me?.name || 'A teammate', pageId, title: await s.isProtected(page) ? null : (page.title || 'Untitled') };
}

/** Page mentions for the Mentions inbox, filtered to pages the reader can open now. */
export async function notebookPageMentionInbox(s: Session, visible: Set<number>) {
  const rows = await s.all('SELECT n.id,n.page_id,n.created_at,n.read_at,p.title,m.name AS by_name FROM notebook_page_mentions n JOIN notebook_pages p ON p.id=n.page_id AND p.team_id=n.team_id LEFT JOIN members m ON m.id=n.mentioned_by AND m.team_id=n.team_id WHERE n.team_id=? AND n.member_id=? AND p.deleted_at IS NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 500', s.ctx.teamId, s.ctx.memberId);
  return rows.filter(r => visible.has(r.page_id)).slice(0, 100).map(r => ({
    pageMentionId: Number(r.id), pageId: Number(r.page_id), title: r.title, by: r.by_name || 'A teammate',
    snippet: `${r.by_name || 'A teammate'} mentioned you on this page`, createdAt: r.created_at, read: !!r.read_at,
  }));
}

export async function notebookReadPageMention(s: Session, mentionId: number) {
  human(s);
  const row = await s.one('SELECT page_id FROM notebook_page_mentions WHERE id=? AND team_id=? AND member_id=?', mentionId, s.ctx.teamId, s.ctx.memberId);
  if (!row) throw new NotebookError('Mention not found', 404);
  await s.item('page', Number(row.page_id)); // still allowed to open it
  await s.run('UPDATE notebook_page_mentions SET read_at=COALESCE(read_at,?) WHERE id=? AND team_id=? AND member_id=?', new Date().toISOString(), mentionId, s.ctx.teamId, s.ctx.memberId);
  return { ok: true, pageId: Number(row.page_id) };
}

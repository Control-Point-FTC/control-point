import type { NotebookSync } from './NotebookSync';
const active = new Set<NotebookSync>();
export function registerNotebookSession(session: NotebookSync) { active.add(session); return () => { active.delete(session); }; }
export function notebookExitNeedsSave(){return [...active].some(session=>session.pending&&!session.locallyDurable);}
export function findNotebookSession(pageId: number, scope?: { memberId: number; teamId: number }) {
  return [...active].find(s => s.pageId === pageId && s.scope?.memberId === scope?.memberId && s.scope?.teamId === scope?.teamId && s.status !== 'unavailable');
}
export async function prepareNotebookExit(mode: 'switch' | 'logout' = 'switch'): Promise<boolean> {
  for (const session of active) {
    if (!session.pending) continue;
    if (mode === 'switch' && session.locallyDurable) continue;
    if (await session.flush()) continue;
    // Switching may retain an ordinary page's durable journal. Logging out
    // clears that journal, so its pending work must reach the server first.
    if (mode === 'logout' || !await session.persist()) return false;
  }
  if (mode === 'logout') {
    // A reload can leave journals that have no live editor. Do not erase those
    // edits merely because this tab has not reopened their pages yet.
    const { pendingNotebookJournals } = await import('./offlineJournal');
    try { if ((await pendingNotebookJournals()).length) return false; }
    catch { /* Unavailable storage is not evidence of unsaved work. Active
      * pending sessions have already been checked above. */ }
  }
  return true;
}
export async function clearNotebookData() {
  for (const session of active) session.destroy();
  active.clear();
  const { clearNotebookJournals } = await import('./offlineJournal');
  const { clearCachedNotebookTrees } = await import('./offlineTree');
  const results=await Promise.allSettled([clearNotebookJournals(),clearCachedNotebookTrees()]);
  const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
}

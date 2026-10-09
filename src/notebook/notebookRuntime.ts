import type { NotebookSync } from './NotebookSync';
const active = new Set<NotebookSync>();
export function registerNotebookSession(session: NotebookSync) { active.add(session); return () => { active.delete(session); }; }
export async function prepareNotebookExit(mode: 'switch' | 'logout' = 'switch'): Promise<boolean> {
  for (const session of active) {
    if (!session.pending) continue;
    if (await session.flush()) continue;
    // Switching may retain an ordinary page's durable journal. Logging out
    // clears that journal, so its pending work must reach the server first.
    if (mode === 'logout' || !await session.persist()) return false;
  }
  return true;
}
export async function clearNotebookData() {
  for (const session of active) session.destroy();
  active.clear();
  const { clearNotebookJournals } = await import('./offlineJournal');
  await clearNotebookJournals();
}

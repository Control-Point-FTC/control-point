// After a confirmed Bruno card: where each kind of change can be seen. One
// new record opens itself; several open their page.
export type ResultLink = { label: string; to: string };
export type AppliedResult = { applied: Record<string, number>; created: Record<string, number[]> };

export function resultLinks({ applied, created }: AppliedResult): ResultLink[] {
  const links: ResultLink[] = [];
  const ids = (k: string) => (created[k] ?? []).filter((n) => Number.isSafeInteger(n) && n > 0);
  if (applied.task) {
    const t = ids('task');
    links.push(t.length === 1 ? { label: 'View task', to: `/tasks?task=${t[0]}` } : { label: `View ${applied.task} tasks`, to: '/tasks' });
  }
  if (applied.event) {
    const e = ids('event');
    links.push(e.length >= 1 ? { label: applied.event === 1 ? 'View in calendar' : 'View calendar', to: `/calendar?event=${e[0]}` } : { label: 'View calendar', to: '/calendar' });
  }
  if (applied['delete-event'] && !applied.event) links.push({ label: 'Open calendar', to: '/calendar' });
  if (applied.outreach) links.push({ label: 'View outreach', to: '/outreach' });
  if (applied.communication) links.push({ label: 'View communications', to: '/comm' });
  if (applied.budget) links.push({ label: 'View budget', to: '/budget' });
  return links;
}

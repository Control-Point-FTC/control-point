// Importing a team's official FIRST competitions into its calendar: which of
// the team's events (from FIRST Events / FTC Scout, merged by code) to add.
// Pure, so it's tested without any network calls.

export type FirstTeamEventRow = { code?: string | null; name?: string | null; date?: string | null; type?: string | null };
export type FirstImportItem = { code: string; title: string; date: string; event_type: "competition" | "scrimmage" };

/** Events to add: a real code and date, not imported before (case-insensitive), one per code. */
export function planFirstImport(events: FirstTeamEventRow[], alreadyImported: Iterable<string>): FirstImportItem[] {
  const have = new Set([...alreadyImported].map((c) => String(c).toLowerCase()));
  const out: FirstImportItem[] = [];
  for (const e of events || []) {
    const code = String(e?.code || "").trim();
    const date = String(e?.date || "").slice(0, 10);
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date) || have.has(code.toLowerCase())) continue;
    have.add(code.toLowerCase());
    const type = /scrimmage/i.test(String(e?.type || "")) ? "scrimmage" : "competition";
    out.push({ code, title: String(e?.name || code).trim().slice(0, 120), date, event_type: type });
  }
  return out;
}

/**
 * The team's listed events from a getTeamData payload, or null when no event
 * source answered and nothing came back (an outage, not an empty season: ask
 * to retry). One source failing while the other answered is a real answer.
 */
export function listedEvents(payload: any): FirstTeamEventRow[] | null {
  const listed = payload?.data?.events ?? payload?.events ?? [];
  const rows = Array.isArray(listed) ? listed : [];
  const answered = payload?.eventsOk ?? !payload?.partial;
  return !answered && !rows.length ? null : rows;
}

/** The planned events this request actually wrote (INSERT OR IGNORE skips ones a parallel import added). */
export function insertedOnly<T>(plan: T[], results: { changes?: number }[]): T[] {
  return plan.filter((_, i) => Number(results[i]?.changes || 0) > 0);
}

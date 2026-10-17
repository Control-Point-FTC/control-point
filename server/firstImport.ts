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

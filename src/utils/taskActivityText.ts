// A task's history in plain words: shared by the task sheet's timeline and
// Bruno's task_activity lookup, so both say the same thing.

/** One activity entry in plain words ("Ada moved it from To do to In progress"). Names come from `nameOf`. */
export function describeActivity(row: { kind: string; detail?: unknown; member_id?: number | null }, nameOf: (id: number | null | undefined) => string): string {
  // Stored as JSON text (server) or already parsed (the timeline API).
  let d: any = {};
  if (row.detail && typeof row.detail === "object") d = row.detail;
  else if (typeof row.detail === "string") { try { d = JSON.parse(row.detail); } catch { /* keep empty */ } }
  const who = nameOf(row.member_id);
  const label = (s: unknown) => ({ "todo": "To do", "in-progress": "In progress", "done": "Done", "cancelled": "Cancelled" } as Record<string, string>)[String(s)] ?? String(s ?? "");
  const via = d.via === "bruno" ? " (through Bruno)" : "";
  switch (row.kind) {
    case "created": return `${who} created it${via}`;
    case "status": return `${who} moved it from ${label(d.from)} to ${label(d.to)}${via}`;
    case "renamed": return `${who} renamed it to "${String(d.to ?? "").slice(0, 80)}"${via}`;
    case "description": return `${who} edited the description${via}`;
    case "due": return d.to ? `${who} set it due ${d.to}${d.time ? ` ${d.time}` : ""}${via}` : `${who} removed the due date${via}`;
    case "start": return d.to ? `${who} set it to start ${d.to}${via}` : `${who} removed the start date${via}`;
    case "priority": return d.to ? `${who} set priority to ${d.to}${via}` : `${who} removed the priority${via}`;
    case "repeat": return d.to ? `${who} made it repeat${via}` : `${who} stopped it repeating${via}`;
    case "completion_mode": return d.to === "each" ? `${who} made everyone complete it separately${via}` : `${who} made it one shared deliverable${via}`;
    case "tags": return `${who} changed its tags${via}`;
    case "board": return d.to ? `${who} made it a board task${via}` : `${who} made it visible to the team${via}`;
    case "assignees": {
      const parts = [
        Array.isArray(d.added) && d.added.length ? `assigned ${d.added.map((m: number) => nameOf(m)).join(", ")}` : "",
        Array.isArray(d.removed) && d.removed.length ? `unassigned ${d.removed.map((m: number) => nameOf(m)).join(", ")}` : "",
      ].filter(Boolean);
      return `${who} ${parts.join(" and ") || "changed who is assigned"}${via}`;
    }
    case "completed": return `${who} completed it${via}`;
    case "part_done": return `${who} finished their part${via}`;
    case "approved": return `${who} approved the work${via}`;
    case "sent_back": return `${who} sent it back for changes${via}`;
    case "links": return `${who} changed its links${via}`;
    default: return `${who} updated it${via}`;
  }
}


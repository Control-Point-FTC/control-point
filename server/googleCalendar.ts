// The Google Calendar copy of a team event. Times are the team's local wall
// clock, so a timed event carries the team's IANA time zone: Google rejects a
// dateTime with neither an offset nor a timeZone.

export type TeamEvent = {
  title?: string | null;
  description?: string | null;
  location?: string | null;
  date: string;          // YYYY-MM-DD
  start_time?: string | null; // HH:MM, "" for all-day
  end_time?: string | null;   // HH:MM, "" when not set
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const minutes = (hhmm: string) => {
  const m = HHMM.exec(hhmm)!;
  return Number(m[1]) * 60 + Number(m[2]);
};
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;

export function googleEventBody(event: TeamEvent, timeZone: string) {
  const body: Record<string, unknown> = {
    summary: event.title || "Team event",
    description: `${event.description || ""}\n\n— via Control Point`.trim(),
    location: event.location || "",
  };
  const start = (event.start_time || "").trim();
  if (HHMM.test(start)) {
    const end = (event.end_time || "").trim();
    const startMin = minutes(start);
    // No end: one hour. An end at or before the start runs past midnight.
    let endMin = HHMM.test(end) ? minutes(end) : startMin + 60;
    if (endMin <= startMin && HHMM.test(end)) endMin += 24 * 60;
    const endDate = addDaysIso(event.date, Math.floor(endMin / (24 * 60)));
    body.start = { dateTime: `${event.date}T${clock(startMin)}`, timeZone };
    body.end = { dateTime: `${endDate}T${clock(endMin % (24 * 60))}`, timeZone };
  } else {
    body.start = { date: event.date };
    body.end = { date: addDaysIso(event.date, 1) };
  }
  return body;
}

/** Google's token endpoint says the refresh token itself is dead (revoked or
 *  expired): only then is a member's link dropped. A server problem such as
 *  "invalid_client" (bad credentials) must not unlink everyone. */
export function isDeadRefreshToken(status: number, body: unknown): boolean {
  return (status === 400 || status === 401) && (body as any)?.error === "invalid_grant";
}

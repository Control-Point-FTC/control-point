// Bruno's references to app records. Bruno writes [name](ref:<type>:<id>)
// inline; when the reply is finished the server checks every one and appends
// the survivors as a ```refs block, which the chat renders as link chips.
// A reference survives only when all three hold:
//   1. its id was in what Bruno was given this turn (the workspace summary,
//      the open screen, lookup results), written as "#<id>": Bruno never
//      invents ids;
//   2. it resolves for this member (resolveRef: ok, or deleted for something
//      they could see), so a chip never points at hidden content;
//   3. Bruno's name for it matches the record's real name, which catches a
//      right id with the wrong type (task #12 vs event #12).
// Anything else stays plain text. Chips re-check access when clicked.
import { isRefType, type RefResult, type RefType } from "./refs.js";

export type BrunoRef = { type: RefType; id: number; label: string; status: "ok" | "deleted" };
const LINK_RE = /\[([^\]\n]{1,200})\]\(ref:([a-z_]{1,20}):(\d{1,12})\)/g;
const MAX_REFS = 40;

export function refCandidates(text: string): { label: string; type: RefType; id: number }[] {
  const out: { label: string; type: RefType; id: number }[] = [];
  for (const m of String(text || "").matchAll(LINK_RE)) {
    if (isRefType(m[2])) out.push({ label: m[1], type: m[2], id: Number(m[3]) });
    if (out.length >= MAX_REFS) break;
  }
  return out;
}

/** The id was shown to Bruno this turn as "#<id>" (not as part of a longer number). */
export function idInContext(context: string, id: number) {
  return new RegExp(`#${id}(?!\\d)`).test(context);
}

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(w => w.length > 1);
/** Bruno's name for the record matches its real one (containment, or most words shared). */
export function labelsMatch(said: string, actual: string) {
  const a = words(said), b = words(actual);
  if (!a.length || !b.length) return false;
  const as = a.join(" "), bs = b.join(" ");
  if (as.includes(bs) || bs.includes(as)) return true;
  const shared = a.filter(w => b.includes(w)).length;
  return shared / Math.min(a.length, b.length) >= 0.6;
}

export async function validateRefs(text: string, context: string, resolve: (type: RefType, id: number) => Promise<RefResult>): Promise<BrunoRef[]> {
  const seen = new Map<string, BrunoRef>();
  for (const c of refCandidates(text)) {
    const key = `${c.type}:${c.id}`;
    if (seen.has(key) || !idInContext(context, c.id)) continue;
    const r = await resolve(c.type, c.id);
    if ((r.status === "ok" || r.status === "deleted") && labelsMatch(c.label, r.label)) seen.set(key, { type: c.type, id: c.id, label: r.label, status: r.status });
  }
  return [...seen.values()];
}

/** The block appended to the reply (and saved with it); nothing when empty. */
export function refsBlock(teamId: number, refs: BrunoRef[]) {
  return refs.length ? `\n\n\`\`\`refs\n${JSON.stringify({ team: teamId, refs })}\n\`\`\`` : "";
}

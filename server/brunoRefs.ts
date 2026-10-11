// Bruno's references to app records. Bruno writes [name](ref:<type>:<id>)
// inline; when the reply is finished the server checks every one and appends
// the survivors as a ```refs block, which the chat renders as link chips.
// A reference survives only when all three hold:
//   1. that record (type and id) was one Bruno was actually given this turn:
//      each context source (workspace facts, team snapshot, open screen,
//      lookup results) records the records it lists, so examples in the
//      instructions or ids typed inside notes don't count. Bruno never
//      invents ids, and a task's id can't be passed off as an event's;
//   2. it resolves for this member (resolveRef: ok, or deleted for something
//      they could see), so a chip never points at hidden content;
//   3. Bruno's name for it matches the record's real name, which catches a
//      right id with the wrong type (task #12 vs event #12).
// Anything else stays plain text. Chips re-check access when clicked.
import { isRefType, type RefResult, type RefType } from "./refs.js";

export type BrunoRef = { type: RefType; id: number; label: string; status: "ok" | "deleted" };
// The label may contain escaped brackets: [Intake \[v2\]](ref:page:31).
const LINK_RE = /\[((?:\\.|[^\]\\\n]){1,200})\]\(ref:([a-z_]{1,20}):(\d{1,12})\)/g;
const unescape = (s: string) => s.replace(/\\(.)/g, "$1");
const MAX_REFS = 40;

export function refCandidates(text: string): { label: string; type: RefType; id: number }[] {
  const out: { label: string; type: RefType; id: number }[] = [];
  for (const m of String(text || "").matchAll(LINK_RE)) {
    if (isRefType(m[2])) out.push({ label: unescape(m[1]), type: m[2], id: Number(m[3]) });
    if (out.length >= MAX_REFS) break;
  }
  return out;
}

const flat = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(w => w.length > 1);
/** Bruno's name for the record matches its real one (containment, or most words shared). */
export function labelsMatch(said: string, actual: string) {
  if (flat(said) && flat(said) === flat(actual)) return true; // exact, even one-letter names
  const a = words(said), b = words(actual);
  if (!a.length || !b.length) return false;
  const as = a.join(" "), bs = b.join(" ");
  if (as.includes(bs) || bs.includes(as)) return true;
  const shared = a.filter(w => b.includes(w)).length;
  return shared / Math.min(a.length, b.length) >= 0.6;
}

/** `shown`: "type:id" of every record Bruno was given this turn. */
export async function validateRefs(text: string, shown: ReadonlySet<string>, resolve: (type: RefType, id: number) => Promise<RefResult>): Promise<BrunoRef[]> {
  const seen = new Map<string, BrunoRef>();
  for (const c of refCandidates(text)) {
    const key = `${c.type}:${c.id}`;
    if (seen.has(key) || !shown.has(key)) continue;
    const r = await resolve(c.type, c.id);
    if ((r.status === "ok" || r.status === "deleted") && labelsMatch(c.label, r.label)) seen.set(key, { type: c.type, id: c.id, label: r.label, status: r.status });
  }
  return [...seen.values()];
}

/** Only the server writes a refs block: drop any the model wrote itself. */
export const stripModelRefs = (text: string) => String(text || "").replace(/```refs[\s\S]*?(```|$)/g, "");

/**
 * The same for a stream: removes every ```refs … ``` section from the model's
 * text as it arrives, holding back a tail that could be the start (or end) of
 * one, so the chat never shows a model-made block, even for a moment.
 */
export function createRefsFilter() {
  const OPEN = "```refs", CLOSE = "```";
  let buf = "", inBlock = false;
  return {
    push(chunk: string): string {
      buf += chunk;
      let out = "";
      for (;;) {
        if (!inBlock) {
          const at = buf.indexOf(OPEN);
          if (at >= 0) { out += buf.slice(0, at); buf = buf.slice(at + OPEN.length); inBlock = true; continue; }
          let keep = 0;
          for (let k = Math.min(OPEN.length - 1, buf.length); k > 0; k--) if (OPEN.startsWith(buf.slice(buf.length - k))) { keep = k; break; }
          out += buf.slice(0, buf.length - keep); buf = buf.slice(buf.length - keep);
          return out;
        }
        const end = buf.indexOf(CLOSE);
        if (end >= 0) { buf = buf.slice(end + CLOSE.length); inBlock = false; continue; }
        buf = buf.slice(Math.max(0, buf.length - (CLOSE.length - 1)));
        return out;
      }
    },
    /** What's left at the end (an unfinished block is dropped). */
    end(): string { const out = inBlock ? "" : buf; buf = ""; inBlock = false; return out; },
  };
}

/** The block appended to the reply (and saved with it); nothing when empty. */
export function refsBlock(teamId: number, refs: BrunoRef[]) {
  return refs.length ? `\n\n\`\`\`refs\n${JSON.stringify({ team: teamId, refs })}\n\`\`\`` : "";
}

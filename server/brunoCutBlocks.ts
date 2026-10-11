// Bruno proposals cut off by the reply length cap (V5 audit M1).
//
// The "Chat replies" ceiling (1,024 tokens by default) is sized for prose.
// A long plan ("8-week build season", 16 events) can run out mid-way through
// its ```event block: the card never appears and the promised items are
// silently lost. When a reply ends inside an unfinished action block, Bruno
// is asked once for the complete block with room to finish it. The cut-off
// partial is closed so it shows nothing, and the full block follows it, so
// the live reply and the saved one both end with a block the card can read.

/** The fenced blocks the app turns into confirm cards. */
export const ACTION_FENCES = ["event", "delete-event", "outreach", "tasks", "task-update", "budget", "communications", "notebook"] as const;

/** Room for the complete block on the second call (the per-request maximum). */
export const FINISH_BLOCK_TOKENS = 4096;

const OPEN_RE = new RegExp("```(" + ACTION_FENCES.join("|") + ")[^\\S\\r\\n]*\\r?\\n", "g");

/** The action block a reply ended inside (opened, never closed), or null. */
export function unfinishedActionBlock(text: string): { kind: string; start: number } | null {
  const src = String(text || "");
  let last: RegExpMatchArray | null = null;
  for (const m of src.matchAll(OPEN_RE)) last = m;
  if (!last || last.index === undefined) return null;
  const body = src.slice(last.index + last[0].length);
  if (/(^|\r?\n)```/.test(body)) return null;
  return { kind: last[1], start: last.index };
}

/** The instruction for the second call. */
export function finishBlockPrompt(kind: string): string {
  return `Your last reply hit the length limit in the middle of its \`\`\`${kind} block, so the app couldn't read it. ` +
    `Output that \`\`\`${kind} block again, complete from its first item to its last, ending with the closing \`\`\` fence. ` +
    `Output only the block: no other text, and don't repeat anything said before it.`;
}

/** JSON a card can use: at least one item (an object, or an array with an object). */
export function usableJson(body: string): boolean {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return false;
  }
  if (Array.isArray(v)) return v.some((x) => x && typeof x === "object");
  return !!v && typeof v === "object";
}

/** The first complete ```kind block in a text whose JSON a card can use, or null. */
export function completeBlock(text: string, kind: string): string | null {
  const re = new RegExp("```" + kind.replace(/[-]/g, "\\-") + "[^\\S\\r\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n```", "g");
  for (const m of String(text || "").matchAll(re)) if (usableJson(m[1])) return m[0];
  return null;
}

/** The cut block's own body is already complete JSON (only the closing fence
 *  was lost): closing it is enough, and regenerating would duplicate items. */
export function onlyFenceMissing(text: string, cut: { start: number }): boolean {
  const open = String(text || "").slice(cut.start);
  const body = open.slice(open.indexOf("\n") + 1).trimEnd();
  return usableJson(body);
}

/** What closes a block whose JSON is already complete. */
export const CLOSE_FENCE = "\n```\n";

/** Said instead when the block can't be finished. */
export const TOO_LONG_NOTE = "(That was too much to add in one go, so nothing was proposed. Ask me for it in two parts, e.g. the first four weeks, then the rest.)";

/**
 * What to append to a reply that ended inside an action block: a fence that
 * closes the cut-off partial (it then parses as nothing), then the complete
 * block from the second call — or the too-long note when there isn't one.
 */
export function finishCutReply(cut: { kind: string }, secondCallText: string): { appended: string; ok: boolean } {
  const block = completeBlock(secondCallText, cut.kind);
  const close = "\n```\n\n";
  return block ? { appended: `${close}${block}`, ok: true } : { appended: `${close}${TOO_LONG_NOTE}`, ok: false };
}

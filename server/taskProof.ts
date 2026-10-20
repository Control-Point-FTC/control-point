// Proof-of-work checks: Bruno reads a task's completion proof before the
// finish counts. The verdict stays on the server, bound to the exact proof it
// judged, so a client can't claim a pass it never got (POST
// /api/tasks/:id/verify-proof issues the check, /complete redeems it).

import crypto from "crypto";

export const PROOF_REQUIREMENTS = ["auto", "photo", "link", "note", "none"] as const;
export type ProofRequirement = (typeof PROOF_REQUIREMENTS)[number];
export type ProofKind = "photo" | "link" | "note";
export type ProofVerdict = "pass" | "followup" | "flag";

/** A stored requirement, or what a request asks for; anything unknown is 'auto'. */
export function cleanProofRequirement(v: unknown): ProofRequirement {
  return (PROOF_REQUIREMENTS as readonly string[]).includes(String(v)) ? (v as ProofRequirement) : "auto";
}

/** The proof fields as the server reads them (verify and complete must agree). */
export function readProof(body: any): { notes: string; link: string } {
  return {
    notes: String(body?.notes || "").trim().slice(0, 2000),
    link: String(body?.link || "").trim().slice(0, 500),
  };
}

/** A link worth opening: http(s) only, so a "javascript:" proof can't run. */
export function safeProofLink(link: string): string | null {
  return /^https?:\/\/\S+$/i.test(link) ? link : null;
}

export function proofFingerprint(notes: string, link: string, imageCount: number): string {
  return crypto.createHash("sha256").update(JSON.stringify([notes, link, imageCount])).digest("hex");
}

/**
 * What the proof must contain no matter what Bruno says. Returns the error to
 * show, or null when it's enough to look at.
 */
export function proofShortfall(req: ProofRequirement, p: { notes: string; link: string; images: number }): string | null {
  if (req === "none") return null;
  if (!p.notes && !p.link && p.images === 0) return "Add a description, a link, or at least one photo as proof of completion.";
  if (req === "photo" && p.images === 0) return "This task needs a photo as proof. Attach at least one.";
  if (req === "link" && !p.link && p.notes.length < 20) return "This task needs a link to the work, or a detailed note about where it was done.";
  return null;
}

export interface ProofCheck {
  taskId: number;
  memberId: number;
  fingerprint: string;
  verdict: ProofVerdict;
  required: ProofKind;
  message: string;
  at: number;
}

/** Bruno's verdicts waiting to be redeemed by a completion (single process, so
 *  memory is enough; a restart only means the finish goes to a manager). */
export class ProofCheckStore {
  private checks = new Map<string, ProofCheck>();
  constructor(private ttlMs = 30 * 60 * 1000, private now: () => number = Date.now) {}

  issue(c: Omit<ProofCheck, "at">): string {
    const id = crypto.randomBytes(16).toString("hex");
    this.checks.set(id, { ...c, at: this.now() });
    return id;
  }

  /** The check for this exact proof, used up on read. Null if it doesn't
   *  match (another task, member or proof) or has expired. */
  redeem(id: unknown, taskId: number, memberId: number, fingerprint: string): ProofCheck | null {
    if (typeof id !== "string" || !id) return null;
    const c = this.checks.get(id);
    if (!c) return null;
    if (c.taskId !== taskId || c.memberId !== memberId || c.fingerprint !== fingerprint) return null;
    this.checks.delete(id);
    if (this.now() - c.at > this.ttlMs) return null;
    return c;
  }

  sweep() {
    const t = this.now();
    for (const [k, c] of this.checks) if (t - c.at > this.ttlMs) this.checks.delete(k);
  }
}

/**
 * The review a non-manager's finish starts with. A manager's own finish is
 * approved by the caller before this is asked.
 *  - no proof needed: approved
 *  - Bruno passed it and it isn't code/digital work: approved by Bruno
 *  - anything else (flagged, unchecked, link work): a manager reviews it
 */
export function initialReview(req: ProofRequirement, check: ProofCheck | null): { status: "approved" | "pending"; byBruno: boolean } {
  if (req === "none") return { status: "approved", byBruno: false };
  const needsHuman = req === "link" || check?.required === "link";
  if (check?.verdict === "pass" && !needsHuman) return { status: "approved", byBruno: true };
  return { status: "pending", byBruno: false };
}

export const PROOF_CHECK_SYSTEM = `You verify task-completion proof for a student FIRST Tech Challenge robotics team. Be strict but fair: students do real work, but a single character, "done", or one vague word is not proof.
Return ONLY a JSON object, no markdown fences, no commentary: {"required": "photo"|"link"|"note", "verdict": "pass"|"followup"|"flag", "message": "..."}
- "required": the proof type this task needs. photo = physical build or CAD work (a picture shows it). link = code or digital work (GitHub, Onshape, Colab, docs link). note = a written description is enough.
- "verdict": "pass" if the submission credibly shows the work; "followup" if it's thin but one specific answer could fix it; "flag" if it's nonsense or clearly not real work.
- "message": for pass, one line on what convinced you (shown to the manager). For followup, ONE specific question naming exactly what's missing. For flag, why it's going to review.
You see how many photos were attached, not what is in them.`;

export function proofCheckPrompt(task: { title: string; description?: string | null }, req: ProofRequirement, p: { notes: string; link: string; images: number }, followups: unknown): string {
  const earlier = Array.isArray(followups)
    ? followups.slice(0, 4).map((f: any) => `Q: ${String(f?.q || "").slice(0, 200)} A: ${String(f?.a || "").slice(0, 400)}`).join("\n")
    : "";
  return `Task: "${String(task.title).slice(0, 200)}"${task.description ? ` (${String(task.description).slice(0, 1000)})` : ""}
Proof setting: ${req} (${req === "auto" ? "you decide what proof fits this task" : "the manager requires this"})
Submission: notes="${p.notes || "(empty)"}", link="${p.link || "(none)"}", photos attached: ${p.images}${earlier ? `\nEarlier in this check:\n${earlier}` : ""}`;
}

/** Bruno's reply as a verdict; unreadable output goes to a manager. */
export function parseProofVerdict(raw: string): { required: ProofKind; verdict: ProofVerdict; message: string } {
  let parsed: any = null;
  try {
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  } catch { /* falls through to flag */ }
  if (!parsed || !["pass", "followup", "flag"].includes(parsed.verdict)) {
    return { required: "note", verdict: "flag", message: "Bruno couldn't check this automatically, so a manager will review it." };
  }
  const required: ProofKind = ["photo", "link", "note"].includes(parsed.required) ? parsed.required : "note";
  return { required, verdict: parsed.verdict, message: String(parsed.message || "").slice(0, 500) };
}

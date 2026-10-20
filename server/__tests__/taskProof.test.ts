/**
 * Bruno checks completion proof (POST /api/tasks/:id/verify-proof, then
 * /complete with the check it issued). The real server runs against a
 * stand-in for Gemini that answers with scripted verdicts.
 *  - a finish only counts as Bruno-approved with a check issued for that
 *    member, task and exact proof; a client can't claim one
 *  - code/link work and anything Bruno didn't pass go to a manager
 *  - the task's proof setting is enforced without AI (photo, link, none)
 *  - Bruno unavailable (error, budget used up) says so, so the app can send
 *    the finish to a manager
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";

vi.setConfig({ testTimeout: 60_000 });

/** Gemini stand-in: each request gets the next scripted reply (text or an error status). */
const script: (string | number)[] = [];
let gemini: Server;
let t: TestServer;
let admin = "";
let ana = "";
let anaId = 0;
let outsider = "";

beforeAll(async () => {
  gemini = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const next = script.shift() ?? "(nothing scripted)";
      if (typeof next === "number") {
        res.writeHead(next, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: next, message: "scripted error" } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: next }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }));
    });
  });
  await new Promise<void>((r) => gemini.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(gemini.address() as AddressInfo).port}`;
  t = await startTestServer("cp-proof-", { GEMINI_API_KEY: "fake", GEMINI_API_BASE: base, ANTHROPIC_API_KEY: "" });
  const team = await seedTeam(t.db, "Robo");
  const other = await seedTeam(t.db, "Other");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@proof.test", "admin"));
  anaId = await seedMember(t.db, team, "Ana", "ana@proof.test");
  ana = await t.session(anaId);
  outsider = await t.session(await seedMember(t.db, other, "Olly", "olly@proof.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); await new Promise<void>((r) => gemini?.close(() => r())); });
beforeEach(() => { script.length = 0; });

const verdict = (v: string, required = "note", message = "Looks like real work.") => JSON.stringify({ required, verdict: v, message });

async function newTask(body: Record<string, unknown> = {}) {
  const r = await t.post("/api/tasks", { title: "Tune the arm PID", description: "", assignee_ids: [anaId], ...body }, admin);
  expect(r.status).toBe(200);
  return Number(r.body.id ?? r.body.task?.id);
}

/** Finish a task the way the app does (multipart), optionally with photos. */
async function complete(id: number, session: string, fields: Record<string, string>, photos = 0) {
  const boundary = "----cp-proof-boundary";
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const parts: Buffer[] = [];
  const CRLF = String.fromCharCode(13, 10);
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`));
  for (let i = 0; i < photos; i++) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="images"; filename="p${i}.png"${CRLF}Content-Type: image/png${CRLF}${CRLF}`), png, Buffer.from(CRLF));
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  const headers = new Headers({ "Content-Type": `multipart/form-data; boundary=${boundary}`, "X-CP-Client": "1" });
  withSession(headers, session);
  const res = await fetch(`${t.base}/api/tasks/${id}/complete`, { method: "POST", headers, body: Buffer.concat(parts) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const row = async (id: number) => (await t.db.execute({ sql: "SELECT * FROM tasks WHERE id = ?", args: [id] })).rows[0] as any;

describe("Bruno's verdict stays on the server", () => {
  it("a pass for this exact proof approves the finish as Bruno", async () => {
    const id = await newTask();
    script.push(verdict("pass", "note", "Specific tuning values and a test run."));
    const v = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Set kP to 0.012 and tested five full swings.", imageCount: 0 }, ana);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ verdict: "pass", required: "note" });
    expect(v.body.check_id).toMatch(/^[0-9a-f]{32}$/);
    const c = await complete(id, ana, { notes: "Set kP to 0.012 and tested five full swings.", check_id: v.body.check_id });
    expect(c.status).toBe(200);
    const r = await row(id);
    expect(r.review_status).toBe("approved");
    expect(r.reviewed_by).toBeNull();
    expect(r.completion_ai_note).toBe("Specific tuning values and a test run.");
    expect(JSON.parse(r.completion_history).at(-1).review).toMatchObject({ status: "approved", by: null, bruno: true });
  });

  it("a client claiming a pass without a check goes to a manager", async () => {
    const id = await newTask({ proof_requirement: "link" });
    const c = await complete(id, ana, { notes: "d".repeat(25), verified: "pass", required: "note", aiNote: "fine" });
    expect(c.status).toBe(200);
    expect((await row(id)).review_status).toBe("pending");
  });

  it("a check for different proof, another task, or used twice doesn't count", async () => {
    const a = await newTask();
    const b = await newTask();
    script.push(verdict("pass"), verdict("pass"));
    const v1 = await t.post(`/api/tasks/${a}/verify-proof`, { notes: "Rewired the arm encoder and retuned it." }, ana);
    // Same check, but the notes changed after Bruno read them.
    expect((await complete(a, ana, { notes: "d", check_id: v1.body.check_id })).status).toBe(200);
    expect((await row(a)).review_status).toBe("pending");
    // A check for task A redeemed on task B.
    const v2 = await t.post(`/api/tasks/${a}/verify-proof`, { notes: "Rewired the arm encoder and retuned it." }, ana);
    expect((await complete(b, ana, { notes: "Rewired the arm encoder and retuned it.", check_id: v2.body.check_id })).status).toBe(200);
    expect((await row(b)).review_status).toBe("pending");
  });

  it("code work Bruno passed still goes to a manager, with his note", async () => {
    const id = await newTask({ title: "Write the auto path" });
    script.push(verdict("pass", "link", "Links a commit that adds the path."));
    const proof = { notes: "Added the left auto path.", link: "https://github.com/team/robot/commit/abc123" };
    const v = await t.post(`/api/tasks/${id}/verify-proof`, proof, ana);
    expect((await complete(id, ana, { ...proof, check_id: v.body.check_id })).status).toBe(200);
    const r = await row(id);
    expect(r.review_status).toBe("pending");
    expect(r.completion_link).toBe(proof.link);
    expect(r.completion_ai_note).toBe("Links a commit that adds the path.");
  });

  it("each person completes it: a part Bruno flagged keeps the task in review even if the last part passed", async () => {
    const team = (await row(await newTask())).team_id;
    const calId = await seedMember(t.db, team, "Cal", "cal@proof.test");
    const cal = await t.session(calId);
    const id = await newTask({ title: "Fill in the safety form", assignee_ids: [anaId, calId], completion_mode: "each" });
    script.push(verdict("flag", "note", "Says nothing about the form."));
    const v1 = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "ok" }, ana);
    const part = await complete(id, ana, { notes: "ok", check_id: v1.body.check_id });
    expect(part.body.partial).toBe(true);
    script.push(verdict("pass"));
    const v2 = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Signed and turned in the safety form." }, cal);
    await complete(id, cal, { notes: "Signed and turned in the safety form.", check_id: v2.body.check_id });
    const r = await row(id);
    expect(r.status).toBe("done");
    expect(r.review_status).toBe("pending");
  });

  it("a flagged finish goes to a manager", async () => {
    const id = await newTask();
    script.push(verdict("flag", "photo", "Says nothing about the work."));
    const v = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "ok" }, ana);
    expect(v.body.verdict).toBe("flag");
    await complete(id, ana, { notes: "ok", check_id: v.body.check_id });
    expect((await row(id)).review_status).toBe("pending");
  });

  it("follow-up answers are sent to Bruno with the next check", async () => {
    const id = await newTask();
    script.push(verdict("followup", "note", "Which values did you change?"));
    const v = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Tuned it" }, ana);
    expect(v.body).toMatchObject({ verdict: "followup", message: "Which values did you change?" });
  });
});

describe("the task's proof setting, without AI", () => {
  it("no proof needed: an empty finish is accepted and approved", async () => {
    const id = await newTask({ proof_requirement: "none" });
    const v = await t.post(`/api/tasks/${id}/verify-proof`, {}, ana);
    expect(v.body).toMatchObject({ verdict: "pass", check_id: null });
    expect((await complete(id, ana, {})).status).toBe(200);
    expect((await row(id)).review_status).toBe("approved");
  });

  it("photo required: a finish without one is refused", async () => {
    const id = await newTask({ proof_requirement: "photo" });
    expect((await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Built the intake." }, ana)).status).toBe(400);
    const c = await complete(id, ana, { notes: "Built the intake." });
    expect(c.status).toBe(400);
    expect(c.body.error).toMatch(/photo/);
    expect((await complete(id, ana, { notes: "Built the intake." }, 1)).status).toBe(200);
  });

  it("link required: a link or a detailed note", async () => {
    const id = await newTask({ proof_requirement: "link" });
    expect((await complete(id, ana, { notes: "did it" })).status).toBe(400);
    expect((await complete(id, ana, { notes: "x", link: "javascript:alert(1)" })).status).toBe(400);
    expect((await complete(id, ana, { notes: "x", link: "https://cad.onshape.com/documents/1" })).status).toBe(200);
  });

  it("anything else needs some proof", async () => {
    const id = await newTask();
    expect((await complete(id, ana, {})).status).toBe(400);
  });

  it("is set on create, changed by managers only, and unknown values become auto", async () => {
    const id = await newTask({ proof_requirement: "photo" });
    expect((await row(id)).proof_requirement).toBe("photo");
    expect((await t.patch(`/api/tasks/${id}`, { proof_requirement: "none" }, ana)).status).toBe(403);
    expect((await t.patch(`/api/tasks/${id}`, { proof_requirement: "bogus" }, admin)).status).toBe(200);
    expect((await row(id)).proof_requirement).toBe("auto");
  });
});

describe("when Bruno can't check", () => {
  it("an AI error is 503 + aiUnavailable", async () => {
    const id = await newTask();
    script.push(500, 500, 500, 500);
    const v = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Rewired the arm." }, ana);
    expect(v.status).toBe(503);
    expect(v.body.aiUnavailable).toBe(true);
  });

  it("someone outside the workspace can't ask", async () => {
    const id = await newTask();
    expect((await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Rewired the arm." }, outsider)).status).toBe(404);
  });

  it("each member has their own budget; past it, aiUnavailable (not a 429)", async () => {
    const id = await newTask();
    // Earlier tests used some of Ana's 20; use up the rest.
    let last: any = null;
    for (let i = 0; i < 21; i++) {
      script.push(verdict("followup"));
      last = await t.post(`/api/tasks/${id}/verify-proof`, { notes: "Rewired the arm." }, ana);
      if (last.status === 503) break;
    }
    expect(last.status).toBe(503);
    expect(last.body.aiUnavailable).toBe(true);
    // Another member's budget is untouched.
    const benId = await seedMember(t.db, (await row(id)).team_id, "Ben", "ben@proof.test");
    const ben = await t.session(benId);
    const mine = await newTask({ assignee_ids: [benId] });
    script.length = 0;
    script.push(verdict("pass"));
    expect((await t.post(`/api/tasks/${mine}/verify-proof`, { notes: "Rewired the arm." }, ben)).status).toBe(200);
  });

  it("a manager's finish Bruno flagged waits for review; one he passed is theirs to approve", async () => {
    const flagged = await newTask();
    script.push(verdict("flag", "note", "One letter isn't proof."));
    const v = await t.post(`/api/tasks/${flagged}/verify-proof`, { notes: "d" }, admin);
    expect(v.body.verdict).toBe("flag");
    await complete(flagged, admin, { notes: "d", check_id: v.body.check_id });
    expect((await row(flagged))).toMatchObject({ review_status: "pending", reviewed_by: null, completion_ai_note: "One letter isn't proof." });
    const passed = await newTask();
    script.push(verdict("pass"));
    const v2 = await t.post(`/api/tasks/${passed}/verify-proof`, { notes: "Rewired the arm encoder." }, admin);
    await complete(passed, admin, { notes: "Rewired the arm encoder.", check_id: v2.body.check_id });
    expect((await row(passed)).review_status).toBe("approved");
  });
});

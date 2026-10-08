// Signing out other devices drops a signed-out device from its voice call
// once the reconnect grace window passes (when no kept socket remains).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
beforeAll(async () => {
  t = await startTestServer("cp-signout-voice-", { VOICE_RECONNECT_GRACE_SECONDS: "5" });
  team = await seedTeam(t.db, "Voice");
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("sign out other devices: voice calls", () => {
  it("the signed-out device leaves its call after the grace window", async () => {
    const id = await seedMember(t.db, team, "Vee", "vee@voice.test");
    const here = await t.session(id);
    const phone = await t.session(id);
    const call = Number((await t.db.execute({ sql: "INSERT INTO call_sessions (team_id, kind, created_by) VALUES (?, 'group', ?)", args: [team, id] })).lastInsertRowid);
    await t.db.execute({ sql: "INSERT INTO call_participants (session_id, member_id) VALUES (?, ?)", args: [call, id] });
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
    const closed = new Promise<number>((res) => ws.once("close", (code) => res(code)));
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: phone }));
    // Wait until the server has identified the socket: a chat message from it lands.
    const posted = async () => Number(((await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?", args: [id] })).rows[0] as any).n);
    for (let i = 0; i < 100 && (await posted()) === 0; i++) {
      ws.send(JSON.stringify({ type: "chat", content: "ready" }));
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(await posted()).toBeGreaterThan(0);
    expect((await t.post("/api/auth/sign-out-others", {}, here)).status).toBe(200);
    expect(await closed).toBe(4001);
    const leftAt = async () => (await t.db.execute({ sql: "SELECT left_at FROM call_participants WHERE session_id = ? AND member_id = ?", args: [call, id] })).rows[0] as any;
    // Still in the call during the grace window, gone after it.
    expect((await leftAt()).left_at).toBeNull();
    await new Promise((r) => setTimeout(r, 6500));
    expect((await leftAt()).left_at).not.toBeNull();
  });
});

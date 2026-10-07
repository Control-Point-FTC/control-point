/**
 * Files in Cloudflare R2 (owner decision). A local S3 stand-in plays R2:
 * new uploads go to the bucket, existing database files are copied over in
 * the background (verified), files are served from R2 with the database copy
 * as fallback, deletes remove the R2 object, and an R2 outage never loses an
 * upload. The database copy is only cleared with R2_PRUNE_DB=1.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";

vi.setConfig({ testTimeout: 60_000 });

/** A minimal S3: PUT / GET / HEAD / DELETE on /bucket/key, kept in memory. */
function s3Stub() {
  const objects = new Map<string, Buffer>();
  let failPuts = false;
  const server: Server = createServer((req, res) => {
    const key = decodeURIComponent((req.url || "").split("?")[0]);
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "PUT") {
        if (failPuts) { res.writeHead(500).end(); return; }
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200).end();
      } else if (req.method === "GET" || req.method === "HEAD") {
        const b = objects.get(key);
        if (!b) { res.writeHead(404).end(); return; }
        res.writeHead(200, { "Content-Length": String(b.length) });
        res.end(req.method === "GET" ? b : undefined);
      } else if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
      } else res.writeHead(405).end();
    });
  });
  return {
    objects,
    setFailPuts: (v: boolean) => { failPuts = v; },
    start: () => new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as AddressInfo).port))),
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

// The test environment's FormData doesn't interop with fetch, so multipart
// bodies are built by hand (as in fileStore.test.ts).
function avatarBody(bytes: string) {
  const boundary = "----cp-r2-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="me.png"\r\nContent-Type: image/png\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
const until = async (check: () => Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 250)); }
  return false;
};

async function boot(stub: ReturnType<typeof s3Stub>, extra: Record<string, string> = {}) {
  const port = await stub.start();
  return startTestServer("cp-r2-", {
    R2_ENDPOINT: `http://127.0.0.1:${port}`, R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_BUCKET: "cp-files",
    R2_SYNC_MS: "500", ...extra,
  });
}

describe("files in R2", () => {
  const stub = s3Stub();
  let t: TestServer;
  let team = 0;
  let member = 0;
  let sess = "";

  beforeAll(async () => {
    t = await boot(stub);
    team = await seedTeam(t.db, "Robo");
    member = await seedMember(t.db, team, "Ada", "ada@r2.test", "admin");
    sess = await t.session(member);
  }, 120_000);
  afterAll(async () => { await t?.stop(); await stub.stop(); });

  const getFile = async (url: string) => {
    const res = await fetch(`${t.base}${url}`, { headers: withSession(new Headers(), sess) });
    return { status: res.status, text: Buffer.from(await res.arrayBuffer()).toString() };
  };
  const row = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows[0] as any;

  it("copies existing files to R2 (verified), keeps the database copy, and serves from R2", async () => {
    const ins = await t.db.execute({
      sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, 'feedback', 'old.png', 'image/png', 9, ?)",
      args: [team, member, Buffer.from("old-bytes")],
    });
    const id = Number(ins.lastInsertRowid);
    expect(await until(async () => !!(await row("SELECT r2_key FROM stored_files WHERE id = ?", id))?.r2_key)).toBe(true);
    expect(stub.objects.get(`/cp-files/files/${id}`)?.toString()).toBe("old-bytes");
    expect(Number((await row("SELECT length(data) AS n FROM stored_files WHERE id = ?", id)).n)).toBe(9);
    // Served from R2: change R2's copy and the response follows it.
    stub.objects.set(`/cp-files/files/${id}`, Buffer.from("from-r2!!"));
    expect((await getFile(`/api/files/${id}`)).text).toBe("from-r2!!");
  });

  it("copies legacy chat images too", async () => {
    const msg = await t.db.execute({ sql: "INSERT INTO messages (team_id, sender_id, content, timestamp) VALUES (?, ?, 'pic', ?)", args: [team, member, new Date().toISOString()] });
    const ins = await t.db.execute({ sql: "INSERT INTO message_images (message_id, mime_type, data) VALUES (?, 'image/jpeg', ?)", args: [Number(msg.lastInsertRowid), Buffer.from("chat-img")] });
    const id = Number(ins.lastInsertRowid);
    expect(await until(async () => !!(await row("SELECT r2_key FROM message_images WHERE id = ?", id))?.r2_key)).toBe(true);
    expect(stub.objects.get(`/cp-files/message-images/${id}`)?.toString()).toBe("chat-img");
    expect((await getFile(`/api/message-images/${id}`)).text).toBe("chat-img");
  });

  it("new uploads go straight to R2; replacing an avatar deletes the old object", async () => {
    const upload = async (bytes: string) => {
      const { body, contentType } = avatarBody(bytes);
      const res = await fetch(`${t.base}/api/profile/avatar`, { method: "POST", body, headers: withSession(new Headers({ "Content-Type": contentType }), sess) });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    const first = await upload("avatar-one");
    expect(first.status).toBe(200);
    const firstId = Number(/\/api\/files\/(\d+)/.exec(JSON.stringify(first.body))?.[1]);
    const r = await row("SELECT r2_key, length(data) AS n FROM stored_files WHERE id = ?", firstId);
    expect(r.r2_key).toBe(`files/${firstId}`);
    expect(Number(r.n)).toBe(0); // the bytes live only in R2
    expect(stub.objects.get(`/cp-files/files/${firstId}`)?.toString()).toBe("avatar-one");
    expect((await getFile(`/api/files/${firstId}`)).text).toBe("avatar-one");
    const second = await upload("avatar-two");
    expect(second.status).toBe(200);
    expect(await until(async () => !stub.objects.has(`/cp-files/files/${firstId}`))).toBe(true);
  });

  it("an R2 outage never loses an upload: the bytes stay in the database", async () => {
    stub.setFailPuts(true);
    try {
      const { body, contentType } = avatarBody("kept-in-db");
      const res = await fetch(`${t.base}/api/profile/avatar`, { method: "POST", body, headers: withSession(new Headers({ "Content-Type": contentType }), sess) });
      expect(res.status).toBe(200);
      const id = Number(/\/api\/files\/(\d+)/.exec(JSON.stringify(await res.json()))?.[1]);
      const r = await row("SELECT r2_key, length(data) AS n FROM stored_files WHERE id = ?", id);
      expect(r.r2_key).toBeNull();
      expect(Number(r.n)).toBe("kept-in-db".length);
      expect((await getFile(`/api/files/${id}`)).text).toBe("kept-in-db");
    } finally {
      stub.setFailPuts(false);
    }
  });
});

describe("pruning the database copies (R2_PRUNE_DB=1)", () => {
  const stub = s3Stub();
  let t: TestServer;
  beforeAll(async () => { t = await boot(stub, { R2_PRUNE_DB: "1" }); }, 120_000);
  afterAll(async () => { await t?.stop(); await stub.stop(); });

  it("clears a database copy only after R2's copy is verified", async () => {
    const team = await seedTeam(t.db, "Prune");
    const ins = await t.db.execute({
      sql: "INSERT INTO stored_files (team_id, kind, filename, mime_type, size, data) VALUES (?, 'feedback', 'x.txt', 'text/plain', 5, ?)",
      args: [team, Buffer.from("prune")],
    });
    const id = Number(ins.lastInsertRowid);
    const ok = await until(async () => {
      const r = (await t.db.execute({ sql: "SELECT r2_key, length(data) AS n FROM stored_files WHERE id = ?", args: [id] })).rows[0] as any;
      return !!r?.r2_key && Number(r.n) === 0;
    });
    expect(ok).toBe(true);
    expect(stub.objects.get(`/cp-files/files/${id}`)?.toString()).toBe("prune");
  });
});

describe("owner R2 status", () => {
  it("is owner-only", async () => {
    const stub = s3Stub();
    const t = await boot(stub);
    try {
      const team = await seedTeam(t.db, "S");
      const s = await t.session(await seedMember(t.db, team, "N", "n@r2.test", "admin"));
      expect((await t.api("/api/owner/r2-status", { session: s })).status).toBe(403);
    } finally { await t.stop(); await stub.stop(); }
  });
});

describe("R2 review regressions", () => {
  const stub = s3Stub();
  let t: TestServer;
  let team = 0;
  let sess = "";
  let member = 0;
  beforeAll(async () => {
    t = await boot(stub, { R2_PRUNE_DB: "1" });
    team = await seedTeam(t.db, "Regress");
    member = await seedMember(t.db, team, "Bo", "bo@r2.test", "admin");
    sess = await t.session(member);
  }, 120_000);
  afterAll(async () => { await t?.stop(); await stub.stop(); });

  it("an empty file in the database is served as empty, not missing", async () => {
    const ins = await t.db.execute({
      sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, 'feedback', 'empty.txt', 'text/plain', 0, ?)",
      args: [team, member, Buffer.alloc(0)],
    });
    const res = await fetch(`${t.base}/api/files/${Number(ins.lastInsertRowid)}`, { headers: withSession(new Headers(), sess) });
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("rows with a bad R2 copy can't stop the rest from being pruned, and are counted", async () => {
    // 26 rows that claim an R2 copy that isn't there...
    for (let i = 0; i < 26; i++) {
      await t.db.execute({
        sql: "INSERT INTO stored_files (team_id, kind, filename, mime_type, size, data, r2_key) VALUES (?, 'feedback', 'b', 'text/plain', 3, ?, ?)",
        args: [team, Buffer.from("bad"), `files/missing-${i}`],
      });
    }
    // ...then a good one after them.
    const good = await t.db.execute({
      sql: "INSERT INTO stored_files (team_id, kind, filename, mime_type, size, data) VALUES (?, 'feedback', 'g', 'text/plain', 4, ?)",
      args: [team, Buffer.from("good")],
    });
    const id = Number(good.lastInsertRowid);
    expect(await until(async () => {
      const r = (await t.db.execute({ sql: "SELECT r2_key, length(data) AS n FROM stored_files WHERE id = ?", args: [id] })).rows[0] as any;
      return !!r?.r2_key && Number(r.n) === 0;
    }, 30_000)).toBe(true);
    // The bad rows keep their database copies.
    const kept = (await t.db.execute("SELECT COUNT(*) AS n FROM stored_files WHERE r2_key LIKE 'files/missing-%' AND length(data) = 3")).rows[0] as any;
    expect(Number(kept.n)).toBe(26);
  });

  it("deleting a file removes its R2 object even if the row hadn't recorded the key yet", async () => {
    const ins = await t.db.execute({
      sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (NULL, ?, 'avatar', 'a.png', 'image/png', 3, ?)",
      args: [member, Buffer.from("old")],
    });
    const oldId = Number(ins.lastInsertRowid);
    stub.objects.set(`/cp-files/files/${oldId}`, Buffer.from("old"));
    await t.db.execute({ sql: "UPDATE stored_files SET r2_key = NULL WHERE id = ?", args: [oldId] });
    await t.db.execute({ sql: "UPDATE members SET avatar_url = ? WHERE id = ?", args: [`/api/files/${oldId}`, member] });
    const { body, contentType } = avatarBody("new-avatar");
    const res = await fetch(`${t.base}/api/profile/avatar`, { method: "POST", body, headers: withSession(new Headers({ "Content-Type": contentType }), sess) });
    expect(res.status).toBe(200);
    expect(await until(async () => !stub.objects.has(`/cp-files/files/${oldId}`))).toBe(true);
  });
});

/**
 * V5 audit M1: profile-picture URLs (from OAuth, or saved by a member) were
 * downloaded with a plain fetch, so a URL could reach the server's own
 * network. They now go through safeGet.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { fetchAvatarImage } from "../avatarFetch";
import { UnsafeUrlError } from "../safeFetch";

let srv: Server | null = null;
afterAll(() => { srv?.close(); });

describe("avatar downloads", () => {
  it("refuse the server's own network (localhost, metadata address)", async () => {
    let hits = 0;
    srv = createServer((_req, res) => { hits++; res.writeHead(200, { "content-type": "image/png" }); res.end(Buffer.from([1, 2, 3])); });
    await new Promise<void>((r) => srv!.listen(0, "127.0.0.1", () => r()));
    const port = (srv!.address() as any).port;
    await expect(fetchAvatarImage(`http://127.0.0.1:${port}/a.png`)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(fetchAvatarImage("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(fetchAvatarImage("http://localhost/a.png")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toBe(0);
  });

  it("keeps an image under 2 MB, and reports the status otherwise", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fake = (status: number, ctype: string, data: Buffer | null) => (async () => ({ url: new URL("https://lh3.googleusercontent.com/a"), response: { status, headers: { "content-type": ctype }, data } })) as any;
    expect(await fetchAvatarImage("https://lh3.googleusercontent.com/a", fake(200, "image/png", png))).toEqual({ status: 200, buf: png, ctype: "image/png" });
    expect((await fetchAvatarImage("https://x.test/a", fake(200, "text/html", Buffer.from("<html>")))).buf).toBeNull();
    expect(await fetchAvatarImage("https://x.test/a", fake(404, "text/plain", Buffer.from("no")))).toMatchObject({ status: 404, buf: null });
  });
});

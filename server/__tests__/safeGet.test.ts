// Connection-level SSRF guards in server/safeFetch.ts: the DNS answer is
// checked at connect time (so a public-looking name that resolves to a
// private IP is refused) and every redirect hop is re-validated.
import { describe, it, expect, vi, afterEach } from "vitest";
import dns from "dns";
import axios from "axios";
import { safeGet, guardedLookup, UnsafeUrlError } from "../safeFetch";

afterEach(() => vi.restoreAllMocks());

function lookupWith(answers: { address: string; family: number }[]) {
  vi.spyOn(dns, "lookup").mockImplementation(((_h: string, _o: any, cb: any) => cb(null, answers)) as any);
}
const callLookup = (host: string, opts: any = {}) =>
  new Promise<{ err: any; address?: any; family?: any }>((resolve) =>
    guardedLookup(host, opts, (err: any, address?: any, family?: any) => resolve({ err, address, family })));

describe("guardedLookup (connect-time DNS check)", () => {
  it("refuses a public-looking name that resolves to the metadata address", async () => {
    lookupWith([{ address: "169.254.169.254", family: 4 }]);
    const r = await callLookup("totally-public.example");
    expect(r.err).toBeInstanceOf(UnsafeUrlError);
  });

  it("refuses when ANY resolved address is private (no mixed answers)", async () => {
    lookupWith([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    expect((await callLookup("mixed.example")).err).toBeInstanceOf(UnsafeUrlError);
  });

  it("passes a public answer through, in both callback shapes", async () => {
    lookupWith([{ address: "93.184.216.34", family: 4 }]);
    const single = await callLookup("ok.example");
    expect(single.err).toBeNull();
    expect(single.address).toBe("93.184.216.34");
    expect(single.family).toBe(4);
    const all = await callLookup("ok.example", { all: true });
    expect(all.address).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("safeGet", () => {
  const ok = (data = "<html></html>") => ({ status: 200, headers: { "content-type": "text/html" }, data });
  const redirect = (location: string) => ({ status: 302, headers: { location }, data: "" });

  it("wires the guarded lookup into every request and never auto-follows redirects", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue(ok() as any);
    await safeGet("https://www.revrobotics.com/rev-41-1600/");
    const cfg = get.mock.calls[0][1] as any;
    expect(cfg.lookup).toBe(guardedLookup);
    expect(cfg.maxRedirects).toBe(0);
    expect(cfg.proxy).toBe(false);
  });

  it("refuses a redirect to a private address", async () => {
    vi.spyOn(axios, "get").mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data") as any);
    await expect(safeGet("https://public.example/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("re-applies the caller's host allowlist on each hop", async () => {
    const onlyRev = (u: URL) => {
      if (u.hostname !== "www.revrobotics.com") throw new UnsafeUrlError("not REV");
    };
    vi.spyOn(axios, "get").mockResolvedValueOnce(redirect("https://evil.example/") as any);
    await expect(safeGet("https://www.revrobotics.com/x", { allowUrl: onlyRev })).rejects.toThrow("not REV");
  });

  it("follows allowed redirects up to the limit, then stops", async () => {
    const get = vi.spyOn(axios, "get")
      .mockResolvedValueOnce(redirect("/step2") as any)
      .mockResolvedValueOnce(ok("done") as any);
    const r = await safeGet("https://public.example/step1");
    expect(r.url.toString()).toBe("https://public.example/step2");
    expect(get).toHaveBeenCalledTimes(2);

    vi.spyOn(axios, "get").mockResolvedValue(redirect("/again") as any);
    await expect(safeGet("https://public.example/loop", { maxRedirects: 2 })).rejects.toThrow("Too many redirects");
  });
});

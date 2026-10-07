import { describe, it, expect } from "vitest";
import { isPrivateAddress, checkPublicUrl } from "../safeFetch";
import { RateLimiter } from "../rateLimit";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12::1",
    "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::a9fe:a9fe", "::ffff:169.254.169.254", "64:ff9b::a00:1", "not-an-ip",
  ])("refuses %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows public %s", (ip) => expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("checkPublicUrl", () => {
  it("rejects non-http, credentials, private literals and local names", () => {
    for (const u of ["ftp://x.com", "file:///etc/passwd", "http://user:pw@x.com", "http://127.0.0.1", "http://[::1]/", "http://localhost", "http://db.internal/", "http://printer.local"]) {
      expect(() => checkPublicUrl(u)).toThrow();
    }
  });
  it("accepts public http(s) URLs", () => {
    expect(checkPublicUrl("https://www.revrobotics.com/rev-41-1600/").hostname).toBe("www.revrobotics.com");
  });
});

describe("RateLimiter", () => {
  it("allows max hits per window, then reports the wait, then resets", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    const rule = { max: 3, windowMs: 60_000 };
    expect([rl.hit("k", rule), rl.hit("k", rule), rl.hit("k", rule)]).toEqual([0, 0, 0]);
    expect(rl.hit("k", rule)).toBe(60);
    t = 30_000;
    expect(rl.hit("k", rule)).toBe(30);
    t = 60_001;
    expect(rl.hit("k", rule)).toBe(0);
  });
  it("sweeps expired buckets", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    rl.hit("a", { max: 1, windowMs: 10 });
    t = 20;
    rl.sweep();
    expect(rl.size).toBe(0);
  });
});

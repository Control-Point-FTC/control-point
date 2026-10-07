// In-memory fixed-window rate limiting for the auth surface (login, signup,
// verification codes, password reset, joining with an access code).
//
// One process serves production, so a Map is enough; limits reset on
// restart, which is acceptable for throttling (not an accounting record).
// Keys combine the client IP with the targeted email where there is one, so
// a single attacker can't spray many accounts and a single account can't be
// hammered from many IPs.

export interface LimitRule {
  /** Max hits per window. */
  max: number;
  /** Window length in ms. */
  windowMs: number;
}

interface Bucket { count: number; resetAt: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private now: () => number = Date.now) {}

  /** Count one hit; returns seconds to wait when over the limit, else 0. */
  hit(key: string, rule: LimitRule): number {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + rule.windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    if (b.count > rule.max) return Math.max(1, Math.ceil((b.resetAt - t) / 1000));
    return 0;
  }

  /** Forget a key (e.g. after a successful login). */
  reset(key: string) {
    this.buckets.delete(key);
  }

  /** Drop expired buckets so the map can't grow without bound. */
  sweep() {
    const t = this.now();
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }

  get size() { return this.buckets.size; }
}

/** The caller's IP as seen by the app (nginx sets X-Real-IP; trust proxy is on). */
export function clientIp(req: any): string {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function normEmail(v: unknown): string {
  return String(v || "").trim().toLowerCase().slice(0, 320);
}

/**
 * Express middleware: every rule must pass. `keys` maps the request to one or
 * more bucket keys per rule (e.g. ip, ip+email). Over the limit → 429 with
 * Retry-After and a plain message.
 */
export function limit(limiter: RateLimiter, name: string, rules: { rule: LimitRule; key: (req: any) => string | null }[]) {
  return (req: any, res: any, next: any) => {
    let wait = 0;
    for (const { rule, key } of rules) {
      const k = key(req);
      if (!k) continue;
      wait = Math.max(wait, limiter.hit(`${name}:${k}`, rule));
    }
    if (wait > 0) {
      res.setHeader("Retry-After", String(wait));
      const mins = Math.ceil(wait / 60);
      return res.status(429).json({
        error: wait < 90 ? `Too many attempts — try again in ${wait} seconds` : `Too many attempts — try again in ${mins} minutes`,
        retryAfter: wait,
      });
    }
    next();
  };
}

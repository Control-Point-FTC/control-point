/**
 * V5 audit H1 — account pre-hijacking. A stranger signs up with the victim's
 * email and a password (unverified). The victim later signs in with OAuth,
 * which proves the email: the stranger's password must not survive that.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { forgetUnprovenPasswords } from "../oauthLink";

let db: Client;
const verified = new Set<string>();
const deps = () => ({
  isEmailVerified: async (e: string) => verified.has(e.toLowerCase()),
  dbRun: async (sql: string, ...args: any[]) => {
    const r = await db.execute({ sql, args });
    return { changes: r.rowsAffected };
  },
});
const passwords = async (email: string) =>
  (await db.execute({ sql: "SELECT team_id, password FROM members WHERE LOWER(email) = ? ORDER BY team_id", args: [email] })).rows.map((r: any) => [Number(r.team_id), r.password]);

beforeEach(async () => {
  verified.clear();
  db = createClient({ url: ":memory:" });
  await db.execute("CREATE TABLE members (id INTEGER PRIMARY KEY, team_id INTEGER, email TEXT, password TEXT)");
  await db.execute("INSERT INTO members (team_id, email, password) VALUES (1, 'victim@test.local', '$2b$10$attacker'), (2, 'Victim@Test.Local', '$2b$10$attacker2'), (3, 'other@test.local', '$2b$10$other')");
});

describe("OAuth proving an email for the first time", () => {
  it("drops every password chosen while the address was unproven", async () => {
    expect(await forgetUnprovenPasswords("VICTIM@test.local", deps())).toBe(2);
    expect(await passwords("victim@test.local")).toEqual([[1, null], [2, null]]);
    // Nobody else's account is touched.
    expect(await passwords("other@test.local")).toEqual([[3, "$2b$10$other"]]);
  });

  it("keeps the password of an account whose owner already proved the email", async () => {
    verified.add("victim@test.local");
    expect(await forgetUnprovenPasswords("victim@test.local", deps())).toBe(0);
    expect(await passwords("victim@test.local")).toEqual([[1, "$2b$10$attacker"], [2, "$2b$10$attacker2"]]);
  });

  it("does nothing without an email", async () => {
    expect(await forgetUnprovenPasswords("  ", deps())).toBe(0);
  });
});

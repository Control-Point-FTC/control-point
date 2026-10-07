// Seed a throwaway local database for manual testing (never production).
//   DATABASE_URL=file:./.data/dev.db node scripts/dev-seed.mjs
// Creates two workspaces and a verified admin who belongs to both. Login
// credentials are printed once to the terminal; nothing is written elsewhere.
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const url = process.env.DATABASE_URL || "";
if (!url.startsWith("file:")) {
  console.error("dev-seed only runs against a local file: database");
  process.exit(1);
}
const db = createClient({ url });
const email = process.env.SEED_EMAIL || "dev-admin@example.test";
const password = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");
const hash = bcrypt.hashSync(password, 10);

const team = async (name, code) =>
  Number((await db.execute({ sql: "INSERT INTO teams (name, number, access_code) VALUES (?, '1', ?)", args: [name, code] })).lastInsertRowid);
const a = await team("Dev Team A", "CP-DEVA-AAAA");
const b = await team("Dev Team B", "CP-DEVB-BBBB");
for (const t of [a, b]) {
  await db.execute({
    sql: "INSERT INTO members (team_id, name, role, email, password, is_setup, is_board, account_type, scopes) VALUES (?, 'Dev Admin', 'Admin', ?, ?, 1, 1, 'admin', '[\"admin\"]')",
    args: [t, email, hash],
  });
}
await db.execute({ sql: "INSERT OR IGNORE INTO verified_emails (email, verified_at) VALUES (?, ?)", args: [email, new Date().toISOString()] });
console.log(`seeded: ${email} / ${password}`);

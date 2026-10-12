// Google Calendar refresh tokens are stored encrypted (AES-256-GCM) with a key
// that lives only in the server's environment (CALENDAR_TOKEN_KEY in the VM's
// .env). Without a usable key, calendar linking and sync pause: nothing is
// written in plaintext and existing links are left in place, so they resume
// once the key is set.
import crypto from "crypto";

const PREFIX = "enc1:";
const MIN_KEY_LENGTH = 32;

export type CalendarKey = Buffer;

export function calendarKeyFromEnv(raw: string | undefined = process.env.CALENDAR_TOKEN_KEY): CalendarKey | null {
  const value = (raw || "").trim();
  if (value.length < MIN_KEY_LENGTH) return null;
  return crypto.scryptSync(value, "control-point-calendar", 32);
}

export function isEncryptedCalendarToken(stored: unknown): stored is string {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

export function encryptCalendarToken(plain: string, key: CalendarKey): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}.${enc.toString("base64")}.${cipher.getAuthTag().toString("base64")}`;
}

// Returns the plaintext token, or null when it can't be read with this key.
// A legacy plaintext value is returned as-is; startup encrypts those.
export function readCalendarToken(stored: unknown, key: CalendarKey): string | null {
  if (typeof stored !== "string" || !stored) return null;
  if (!isEncryptedCalendarToken(stored)) return stored;
  try {
    const [ivB64, encB64, tagB64] = stored.slice(PREFIX.length).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

type Db = {
  all: (sql: string, ...args: any[]) => Promise<any[]>;
  run: (sql: string, ...args: any[]) => Promise<unknown>;
};

// Encrypts every plaintext refresh token in place. Each row is only updated if
// it still holds the value that was read, so a link replaced meanwhile is kept.
export async function encryptStoredCalendarTokens(db: Db, key: CalendarKey): Promise<number> {
  const rows = await db.all(
    `SELECT member_id, refresh_token FROM google_calendar_links
     WHERE refresh_token IS NOT NULL AND refresh_token != '' AND refresh_token NOT LIKE '${PREFIX}%'`,
  );
  for (const row of rows) {
    await db.run(
      "UPDATE google_calendar_links SET refresh_token = ? WHERE member_id = ? AND refresh_token = ?",
      encryptCalendarToken(row.refresh_token, key), row.member_id, row.refresh_token,
    );
  }
  return rows.length;
}

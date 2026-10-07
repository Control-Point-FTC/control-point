// Cloudflare R2 for user files (owner decision: files move to R2). The
// bucket is PRIVATE: files stay team-scoped, so the app keeps doing the
// permission checks and streams the bytes from R2. Off unless configured:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   R2_ENDPOINT (optional override, e.g. a local S3 stand-in for tests)
import { AwsClient } from "aws4fetch";

export interface R2Store {
  /** Upload bytes; resolves when R2 has them. Throws on failure. */
  put(key: string, body: Uint8Array, contentType?: string | null): Promise<void>;
  /** The object's bytes, or null when it doesn't exist. Throws on other failures. */
  get(key: string): Promise<Buffer | null>;
  /** The object's size in bytes, or null when it doesn't exist. */
  size(key: string): Promise<number | null>;
  /** Delete (a missing object is fine). */
  del(key: string): Promise<void>;
}

export function r2FromEnv(env: Record<string, string | undefined>): R2Store | null {
  const account = env.R2_ACCOUNT_ID?.trim();
  const keyId = env.R2_ACCESS_KEY_ID?.trim();
  const secret = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!keyId || !secret || !bucket || (!account && !env.R2_ENDPOINT)) return null;
  const endpoint = (env.R2_ENDPOINT?.trim() || `https://${account}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  const aws = new AwsClient({ accessKeyId: keyId, secretAccessKey: secret, service: "s3", region: "auto" });
  const url = (key: string) => `${endpoint}/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const timeout = () => AbortSignal.timeout(30_000);
  return {
    async put(key, body, contentType) {
      const res = await aws.fetch(url(key), {
        method: "PUT",
        body,
        headers: { "Content-Type": contentType || "application/octet-stream", "Content-Length": String(body.byteLength) },
        signal: timeout(),
      });
      if (!res.ok) throw new Error(`R2 put ${res.status}`);
      await res.arrayBuffer().catch(() => undefined);
    },
    async get(key) {
      const res = await aws.fetch(url(key), { signal: timeout() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 get ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async size(key) {
      const res = await aws.fetch(url(key), { method: "HEAD", signal: timeout() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 head ${res.status}`);
      const n = Number(res.headers.get("content-length"));
      return Number.isFinite(n) ? n : null;
    },
    async del(key) {
      const res = await aws.fetch(url(key), { method: "DELETE", signal: timeout() });
      if (!res.ok && res.status !== 404) throw new Error(`R2 delete ${res.status}`);
    },
  };
}

/** Object key for a stored_files / message_images row. */
export const fileKey = (table: "stored_files" | "message_images", id: number) =>
  `${table === "stored_files" ? "files" : "message-images"}/${id}`;

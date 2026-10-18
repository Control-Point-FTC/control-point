// Files attached to a Bruno message, shared by the browser and the server
// (server.ts imports src/utils; see AGENTS.md rule 14).
//
// Three kinds:
//   - images (png, jpg, webp, gif) and PDFs travel as base64 and reach the
//     model as inline data (Gemini) or image/document blocks (Claude);
//   - text-like files (txt, md, csv, json, code) are read as text and put in
//     the message itself, each wrapped in a bruno-file block with its name.
//     The model then sees them on every later turn, like pasted text, and the
//     chat shows them as chips instead of a wall of text.
//
// The only size limit is the AI provider's own request limit (below).

/** Gemini's documented limit for one request carrying inline files (the
 *  base64 data plus the text). Claude's Messages API allows 32 MB, so a
 *  request that fits Gemini also fits the fallback. */
export const BRUNO_REQUEST_LIMIT_BYTES = 20 * 1024 * 1024;
/** Claude reads at most 100 images per request (Gemini allows far more); a
 *  message stays within it so the fallback can always answer. */
export const BRUNO_MAX_INLINE_FILES = 100;

/** Image types both providers read. */
export const BRUNO_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Extensions read as text (lowercase, no dot). */
export const BRUNO_TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml", "toml", "xml", "ini", "cfg", "conf", "log",
  "java", "kt", "kts", "py", "ts", "tsx", "js", "jsx", "mjs", "cjs", "c", "h", "cpp", "hpp", "cc", "cs", "go", "rs", "rb", "php",
  "swift", "scala", "gradle", "properties", "sh", "bash", "ps1", "bat", "sql", "html", "htm", "css", "scss", "vue", "svelte", "r", "m", "lua", "dart",
]);

export function fileExtension(name: string): string {
  const n = String(name || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1) : "";
}

/** True for a file Bruno reads as text (by type or extension). */
export function isTextLikeFile(name: string, mimeType: string): boolean {
  const t = String(mimeType || "").toLowerCase();
  if (t.startsWith("text/")) return true;
  if (t === "application/json" || t === "application/xml" || t === "application/x-yaml") return true;
  return BRUNO_TEXT_EXTENSIONS.has(fileExtension(name));
}

/** A name that can't break out of its block header. */
export function safeFileName(name: string): string {
  return String(name || "file.txt").replace(/["\r\n<>]/g, "").trim().slice(0, 200) || "file.txt";
}

const OPEN = (name: string) => `<<<bruno-file name="${safeFileName(name)}">>>`;
const CLOSE = "<<<end bruno-file>>>";
// The closing marker inside a file's own text would end the block early: it
// is written with a zero-width space so the block always parses back whole.
const ZWSP = "​";

/** One text file as it appears in the message. */
export function formatTextFile(name: string, text: string): string {
  const body = String(text ?? "").replace(/<<<end bruno-file>>>/g, `<<<end${ZWSP} bruno-file>>>`);
  return `${OPEN(name)}\n${body}\n${CLOSE}`;
}

/** The message text with its text files appended (what is sent and saved). */
export function withTextFiles(text: string, files: { name: string; text: string }[]): string {
  if (!files.length) return text;
  const blocks = files.map((f) => formatTextFile(f.name, f.text)).join("\n\n");
  return text.trim() ? `${text}\n\n${blocks}` : blocks;
}

const BLOCK_RE = /<<<bruno-file name="([^"\r\n]*)">>>\r?\n([\s\S]*?)\r?\n<<<end bruno-file>>>/g;
// The line the server saves after a message that carried images or PDFs.
const MARKER_RE = /\n*📎 Attached: [^\n]*$/;

/** Split a message into what the member typed, its text files and the
 *  names in its "📎 Attached:" line (images and PDFs). */
export function splitBrunoMessage(text: string): { body: string; textFiles: { name: string; text: string }[]; attachedNames: string[] } {
  const src = String(text || "");
  const textFiles: { name: string; text: string }[] = [];
  let body = src.replace(BLOCK_RE, (_m, name: string, content: string) => {
    textFiles.push({ name, text: content.replace(new RegExp(`<<<end${ZWSP} bruno-file>>>`, "g"), CLOSE) });
    return "";
  });
  let attachedNames: string[] = [];
  const m = body.match(MARKER_RE);
  if (m) {
    attachedNames = m[0].replace(/^\n*📎 Attached: /, "").split(", ").map((s) => s.trim()).filter(Boolean);
    body = body.slice(0, m.index);
  }
  return { body: body.trim(), textFiles, attachedNames };
}

/** The line saved with a message whose images / PDFs are stored beside it,
 *  so later turns still tell the model what was attached. */
export function attachedMarker(names: string[]): string {
  return names.length ? `📎 Attached: ${names.map((n) => safeFileName(n).replace(/,/g, " ")).join(", ")}` : "";
}

/** Only what the member typed: no file contents (for routing and link checks). */
export function typedText(text: string): string {
  return splitBrunoMessage(text).body;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** What the member is told when the files are more than one request can carry. */
export function tooLargeMessage(totalBytes: number): string {
  return `This message and its files come to ${formatBytes(totalBytes)}, more than the ${formatBytes(BRUNO_REQUEST_LIMIT_BYTES)} the AI provider accepts in one message. Send some of the files now and the rest in your next message.`;
}

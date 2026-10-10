// Review → Thesaurus: synonyms from WordNet 3.1 (Princeton University; the
// WordNet license permits use with its copyright notice, kept in
// node_modules/wordnet-db/LICENSE). Lookups read the sorted index files
// (loaded once, ~6 MB) and fetch each synset line by byte offset, so the
// 22 MB data files never sit in memory. No network, no AI.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
type Pos = "noun" | "verb" | "adj" | "adv";
const POS: Pos[] = ["noun", "verb", "adj", "adv"];
const LABEL: Record<Pos, string> = { noun: "Noun", verb: "Verb", adj: "Adjective", adv: "Adverb" };
const MAX_SENSES = 16, MAX_PER_POS = 6;

let dir: string | null = null;
const indexes = new Map<Pos, string>();
const fds = new Map<Pos, number>();
function wordnetDir(): string {
  if (!dir) dir = (require_("wordnet-db") as { path: string }).path;
  return dir;
}
function index(pos: Pos): string {
  let text = indexes.get(pos);
  if (text === undefined) { text = fs.readFileSync(path.join(wordnetDir(), `index.${pos}`), "latin1"); indexes.set(pos, text); }
  return text;
}

/** Binary search a sorted WordNet index file for the line of `lemma`. */
export function findIndexLine(text: string, lemma: string): string | null {
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const start = text.lastIndexOf("\n", mid - 1) + 1;
    let end = text.indexOf("\n", start); if (end < 0) end = text.length;
    const line = text.slice(start, end);
    // License header lines start with two spaces and sort before every lemma.
    const key = line.startsWith("  ") ? "" : line.slice(0, line.indexOf(" "));
    if (key === lemma) return line;
    if (key < lemma) lo = end + 1; else hi = start;
  }
  return null;
}

function readLine(pos: Pos, offset: number): string {
  let fd = fds.get(pos);
  if (fd === undefined) { fd = fs.openSync(path.join(wordnetDir(), `data.${pos}`), "r"); fds.set(pos, fd); }
  const chunks: Buffer[] = [];
  for (let at = offset; ; at += 4096) {
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, at);
    const nl = buf.subarray(0, n).indexOf(0x0a);
    chunks.push(buf.subarray(0, nl >= 0 ? nl : n));
    if (nl >= 0 || n < buf.length || chunks.length > 16) break;
  }
  return Buffer.concat(chunks).toString("latin1");
}

type Synset = { words: string[]; gloss: string; similar: number[] };
/** A data.* line: offset lexfile type w_cnt [word lex_id]... p_cnt [ptr]... | gloss */
export function parseSynset(line: string): Synset {
  const [head, ...glossParts] = line.split(" | ");
  const t = head.trim().split(/\s+/);
  const count = parseInt(t[3], 16);
  const words: string[] = [];
  let i = 4;
  for (let w = 0; w < count; w++, i += 2) words.push(t[i].replace(/\(.*\)$/, "").replace(/_/g, " "));
  const pointers = Number(t[i++]);
  const similar: number[] = [];
  for (let p = 0; p < pointers; p++, i += 4) if (t[i] === "&") similar.push(Number(t[i + 1]));
  return { words, gloss: glossParts.join(" | ").split("; \"")[0].trim(), similar };
}

/** WordNet's morphy suffix rules (no exception lists): candidate base forms. */
export function baseForms(word: string, pos: Pos): string[] {
  const rules: Record<Pos, [string, string][]> = {
    noun: [["s", ""], ["ses", "s"], ["xes", "x"], ["zes", "z"], ["ches", "ch"], ["shes", "sh"], ["men", "man"], ["ies", "y"]],
    verb: [["s", ""], ["ies", "y"], ["es", "e"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""]],
    adj: [["er", ""], ["est", ""], ["er", "e"], ["est", "e"]],
    adv: [],
  };
  const out = [word];
  for (const [suffix, ending] of rules[pos]) if (word.endsWith(suffix) && word.length > suffix.length + 1) out.push(word.slice(0, -suffix.length) + ending);
  // Doubled consonants: "running" -> "run", "stopped" -> "stop".
  const doubled = word.match(/^(.*?)([b-df-hj-np-tv-z])\2(ing|ed)$/);
  if (doubled && pos === "verb") out.push(doubled[1] + doubled[2]);
  return [...new Set(out)];
}

export type ThesaurusSense = { partOfSpeech: string; definition: string; synonyms: string[] };
export type ThesaurusResult = { word: string; senses: ThesaurusSense[] };

/** Senses and synonyms for a word or short phrase, most common senses first. */
export function lookUpWord(input: string): ThesaurusResult | null {
  const word = String(input ?? "").trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,48}$/.test(word)) return null;
  const lemma = word.replace(/\s+/g, "_");
  const senses: ThesaurusSense[] = [];
  let found = "";
  for (const pos of POS) {
    for (const form of baseForms(lemma, pos)) {
      const line = findIndexLine(index(pos), form);
      if (!line) continue;
      found ||= form.replace(/_/g, " ");
      const t = line.trim().split(/\s+/);
      const synsetCount = Number(t[2]), pointerCount = Number(t[3]);
      const offsets = t.slice(4 + pointerCount + 2, 4 + pointerCount + 2 + synsetCount).map(Number);
      let taken = 0;
      for (const offset of offsets) {
        if (senses.length >= MAX_SENSES || taken >= MAX_PER_POS) break;
        const synset = parseSynset(readLine(pos, offset));
        const extra = pos === "adj" ? synset.similar.slice(0, 4).flatMap(o => parseSynset(readLine("adj", o)).words) : [];
        const synonyms = [...new Set([...synset.words, ...extra])].filter(w => w.toLowerCase() !== form.replace(/_/g, " ")).slice(0, 20);
        if (synonyms.length) { senses.push({ partOfSpeech: LABEL[pos], definition: synset.gloss, synonyms }); taken++; }
      }
      break;
    }
  }
  return senses.length ? { word: found, senses } : null;
}

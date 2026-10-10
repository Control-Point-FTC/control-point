// Review → Thesaurus on the real WordNet files: senses with definitions,
// base forms, phrases, unknown words, and the authenticated route.
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { baseForms, findIndexLine, lookUpWord, parseSynset } from "../thesaurus";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

describe("WordNet thesaurus", () => {
  it("returns senses with part of speech, a definition and synonyms", () => {
    const r = lookUpWord("happy")!;
    expect(r.word).toBe("happy");
    expect(r.senses[0]).toMatchObject({ partOfSpeech: "Adjective" });
    expect(r.senses[0].definition).toMatch(/joy|pleasure/);
    expect(r.senses.flatMap(s => s.synonyms)).toEqual(expect.arrayContaining(["glad"]));
    expect(r.senses.flatMap(s => s.synonyms)).not.toContain("happy");
  });
  it("finds base forms and keeps every part of speech represented", () => {
    expect(lookUpWord("computers")!.word).toBe("computer");
    const running = lookUpWord("running")!;
    expect(new Set(running.senses.map(s => s.partOfSpeech))).toEqual(new Set(["Noun", "Verb", "Adjective"]));
    expect(running.senses.filter(s => s.partOfSpeech === "Noun").length).toBeLessThanOrEqual(6);
    expect(baseForms("stopped", "verb")).toContain("stop");
  });
  it("handles phrases, unknown and unsafe input", () => {
    expect(lookUpWord("ice cream")!.senses[0].synonyms).toContain("icecream");
    expect(lookUpWord("qwxzv")).toBeNull();
    expect(lookUpWord("../../etc/passwd")).toBeNull();
    expect(lookUpWord("")).toBeNull();
  });
  it("binary search and synset parsing follow the WordNet formats", () => {
    expect(findIndexLine("  1 header\napple n 1\nbanana n 1\ncherry n 1\n", "banana")).toBe("banana n 1");
    expect(findIndexLine("apple n 1\ncherry n 1\n", "banana")).toBeNull();
    const s = parseSynset("01151786 00 s 02 happy 0 well-chosen(a) 0 001 & 01148283 a 0000 | marked by good fortune; \"a happy outcome\"");
    expect(s).toEqual({ words: ["happy", "well-chosen"], gloss: "marked by good fortune", similar: [1148283] });
  });
});

describe("thesaurus route", () => {
  let t: TestServer;
  beforeAll(async () => { t = await startTestServer("cp-thesaurus-"); }, 120_000);
  afterAll(async () => { await t?.stop(); });
  it("needs a signed-in team member", async () => {
    expect((await t.api("/api/notebook/thesaurus?word=happy")).status).toBe(401);
    const team = await seedTeam(t.db, "T");
    const session = await t.session(await seedMember(t.db, team, "A", "a@thes.test"));
    const r = await t.api("/api/notebook/thesaurus?word=big", { session });
    expect(r.status).toBe(200);
    expect(r.body.senses[0].synonyms).toContain("large");
    expect((await t.api("/api/notebook/thesaurus?word=qwxzv", { session })).body).toEqual({ word: "qwxzv", senses: [] });
  });
});

/**
 * V5 audit M2: "What were the recent FTC event results in New Jersey?" —
 * none had been played yet — ended at "Checking recent … results…" with no
 * answer. A check that comes back with nothing now says so.
 */
import { describe, it, expect } from "vitest";
import { extractLookupBlocks, followUpPrompt, implicitCheck, lookupOutcome, nothingFoundNote, progressOnly, PROGRESS_ONLY_PROMPT, resolveRetry, saidNothing } from "../brunoLookup";

describe("a check that found nothing", () => {
  it("recognises a follow-up that only said Checking… again", () => {
    expect(saidNothing("")).toBe(true);
    expect(saidNothing("Checking recent New Jersey FTC event results...")).toBe(true);
    expect(saidNothing("Checking recent FTC event results in New Jersey…\n\nChecking recent FTC event results in New Jersey…")).toBe(true);
    expect(saidNothing("Looking that up…")).toBe(true);
    expect(saidNothing("Checking recent results.")).toBe(true);
    expect(saidNothing("Checking FTCScout.org…")).toBe(true);
    // Answers that merely start with a similar word are answers.
    expect(saidNothing("Looking at the results, team 123 won.")).toBe(false);
    expect(saidNothing("Checking the schedule, the event is on Dec 12.")).toBe(false);
    expect(saidNothing("Searching shows 4 NJ events so far.")).toBe(false);
    // A team number or date in a progress line doesn't make it an answer.
    expect(saidNothing("Checking recent results for team 1234.")).toBe(true);
    expect(saidNothing("Looking up the Dec 12 qualifier…")).toBe(true);
    expect(saidNothing("Checking current stock and the product page…")).toBe(true);
    expect(saidNothing("Searching for events on 2026-11-14.")).toBe(true);
    expect(saidNothing("No New Jersey events have been played yet this season.")).toBe(false);
    // The question being checked isn't a result…
    expect(saidNothing("Checking whether any NJ events have been played…")).toBe(true);
    expect(saidNothing("Looking up how many teams have registered for the qualifier.")).toBe(true);
    expect(saidNothing("Checking if the Axon MAX is in stock…")).toBe(true);
    // …but a result after it still is.
    expect(saidNothing("Checking whether events were played, none have been yet.")).toBe(false);
    expect(saidNothing("Checking whether events were played — none have been yet.")).toBe(false);
    expect(saidNothing("Checking whether events were played – none have been yet.")).toBe(false);
    expect(saidNothing("Checking whether events were played - none have been yet.")).toBe(false);
    expect(saidNothing("Checking whether it's in stock; it is.")).toBe(false);
    // A hyphenated word inside the question doesn't end it.
    expect(saidNothing("Checking whether the 8-week plan has been played…")).toBe(true);
    // Nor does a date range.
    expect(saidNothing("Checking whether the Dec 12–14 qualifier has been played…")).toBe(true);
    expect(saidNothing("Checking whether the Dec 12-14 qualifier has been played…")).toBe(true);
    expect(saidNothing("Checking whether events were played—none have been yet.")).toBe(false);
    expect(saidNothing("Checking… The Axon MAX is sold out at goBILDA ($99.99).")).toBe(false);
  });

  it("the note matches what the check found", () => {
    const web = (query: string) => [{ kind: "web", query } as any];
    // Events: where results appear.
    expect(nothingFoundNote(web("NJ FTC event results"))).toMatch(/couldn't find anything current.*ftc-events\.firstinspires\.org.*ftcscout\.org/s);
    // A part's price: no event advice.
    expect(nothingFoundNote(web("Axon MAX servo price"))).not.toMatch(/events haven't happened/);
    // Pages were found: point to them, don't claim nothing exists.
    expect(nothingFoundNote(web("NJ FTC event results"), { webSources: 2 })).toMatch(/pages I used are listed below/);
    // Team data: found rows are never called "nothing".
    const tasks = [{ kind: "tasks" } as any];
    expect(nothingFoundNote(tasks, { rows: "Lookup: tasks (open) — 3 found\n#1 Wire the hub" })).toMatch(/didn't finish the answer/);
    expect(nothingFoundNote(tasks, { rows: "Lookup: tasks (open) — SEARCH FAILED (a database error…)" })).toMatch(/didn't work just now/);
    expect(nothingFoundNote(tasks, { rows: "Lookup: tasks (open) — nothing found" })).toMatch(/couldn't find anything for that in the team's data/);
    expect(lookupOutcome("Lookup: x — 2 shown, MORE matched")).toBe("found");
  });

  it("the follow-up tells Bruno not to say Checking… again and to state an empty result", () => {
    const p = followUpPrompt("", [{ kind: "web", query: "NJ FTC results" } as any]);
    expect(p).toContain('don\'t say "Checking…" again');
    expect(p).toMatch(/no events have been played yet this season/);
  });
});

describe("a first reply that only said Checking… without asking for a lookup", () => {
  const question = "What were the recent FTC event results in New Jersey?";
  it("becomes a web check of the question, so the lookup pass answers", () => {
    const out = implicitCheck("Checking recent New Jersey event results...", question)!;
    expect(out).toBeTruthy();
    const { text, queries } = extractLookupBlocks(out);
    expect(text).toBe("Checking recent New Jersey event results...");
    expect(queries).toEqual([{ kind: "web", query: question }]);
  });
  it("leaves real answers, replies that asked for a lookup, and empty replies alone", () => {
    expect(implicitCheck("No New Jersey events have been played yet this season.", question)).toBeNull();
    expect(implicitCheck("Checking recent New Jersey event results...\n\nResults haven’t been posted yet.", question)).toBeNull();
    expect(implicitCheck('Checking…\n```lookup\n{"kind":"web","query":"NJ FTC"}\n```', question)).toBeNull();
    expect(implicitCheck("", question)).toBeNull();
    expect(implicitCheck("Checking…", "   ")).toBeNull();
  });
  it("keeps the search to 200 characters on one line", () => {
    const { queries } = extractLookupBlocks(implicitCheck("Looking that up…", "a\n".repeat(300))!);
    expect(queries[0].query!.length).toBeLessThanOrEqual(200);
    expect(queries[0].query).not.toContain("\n");
  });
  it("progressOnly spots exactly those replies", () => {
    expect(progressOnly("Checking recent New Jersey event results...")).toBe(true);
    expect(progressOnly("Checking messages from Arnav on October 6…")).toBe(true);
    expect(progressOnly("No events yet.")).toBe(false);
    expect(progressOnly('Checking…\n```lookup\n{"kind":"messages"}\n```')).toBe(false);
    expect(progressOnly("")).toBe(false);
  });
});

describe("asking again after a bare Checking…", () => {
  const first = "Checking messages from Arnav on October 6…";
  const question = "What did Arnav say on October 6 in #general?";
  it("runs the team lookup the model asks for (not a web search)", () => {
    const r = resolveRetry(first, '```lookup\n{"kind":"messages","channel":"general","person":"Arnav","from":"2026-10-06","to":"2026-10-06"}\n```', question)!;
    expect(r.kind).toBe("lookup");
    const { text, queries } = extractLookupBlocks(r.text);
    expect(text).toBe(first);
    expect(queries).toEqual([{ kind: "messages", channel: "general", person: "Arnav", from: "2026-10-06", to: "2026-10-06" }]);
  });
  it("keeps an answer it gives instead", () => {
    expect(resolveRetry(first, "Arnav said the intake is done and posted a photo.", question)).toEqual({ kind: "answer", text: "Arnav said the intake is done and posted a photo." });
  });
  it("still nothing (or the retry failed): a web check of the question", () => {
    for (const retry of ["Checking again…", "", null]) {
      const r = resolveRetry("Checking recent New Jersey event results...", retry, "What were the recent FTC event results in New Jersey?")!;
      expect(r.kind).toBe("web");
      expect(extractLookupBlocks(r.text).queries).toEqual([{ kind: "web", query: "What were the recent FTC event results in New Jersey?" }]);
    }
  });
  it("tells the model what to do instead of checking again", () => {
    expect(PROGRESS_ONLY_PROMPT).toMatch(/didn't ask for a lookup/);
    expect(PROGRESS_ONLY_PROMPT).toMatch(/```lookup/);
  });
});

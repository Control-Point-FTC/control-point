/**
 * V5 audit M2: "What were the recent FTC event results in New Jersey?" —
 * none had been played yet — ended at "Checking recent … results…" with no
 * answer. A check that comes back with nothing now says so.
 */
import { describe, it, expect } from "vitest";
import { followUpPrompt, lookupOutcome, nothingFoundNote, saidNothing } from "../brunoLookup";

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

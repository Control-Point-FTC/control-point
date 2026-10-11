/**
 * V5 audit M2: "What were the recent FTC event results in New Jersey?" —
 * none had been played yet — ended at "Checking recent … results…" with no
 * answer. A check that comes back with nothing now says so.
 */
import { describe, it, expect } from "vitest";
import { followUpPrompt, nothingFoundNote, saidNothing } from "../brunoLookup";

describe("a check that found nothing", () => {
  it("recognises a follow-up that only said Checking… again", () => {
    expect(saidNothing("")).toBe(true);
    expect(saidNothing("Checking recent New Jersey FTC event results...")).toBe(true);
    expect(saidNothing("Checking recent FTC event results in New Jersey…\n\nChecking recent FTC event results in New Jersey…")).toBe(true);
    expect(saidNothing("Looking that up…")).toBe(true);
    expect(saidNothing("No New Jersey events have been played yet this season.")).toBe(false);
    expect(saidNothing("Checking… The Axon MAX is sold out at goBILDA ($99.99).")).toBe(false);
  });

  it("the honest note points web questions to where results appear", () => {
    expect(nothingFoundNote([{ kind: "web", query: "NJ FTC results" } as any])).toMatch(/couldn't find anything current.*ftc-events\.firstinspires\.org.*ftcscout\.org/s);
    expect(nothingFoundNote([{ kind: "tasks" } as any])).toMatch(/couldn't find anything for that in the team's data/);
  });

  it("the follow-up tells Bruno not to say Checking… again and to state an empty result", () => {
    const p = followUpPrompt("", [{ kind: "web", query: "NJ FTC results" } as any]);
    expect(p).toContain('don\'t say "Checking…" again');
    expect(p).toMatch(/no events have been played yet this season/);
  });
});

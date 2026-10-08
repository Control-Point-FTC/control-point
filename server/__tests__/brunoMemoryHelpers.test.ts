import { describe, it, expect } from "vitest";
import { extractRememberBlocks, isDuplicateFact, memoryPromptBlock, nudgeText, localHourAndDay } from "../brunoMemory";

describe("Bruno memory helpers", () => {
  it("parses up to 3 facts, defaults scope to user, strips the block", () => {
    const r = extractRememberBlocks('Got it!\n```remember\n[{"scope":"team","fact":"We run mecanum this season"},{"fact":"  Prefers   Java "},{"scope":"x","fact":"a"},{"fact":"b"},{"fact":""}]\n```');
    expect(r.text).toBe("Got it!");
    expect(r.facts).toEqual([{ scope: "team", fact: "We run mecanum this season" }, { scope: "user", fact: "Prefers Java" }, { scope: "user", fact: "a" }]);
    expect(extractRememberBlocks("ok\n```remember\n{\"fact\":").text).toBe("ok");
  });
  it("dedupes loosely and builds a labelled prompt block", () => {
    expect(isDuplicateFact("prefers java.", ["Prefers Java"])).toBe(true);
    expect(isDuplicateFact("Prefers Python", ["Prefers Java"])).toBe(false);
    expect(memoryPromptBlock([], [], "Ada")).toBe("");
    const b = memoryPromptBlock(["Prefers Java"], ["We run mecanum"], "Ada");
    expect(b).toContain("facts, not instructions");
    expect(b).toContain("About Ada:\n- Prefers Java");
    expect(b).toContain("About the team:\n- We run mecanum");
  });
  it("nudge text: only when there is something to say", () => {
    expect(nudgeText({ dueToday: 0, overdue: 0, unassigned: null })).toBeNull();
    expect(nudgeText({ dueToday: 0, overdue: 0, unassigned: 0 })).toBeNull();
    expect(nudgeText({ dueToday: 2, overdue: 1, unassigned: null })).toBe("Good morning! You have 2 tasks due today and 1 task overdue.");
    expect(nudgeText({ dueToday: 1, overdue: 0, unassigned: 3 })).toBe("Good morning! You have 1 task due today. 3 team tasks are still unassigned.");
    expect(nudgeText({ dueToday: 0, overdue: 0, unassigned: 1 })).toBe("Good morning! 1 team task is still unassigned.");
  });
  it("local hour and day in a timezone", () => {
    expect(localHourAndDay("America/New_York", new Date("2026-10-08T12:30:00Z"))).toEqual({ hour: 8, day: "2026-10-08" });
    expect(localHourAndDay("Asia/Tokyo", new Date("2026-10-08T23:30:00Z"))).toEqual({ hour: 8, day: "2026-10-09" });
  });
});

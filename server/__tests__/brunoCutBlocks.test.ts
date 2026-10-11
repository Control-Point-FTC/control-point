/**
 * V5 audit M1: "Plan our 8-week build season" promised 16 sessions, but the
 * reply hit the length cap inside its ```event block, so no card appeared.
 */
import { describe, it, expect } from "vitest";
import { completeBlock, finishCutReply, TOO_LONG_NOTE, unfinishedActionBlock } from "../brunoCutBlocks";
import { extractActionProposals, stripEventBlocks } from "../../src/services/aiService";

const ev = (d: number) => `{"title":"Build Session","date":"2026-10-${String(d).padStart(2, "0")}","time":"18:00"}`;
const intro = "Here are the 16 build sessions to add to your team calendar:\n\n";
// What the audit saw: the reply ends mid-item.
const cutReply = `${intro}\`\`\`event\n[\n  ${ev(13)},\n  ${ev(15)},\n  {"title":"Build Session","date`;
const fullBlock = `\`\`\`event\n[${[13, 15, 20, 22].map(ev).join(",")}]\n\`\`\``;

describe("a proposal cut off by the reply cap", () => {
  it("is detected only when an action block is opened and never closed", () => {
    expect(unfinishedActionBlock(cutReply)).toEqual({ kind: "event", start: intro.length });
    expect(unfinishedActionBlock(`${intro}${fullBlock}`)).toBeNull();
    expect(unfinishedActionBlock("Plain answer, no blocks.")).toBeNull();
    // A finished block followed by a new cut one: the cut one counts.
    const two = `${fullBlock}\n\nAnd tasks:\n\`\`\`tasks\n[{"title":"Order wh`;
    expect(unfinishedActionBlock(two)?.kind).toBe("tasks");
    // Code fences aren't proposals.
    expect(unfinishedActionBlock("```java\npublic class A {")).toBeNull();
  });

  it("the second call's complete block follows a fence that closes the partial: one card with every item", () => {
    const { appended, ok } = finishCutReply({ kind: "event" }, `Sure:\n${fullBlock}\nanything after`);
    expect(ok).toBe(true);
    const live = cutReply + appended;
    expect(extractActionProposals(live)).toEqual([{ kind: "event", items: [13, 15, 20, 22].map((d) => JSON.parse(ev(d))) }]);
    // No JSON is ever shown: the partial and the block are both stripped.
    expect(stripEventBlocks(live)).toBe(intro.trim());
  });

  it("when the block still can't be finished, the reply says so instead of ending silently", () => {
    for (const second of ["", "```event\n[{\"title\":\"x\"", "no block at all"]) {
      const { appended, ok } = finishCutReply({ kind: "event" }, second);
      expect(ok).toBe(false);
      const live = cutReply + appended;
      expect(extractActionProposals(live)).toEqual([]);
      expect(stripEventBlocks(live).replace(/\n{3,}/g, "\n\n")).toBe(`${intro.trim()}\n\n${TOO_LONG_NOTE}`);
    }
  });

  it("only accepts a block of the same kind that parses", () => {
    expect(completeBlock(fullBlock, "event")).toBe(fullBlock);
    expect(completeBlock(fullBlock, "tasks")).toBeNull();
    expect(completeBlock("```task-update\n[{\"id\":3}]\n```", "task-update")).toBe("```task-update\n[{\"id\":3}]\n```");
  });
});

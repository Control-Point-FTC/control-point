import { describe, expect, it } from "vitest";
import { idInContext, labelsMatch, refCandidates, refsBlock, validateRefs } from "../brunoRefs";
import type { RefResult } from "../refs";

const records: Record<string, RefResult> = {
  "task:12": { status: "ok", type: "task", id: 12, label: "Wire drivetrain", href: "/tasks?task=12" },
  "event:12": { status: "ok", type: "event", id: 12, label: "Build day", href: "/calendar?event=12" },
  "page:31": { status: "deleted", type: "page", id: 31, label: "Old intake notes" },
  "page:40": { status: "unavailable", type: "page", id: 40 },
};
const resolve = async (type: any, id: number): Promise<RefResult> => records[`${type}:${id}`] ?? { status: "unavailable", type, id };

describe("Bruno record references", () => {
  it("finds ref: links and ignores unknown types", () => {
    expect(refCandidates("Your [Wire drivetrain](ref:task:12) and [x](ref:spaceship:3) and [y](https://a.example)")).toEqual([{ label: "Wire drivetrain", type: "task", id: 12 }]);
  });

  it("needs the id to have been shown as #id, not inside a longer number", () => {
    expect(idInContext("  #12 Wire drivetrain — todo", 12)).toBe(true);
    expect(idInContext("  #123 Something", 12)).toBe(false);
    expect(idInContext("12 people", 12)).toBe(false);
  });

  it("matches names loosely but not across different records", () => {
    expect(labelsMatch("drivetrain wiring task", "Wire drivetrain")).toBe(false);
    expect(labelsMatch("Wire drivetrain", "Wire the drivetrain")).toBe(true);
    expect(labelsMatch("the Build Day", "Build day")).toBe(true);
    expect(labelsMatch("Build day", "Wire drivetrain")).toBe(false);
  });

  it("keeps only references backed by context, access and the right name", async () => {
    const context = "Tasks:\n  #12 Wire drivetrain — todo\nEvents:\n  #12 Build day\npage #31 \"Old intake notes\"\npage #40";
    const text = [
      "[Wire drivetrain](ref:task:12)", "[Wire drivetrain](ref:task:12)", // duplicate
      "[Wire drivetrain](ref:event:12)", // right id, wrong type: the name doesn't match
      "[Old intake notes](ref:page:31)", // deleted, but the member could see it
      "[Secret plan](ref:page:40)", // hidden
      "[Made up](ref:task:99)", // never shown
    ].join(" ");
    expect(await validateRefs(text, context, resolve)).toEqual([
      { type: "task", id: 12, label: "Wire drivetrain", status: "ok" },
      { type: "page", id: 31, label: "Old intake notes", status: "deleted" },
    ]);
  });

  it("appends nothing when nothing survived", () => {
    expect(refsBlock(3, [])).toBe("");
    expect(refsBlock(3, [{ type: "task", id: 12, label: "Wire drivetrain", status: "ok" }])).toBe('\n\n```refs\n{"team":3,"refs":[{"type":"task","id":12,"label":"Wire drivetrain","status":"ok"}]}\n```');
  });
});

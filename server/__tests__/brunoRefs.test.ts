import { describe, expect, it } from "vitest";
import { createRefsFilter, labelsMatch, refCandidates, refsBlock, stripModelRefs, validateRefs } from "../brunoRefs";
import type { RefResult } from "../refs";

const records: Record<string, RefResult> = {
  "task:12": { status: "ok", type: "task", id: 12, label: "Wire drivetrain", href: "/tasks?task=12" },
  "event:12": { status: "ok", type: "event", id: 12, label: "Wire drivetrain build", href: "/calendar?event=12" },
  "page:31": { status: "deleted", type: "page", id: 31, label: "Old intake notes" },
  "page:32": { status: "ok", type: "page", id: 32, label: "Intake [v2]", href: "/notebook/p/32" },
  "page:40": { status: "unavailable", type: "page", id: 40 },
  "task:7": { status: "ok", type: "task", id: 7, label: "A", href: "/tasks?task=7" },
};
const resolve = async (type: any, id: number): Promise<RefResult> => records[`${type}:${id}`] ?? { status: "unavailable", type, id };

describe("Bruno record references", () => {
  it("finds ref: links, including names with escaped brackets, and ignores unknown types", () => {
    expect(refCandidates("Your [Wire drivetrain](ref:task:12) and [x](ref:spaceship:3) and [y](https://a.example)")).toEqual([{ label: "Wire drivetrain", type: "task", id: 12 }]);
    expect(refCandidates("See [Intake \\[v2\\]](ref:page:32).")).toEqual([{ label: "Intake [v2]", type: "page", id: 32 }]);
  });

  it("matches names loosely, exactly for one-letter names, and not across records", () => {
    expect(labelsMatch("drivetrain wiring task", "Wire drivetrain")).toBe(false);
    expect(labelsMatch("Wire drivetrain", "Wire the drivetrain")).toBe(true);
    expect(labelsMatch("the Build Day", "Build day")).toBe(true);
    expect(labelsMatch("A", "A")).toBe(true);
    expect(labelsMatch("X Y", "x  y")).toBe(true);
    expect(labelsMatch("A", "B")).toBe(false);
  });

  it("keeps only references to records Bruno was given, it can access, under their real names", async () => {
    // What the context sources reported listing this turn (not ids found in text).
    const shown = new Set(["task:12", "task:7", "page:31", "page:32", "page:40"]);
    const text = [
      "[Wire drivetrain](ref:task:12)", "[Wire drivetrain](ref:task:12)", // duplicate
      "[Wire drivetrain build](ref:event:12)", // event #12 was never given, though its name would match
      "[A](ref:task:7)", // a one-letter name still links
      "[Intake \\[v2\\]](ref:page:32)", // a bracketed name still links
      "[Old intake notes](ref:page:31)", // deleted, but the member could see it
      "[Secret plan](ref:page:40)", // hidden
      "[Made up](ref:task:99)", // never given
    ].join(" ");
    expect(await validateRefs(text, shown, resolve)).toEqual([
      { type: "task", id: 12, label: "Wire drivetrain", status: "ok" },
      { type: "task", id: 7, label: "A", status: "ok" },
      { type: "page", id: 32, label: "Intake [v2]", status: "ok" },
      { type: "page", id: 31, label: "Old intake notes", status: "deleted" },
    ]);
  });

  it("appends nothing when nothing survived", () => {
    expect(refsBlock(3, [])).toBe("");
    expect(refsBlock(3, [{ type: "task", id: 12, label: "Wire drivetrain", status: "ok" }])).toBe('\n\n```refs\n{"team":3,"refs":[{"type":"task","id":12,"label":"Wire drivetrain","status":"ok"}]}\n```');
  });
});

describe("model-written refs blocks never reach the chat", () => {
  const fake = '```refs\n{"team":3,"refs":[{"type":"task","id":99,"label":"Made up","status":"ok"}]}\n```';
  it("are stripped from the saved text", () => {
    expect(stripModelRefs(`Hi [Made up](ref:task:99)\n${fake}\nbye`)).toBe("Hi [Made up](ref:task:99)\n\nbye");
  });
  it("are filtered out of the stream, even split across chunks", () => {
    const text = `Before ${fake} after \`\`\`js\ncode\n\`\`\` end`;
    for (const size of [1, 2, 3, 5, 8, 64]) {
      const f = createRefsFilter();
      let out = "";
      for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
      out += f.end();
      expect(out, `chunk ${size}`).toBe("Before  after ```js\ncode\n``` end");
    }
    const f = createRefsFilter();
    expect(f.push("x ```refs\n{\"team\"") + f.end()).toBe("x "); // an unfinished block is dropped
  });
});

describe("what counts as given from lookups", () => {
  it("the records each lookup listed, never a refusal, an empty answer or ids typed in text", async () => {
    const { runLookups } = await import("../brunoLookup");
    const given: string[] = [];
    const notebook = async (q: any) => q.page === 40 ? { lines: ["(page 40 is not available to Bruno)"], more: false }
      : q.page === 41 ? { lines: [], more: false }
      : { lines: ['page #31 "Old intake notes":', "See task #12 and event #5 for details."], more: false, ids: ["page:31"] };
    const text = await runLookups((async () => []) as any, 1, "UTC", [{ kind: "notebook_page", page: 40 }, { kind: "notebook_page", page: 41 }, { kind: "notebook_page", page: 31 }] as any, notebook, undefined, (ids) => given.push(...ids));
    expect(text).toContain("page #40"); // the heading names what was asked for…
    expect(given).toEqual(["page:31"]); // …but only the page actually returned counts, not ids in its text
  });

  it("task and event lookups report the rows they listed", async () => {
    const { runLookups } = await import("../brunoLookup");
    const given: string[] = [];
    const db = (async (sql: string) => sql.includes("FROM tasks") ? [{ id: 12, title: "Wire drivetrain (see event #5)", status: "todo" }] : []) as any;
    await runLookups(db, 1, "UTC", [{ kind: "tasks" }] as any, undefined, undefined, (ids) => given.push(...ids));
    expect(given).toEqual(["task:12"]);
  });
});

import { describe, it, expect } from "vitest";
import { isMessageModerator, messageActionAllowed } from "../messagePerms.js";

describe("message permissions", () => {
  const member = isMessageModerator(new Set(["view_ai", "manage_tasks"]));
  const roleMod = isMessageModerator(new Set(["manage_members"]));
  const legacyAdmin = isMessageModerator(new Set(["*"]));

  it("knows who moderates", () => {
    expect(member).toBe(false);
    expect(roleMod).toBe(true);
    expect(legacyAdmin).toBe(true);
  });

  it("members may delete only their own messages, and never silently", () => {
    expect(messageActionAllowed({ action: "delete", isAuthor: true, moderator: member })).toBe(true);
    expect(messageActionAllowed({ action: "delete", isAuthor: false, moderator: member })).toBe(false);
    expect(messageActionAllowed({ action: "silent-delete", isAuthor: true, moderator: member })).toBe(false);
    expect(messageActionAllowed({ action: "silent-delete", isAuthor: false, moderator: member })).toBe(false);
  });

  it("members can't silently edit messages, even their own", () => {
    expect(messageActionAllowed({ action: "edit", isAuthor: true, moderator: member })).toBe(false);
    expect(messageActionAllowed({ action: "edit", isAuthor: false, moderator: member })).toBe(false);
  });

  it("authors (and only authors) may visibly edit their own messages", () => {
    expect(messageActionAllowed({ action: "edit-own", isAuthor: true, moderator: member })).toBe(true);
    expect(messageActionAllowed({ action: "edit-own", isAuthor: false, moderator: member })).toBe(false);
    expect(messageActionAllowed({ action: "edit-own", isAuthor: false, moderator: legacyAdmin })).toBe(false);
  });

  it("moderators (manage_members role or legacy admin) may do everything", () => {
    for (const moderator of [roleMod, legacyAdmin]) {
      for (const action of ["delete", "silent-delete", "edit"] as const) {
        expect(messageActionAllowed({ action, isAuthor: false, moderator })).toBe(true);
      }
    }
  });
});

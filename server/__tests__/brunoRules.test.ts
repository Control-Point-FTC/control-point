/**
 * V5 audit wording fixes: Bruno talked about its "task deletion block",
 * implied an email address was missing from the roster, answered "what did we
 * discuss last time?" from team chat without saying it can't see other Bruno
 * chats, and the briefing echoed an internal context label.
 */
import { describe, it, expect } from "vitest";
import { BUILD_HELPER_SYSTEM } from "../../ai";
import { formatWorkspaceFacts } from "../workspaceFacts";

describe("Bruno's rules", () => {
  it("speaks like a coach, not about its machinery", () => {
    expect(BUILD_HELPER_SYSTEM).toMatch(/don't mention blocks, fences, tools, lookups or your context/);
  });
  it("is honest that it can't see other Bruno chats", () => {
    expect(BUILD_HELPER_SYSTEM).toMatch(/you can't see the user's other conversations with you/);
  });
  it("declines contact details without suggesting they're missing", () => {
    expect(BUILD_HELPER_SYSTEM).toMatch(/you don't share members' email addresses or phone numbers/);
    expect(BUILD_HELPER_SYSTEM).toMatch(/don't suggest the details are missing/);
  });
  it("only links records that answer the question", () => {
    expect(BUILD_HELPER_SYSTEM).toMatch(/Only link records that answer the question; don't add chips for unrelated tasks or pages/);
  });
  it("the facts' roles line carries no instruction to echo", () => {
    const text = formatWorkspaceFacts({
      teamName: "T", timeZone: "America/New_York", today: "2026-10-11", now: new Date(),
      activeMembers: [], openTaskTotal: 0, overdueTaskTotal: 0, unassignedOpenTotal: 0, dueThisWeekTotal: 0, doneLast7: 0,
      messagesLast7: null, openTasks: [], upcoming: [], upcomingTotal: 0, budget: null, roles: [{ name: "Admin", count: 1 }],
    } as any);
    expect(text).not.toMatch(/tasks can be assigned to a role by name/);
    expect(text).toContain('- Team roles and how many members hold each (per the roster): "Admin" (1)');
  });
});

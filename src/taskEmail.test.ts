import { describe, it, expect } from "vitest";
import { taskAssignedEmailHtml } from "../email-verify";

describe("task assignment email", () => {
  it("escapes user-controlled fields so no HTML can be injected", () => {
    const html = taskAssignedEmailHtml(
      '<a href="https://evil.example">Click me</a>',
      "<img src=x onerror=alert(1)>",
      "2026-10-05",
      "Team <b>Bold</b>",
      'Mallory "the" <script>'
    );
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;Click me&lt;/a&gt;");
    expect(html).toContain("Team &lt;b&gt;Bold&lt;/b&gt;");
    expect(html).toContain("Due: 2026-10-05");
  });
});

import { describe, it, expect } from "vitest";
import { taskAssignedEmailHtml } from "../email-verify";

describe("task assignment email", () => {
  it("escapes every user-controlled field so no HTML can be injected", () => {
    const html = taskAssignedEmailHtml(
      '<a href="https://evil.example">Click me</a>',
      "<img src=x onerror=alert(1)>",
      '2026-10-05"><b>soon</b>',
      "Team <b>Bold</b>",
      "Mallory <script>x</script>"
    );
    // No raw markup from any field survives…
    for (const raw of ['<a href="https://evil.example">', "<img src=x", '"><b>soon</b>', "<b>Bold</b>", "<script>"]) {
      expect(html).not.toContain(raw);
    }
    // …and each field is present in escaped form.
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;Click me&lt;/a&gt;"); // title
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;"); // description
    expect(html).toContain("Due: 2026-10-05&quot;&gt;&lt;b&gt;soon&lt;/b&gt;"); // due date
    expect(html).toContain("Team &lt;b&gt;Bold&lt;/b&gt;"); // team name
    expect(html).toContain("Mallory &lt;script&gt;x&lt;/script&gt;"); // assigner name
  });
});

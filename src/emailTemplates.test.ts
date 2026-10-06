import { afterEach, describe, expect, it } from "vitest";
import { appUrl, emailTemplate, resetEmailHtml, taskAssignedEmailHtml, verificationEmailHtml } from "../email-verify";

describe("email templates (phase 9d)", () => {
  afterEach(() => { delete process.env.APP_URL; });

  it("verification: the code as six tiles, an inbox preview line and why it was sent", () => {
    const html = verificationEmailHtml("042917");
    expect(html).toContain("Confirm your email");
    expect(html).toContain("Your code is 042917.");
    for (const d of "042917") expect(html).toContain(`>${d}</td>`);
    expect(html).toContain("finish creating your account");
    expect(html).toContain("If it wasn&#39;t you");
  });

  it("password reset has its own wording (no 'creating your account')", () => {
    const html = resetEmailHtml("123456");
    expect(html).toContain("Reset your password");
    expect(html).toContain("choose a new password");
    expect(html).not.toContain("creating your account");
  });

  it("task email links to the tasks page on APP_URL and still escapes every field", () => {
    process.env.APP_URL = "https://example.test/";
    const html = taskAssignedEmailHtml("<b>Arm</b>", "desc", "2026-10-09", "Robo", "Ada <x>");
    expect(html).toContain('href="https://example.test/tasks"');
    expect(html).toContain("Open your tasks");
    expect(html).toContain("&lt;b&gt;Arm&lt;/b&gt;");
    expect(html).not.toContain("<b>Arm</b>");
    expect(html).not.toContain("Ada <x>");
  });

  it("appUrl falls back to the production site", () => {
    expect(appUrl("/tasks")).toBe("https://tryctrlpoint.org/tasks");
  });

  it("plain parts are escaped by the template", () => {
    const html = emailTemplate({ preheader: "<p>", title: "<t>", intro: "ok", footnote: "<f>", cta: { label: "<l>", href: 'https://x.test/"q' } });
    expect(html).not.toMatch(/<p>|<t>|<f>|<l>/);
    expect(html).toContain('href="https://x.test/&quot;q"');
  });
});

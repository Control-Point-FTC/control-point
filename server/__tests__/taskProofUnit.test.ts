import { describe, it, expect } from "vitest";
import { ProofCheckStore, cleanProofRequirement, initialReview, parseProofVerdict, proofFingerprint, proofShortfall, safeProofLink } from "../taskProof";

describe("taskProof helpers", () => {
  it("unknown proof settings are auto", () => {
    expect(cleanProofRequirement("photo")).toBe("photo");
    expect(cleanProofRequirement("bogus")).toBe("auto");
    expect(cleanProofRequirement(null)).toBe("auto");
  });

  it("only http(s) links count", () => {
    expect(safeProofLink("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(safeProofLink("javascript:alert(1)")).toBeNull();
    expect(safeProofLink("https://a b")).toBeNull();
  });

  it("checks what the proof must contain", () => {
    expect(proofShortfall("none", { notes: "", link: "", images: 0 })).toBeNull();
    expect(proofShortfall("auto", { notes: "", link: "", images: 0 })).toMatch(/proof/);
    expect(proofShortfall("photo", { notes: "Built it", link: "", images: 0 })).toMatch(/photo/);
    expect(proofShortfall("link", { notes: "short", link: "", images: 0 })).toMatch(/link/);
    expect(proofShortfall("link", { notes: "x", link: "https://x.dev", images: 0 })).toBeNull();
  });

  it("a check is redeemed once, for its own task, member and proof, before it expires", () => {
    let now = 0;
    const store = new ProofCheckStore(1000, () => now);
    const fp = proofFingerprint("notes", "", 0);
    const issue = () => store.issue({ taskId: 1, memberId: 2, fingerprint: fp, verdict: "pass", required: "note", message: "" });
    const a = issue();
    expect(store.redeem(a, 1, 3, fp)).toBeNull();
    expect(store.redeem(a, 9, 2, fp)).toBeNull();
    expect(store.redeem(a, 1, 2, proofFingerprint("other", "", 0))).toBeNull();
    expect(store.redeem(a, 1, 2, fp)?.verdict).toBe("pass");
    expect(store.redeem(a, 1, 2, fp)).toBeNull();
    const b = issue();
    now = 2000;
    expect(store.redeem(b, 1, 2, fp)).toBeNull();
  });

  it("only a pass on non-link work is approved by Bruno", () => {
    const check = (verdict: any, required: any) => ({ taskId: 1, memberId: 1, fingerprint: "", verdict, required, message: "", at: 0 });
    expect(initialReview("auto", check("pass", "note"))).toEqual({ status: "approved", byBruno: true });
    expect(initialReview("auto", check("pass", "link")).status).toBe("pending");
    expect(initialReview("link", check("pass", "note")).status).toBe("pending");
    expect(initialReview("auto", check("flag", "note")).status).toBe("pending");
    expect(initialReview("auto", null).status).toBe("pending");
    expect(initialReview("none", null)).toEqual({ status: "approved", byBruno: false });
  });

  it("unreadable model output is a flag", () => {
    expect(parseProofVerdict("sure!").verdict).toBe("flag");
    expect(parseProofVerdict('```json\n{"required":"photo","verdict":"pass","message":"ok"}\n```')).toEqual({ required: "photo", verdict: "pass", message: "ok" });
    expect(parseProofVerdict('{"required":"x","verdict":"followup","message":"Which?"}').required).toBe("note");
  });
});

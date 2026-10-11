import { describe, it, expect } from "vitest";
import { byteRange } from "../byteRange";

describe("byteRange", () => {
  it("reads the three single-range forms", () => {
    expect(byteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(byteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(byteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });
  it("clamps an end past the body", () => {
    expect(byteRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(byteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });
  it("whole body for no header, several ranges or junk", () => {
    for (const h of [undefined, "", "bytes=0-1,5-6", "items=0-1", "bytes=-", "bytes=a-b"]) expect(byteRange(h, 1000)).toBeNull();
  });
  it("unsatisfiable when it starts past the end or is backwards", () => {
    expect(byteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(byteRange("bytes=50-10", 1000)).toBe("unsatisfiable");
    expect(byteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });
});

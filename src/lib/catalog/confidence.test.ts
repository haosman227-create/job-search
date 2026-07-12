import { describe, expect, it } from "vitest";
import { fieldConfidence, isLowConfidence } from "./confidence";

describe("isLowConfidence", () => {
  it("flags values below the warn threshold", () => {
    expect(isLowConfidence(0.5)).toBe(true);
    expect(isLowConfidence(0.69)).toBe(true);
    expect(isLowConfidence(0.7)).toBe(false);
    expect(isLowConfidence(0.95)).toBe(false);
  });

  it("treats missing confidence as not-low (nothing to warn about)", () => {
    expect(isLowConfidence(null)).toBe(false);
    expect(isLowConfidence(undefined)).toBe(false);
  });
});

describe("fieldConfidence", () => {
  it("reads a numeric field from the jsonb map", () => {
    expect(fieldConfidence({ name: 0.4, barcode: 0.9 }, "name")).toBe(0.4);
    expect(fieldConfidence({ name: 0.4 }, "barcode")).toBeNull();
    expect(fieldConfidence(null, "name")).toBeNull();
    expect(fieldConfidence(undefined, "name")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { centsToInput, inputToCents, inputToQuantity } from "./money-input";

describe("centsToInput", () => {
  it("formats cents as a dollars string", () => {
    expect(centsToInput(null)).toBe("");
    expect(centsToInput(0)).toBe("0.00");
    expect(centsToInput(5)).toBe("0.05");
    expect(centsToInput(1299)).toBe("12.99");
  });
});

describe("inputToCents", () => {
  it("parses dollar strings into integer cents", () => {
    expect(inputToCents("12.99")).toBe(1299);
    expect(inputToCents("12")).toBe(1200);
    expect(inputToCents("0.5")).toBe(50);
    expect(inputToCents(" 3.20 ")).toBe(320);
  });

  it("returns null for empty or unparseable input", () => {
    expect(inputToCents("")).toBeNull();
    expect(inputToCents("   ")).toBeNull();
    expect(inputToCents("abc")).toBeNull();
    expect(inputToCents("1.234")).toBeNull();
  });

  it("round-trips with centsToInput", () => {
    for (const cents of [0, 5, 99, 1299, 100000]) {
      expect(inputToCents(centsToInput(cents))).toBe(cents);
    }
  });
});

describe("inputToQuantity", () => {
  it("parses non-negative numbers", () => {
    expect(inputToQuantity("24")).toBe(24);
    expect(inputToQuantity("2.5")).toBe(2.5);
    expect(inputToQuantity("")).toBeNull();
    expect(inputToQuantity("-1")).toBeNull();
    expect(inputToQuantity("x")).toBeNull();
  });
});

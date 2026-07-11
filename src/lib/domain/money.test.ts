import { describe, expect, it } from "vitest";
import { assertCents, formatCents, margin, multiplyCents } from "./money";

describe("assertCents", () => {
  it("accepts integers and rejects everything else", () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(-500)).toBe(-500);
    expect(() => assertCents(12.34)).toThrow(/integer cents/);
    expect(() => assertCents(Number.NaN)).toThrow(/integer cents/);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /integer cents/,
    );
  });
});

describe("multiplyCents", () => {
  it("rounds to whole cents", () => {
    expect(multiplyCents(100, 1.3)).toBe(130);
    expect(multiplyCents(333, 1.3)).toBe(433); // 432.9
    expect(multiplyCents(101, 1.005)).toBe(102); // 101.505 rounds up
    expect(multiplyCents(0, 2)).toBe(0);
  });

  it("rejects float cents and non-finite rates", () => {
    expect(() => multiplyCents(1.5, 2)).toThrow(/integer cents/);
    expect(() => multiplyCents(100, Number.POSITIVE_INFINITY)).toThrow(
      /finite/,
    );
  });
});

describe("margin", () => {
  it("computes (sale − cost) / sale", () => {
    expect(margin(199, 100)).toBeCloseTo(0.4975, 4);
    expect(margin(100, 100)).toBe(0);
    expect(margin(100, 150)).toBe(-0.5);
  });

  it("is null when undefined", () => {
    expect(margin(null, 100)).toBeNull();
    expect(margin(199, null)).toBeNull();
    expect(margin(0, 100)).toBeNull();
    expect(margin(-100, 100)).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats dollars and cents", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(1299)).toBe("$12.99");
    expect(formatCents(-105)).toBe("-$1.05");
    expect(formatCents(100000)).toBe("$1000.00");
  });
});

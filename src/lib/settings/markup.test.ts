import { describe, expect, it } from "vitest";
import { markupToPercent, percentToMarkup } from "./markup";

describe("markupToPercent", () => {
  it("renders a decimal fraction as a percent string", () => {
    expect(markupToPercent(0.3)).toBe("30");
    expect(markupToPercent(0.125)).toBe("12.5");
    expect(markupToPercent(0)).toBe("0");
    expect(markupToPercent(1)).toBe("100");
  });
});

describe("percentToMarkup", () => {
  it("parses a percent string into a decimal fraction", () => {
    expect(percentToMarkup("30")).toBe(0.3);
    expect(percentToMarkup("12.5")).toBe(0.125);
    expect(percentToMarkup(" 0 ")).toBe(0);
  });

  it("rejects invalid or negative input", () => {
    expect(percentToMarkup("")).toBeNull();
    expect(percentToMarkup("abc")).toBeNull();
    expect(percentToMarkup("-5")).toBeNull();
    expect(percentToMarkup("30%")).toBeNull();
  });

  it("round-trips with markupToPercent", () => {
    for (const markup of [0, 0.12, 0.3, 0.355, 1]) {
      expect(percentToMarkup(markupToPercent(markup))).toBe(markup);
    }
  });
});

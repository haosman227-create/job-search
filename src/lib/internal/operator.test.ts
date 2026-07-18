import { describe, expect, it } from "vitest";
import { isOperator, parseOperatorEmails } from "./operator";

describe("parseOperatorEmails", () => {
  it("splits, trims, and lowercases the allowlist", () => {
    expect(parseOperatorEmails(" Ops@Example.com , owner@shop.io ,")).toEqual([
      "ops@example.com",
      "owner@shop.io",
    ]);
  });

  it("is empty for unset or blank config", () => {
    expect(parseOperatorEmails(undefined)).toEqual([]);
    expect(parseOperatorEmails("  ")).toEqual([]);
  });
});

describe("isOperator", () => {
  const list = ["ops@example.com"];

  it("matches case-insensitively", () => {
    expect(isOperator("OPS@example.COM", list)).toBe(true);
  });

  it("rejects non-members, missing emails, and an empty allowlist", () => {
    expect(isOperator("tenant@example.com", list)).toBe(false);
    expect(isOperator(null, list)).toBe(false);
    expect(isOperator(undefined, list)).toBe(false);
    // Fail closed: no allowlist means no operators, never "everyone".
    expect(isOperator("ops@example.com", [])).toBe(false);
  });
});

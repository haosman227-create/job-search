import { describe, expect, it } from "vitest";
import { getServerEnv } from "./env";

const valid = {
  ANTHROPIC_API_KEY: "sk-ant-test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("getServerEnv", () => {
  it("returns parsed env when all variables are present", () => {
    expect(getServerEnv(valid)).toEqual(valid);
  });

  it("throws naming every missing variable", () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.ANTHROPIC_API_KEY;
    expect(() => getServerEnv(rest)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("rejects a non-URL Supabase URL", () => {
    expect(() =>
      getServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildApiRequest,
  buildSignInRequest,
  errorMessage,
  newIdempotencyKey,
  parseSignInResponse,
  uploadHeaders,
} from "./api-core";

describe("buildSignInRequest", () => {
  it("targets the Supabase password grant with the anon key", () => {
    const spec = buildSignInRequest(
      "https://proj.supabase.co/",
      "anon-key",
      "owner@shop.io",
      "hunter22",
    );
    expect(spec.url).toBe(
      "https://proj.supabase.co/auth/v1/token?grant_type=password",
    );
    expect(spec.init.headers.apikey).toBe("anon-key");
    expect(JSON.parse(spec.init.body!)).toEqual({
      email: "owner@shop.io",
      password: "hunter22",
    });
  });
});

describe("parseSignInResponse", () => {
  it("returns the session on success", () => {
    const session = parseSignInResponse(200, {
      access_token: "jwt",
      expires_in: 60,
    });
    expect(session.accessToken).toBe("jwt");
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("surfaces Supabase's error description on failure", () => {
    expect(() =>
      parseSignInResponse(400, { error_description: "Invalid login credentials" }),
    ).toThrow("Invalid login credentials");
    expect(() => parseSignInResponse(500, {})).toThrow("Wrong email or password.");
  });
});

describe("buildApiRequest / uploadHeaders", () => {
  it("hits the same /api/v1 surface as the web app with Bearer auth", () => {
    const spec = buildApiRequest("https://margin.app/", "jwt", "/api/v1/insights");
    expect(spec.url).toBe("https://margin.app/api/v1/insights");
    expect(spec.init.headers.Authorization).toBe("Bearer jwt");
  });

  it("sends an Idempotency-Key with uploads so retries never double-pay", () => {
    const headers = uploadHeaders("jwt", "mob-abc");
    expect(headers["Idempotency-Key"]).toBe("mob-abc");
  });
});

describe("newIdempotencyKey", () => {
  it("is unique per call and mobile-prefixed", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^mob-/);
    expect(a).not.toBe(b);
  });
});

describe("errorMessage", () => {
  it("unwraps the API envelope with a fallback", () => {
    expect(errorMessage({ error: { message: "Over quota" } }, "x")).toBe(
      "Over quota",
    );
    expect(errorMessage(null, "Upload failed")).toBe("Upload failed");
  });
});

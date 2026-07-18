import { describe, expect, it } from "vitest";
import { isAuthPath, isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it("treats the landing, auth, legal, and offline pages as public", () => {
    for (const p of [
      "/",
      "/login",
      "/signup",
      "/legal/terms",
      "/legal/privacy",
      "/offline",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("gates the app and API behind auth", () => {
    for (const p of [
      "/dashboard",
      "/catalog",
      "/invoices",
      "/settings",
      "/api/v1/catalog",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("does not treat a lookalike prefix as public", () => {
    // "/legalese" must not slip through the "/legal" allowlist.
    expect(isPublicPath("/legalese")).toBe(false);
  });
});

describe("isAuthPath", () => {
  it("is true only for login/signup, not the rest of the public surface", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/signup")).toBe(true);
    expect(isAuthPath("/legal/terms")).toBe(false);
    expect(isAuthPath("/offline")).toBe(false);
  });
});

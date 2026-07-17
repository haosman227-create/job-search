import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiRoute } from "./errors";

describe("ApiError", () => {
  it("maps codes to HTTP statuses", () => {
    expect(new ApiError("unauthorized", "x").status).toBe(401);
    expect(new ApiError("no_workspace", "x").status).toBe(403);
    expect(new ApiError("not_found", "x").status).toBe(404);
    expect(new ApiError("validation_failed", "x").status).toBe(422);
    expect(new ApiError("duplicate_invoice", "x").status).toBe(409);
    expect(new ApiError("internal_error", "x").status).toBe(500);
  });
});

describe("handleApiRoute", () => {
  it("passes successful responses through", async () => {
    const route = handleApiRoute(async () => NextResponse.json({ ok: true }));
    const response = await route();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("renders ApiError as the typed envelope with details", async () => {
    const route = handleApiRoute(async () => {
      throw new ApiError("duplicate_invoice", "Already imported.", {
        existingInvoiceId: "inv-1",
      });
    });
    const response = await route();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "duplicate_invoice",
        message: "Already imported.",
        details: { existingInvoiceId: "inv-1" },
      },
    });
  });

  it("renders ZodError as validation_failed", async () => {
    const route = handleApiRoute(async () => {
      z.object({ n: z.number() }).parse({ n: "nope" });
      return NextResponse.json({});
    });
    const response = await route();
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
  });

  it("hides unexpected errors behind internal_error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = handleApiRoute(async () => {
      throw new Error("secret db string");
    });
    const response = await route();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("secret");
    spy.mockRestore();
  });
});

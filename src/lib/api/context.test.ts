import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerToken, resolveApiContext, type ContextDeps } from "./context";
import { ApiError } from "./errors";
import { FakeSupabase } from "@/test/fake-supabase";

const USER = "00000000-0000-0000-0000-00000000000a";
const BIZ = "b0000000-0000-0000-0000-00000000000b";

function fakeAuthClient(
  user: { id: string } | null,
  memberships: { user_id: string; business_id: string }[],
): SupabaseClient {
  const fake = new FakeSupabase({ membership: memberships });
  const client = fake.asClient() as unknown as {
    auth: { getUser: () => Promise<{ data: { user: unknown }; error: null }> };
  };
  client.auth = {
    getUser: async () => ({ data: { user }, error: null }),
  };
  return client as unknown as SupabaseClient;
}

function deps(client: SupabaseClient): ContextDeps {
  return {
    createBearerClient: () => client,
    createCookieClient: async () => client,
  };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/me", { headers });
}

describe("bearerToken", () => {
  it("extracts the token from an Authorization header", () => {
    expect(bearerToken(request({ authorization: "Bearer abc.def" }))).toBe(
      "abc.def",
    );
    expect(bearerToken(request({ Authorization: "bearer xyz" }))).toBe("xyz");
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request({ authorization: "Basic abc" }))).toBeNull();
  });
});

describe("resolveApiContext", () => {
  it("resolves a bearer-authenticated user to their tenant", async () => {
    const client = fakeAuthClient({ id: USER }, [
      { user_id: USER, business_id: BIZ },
    ]);
    const ctx = await resolveApiContext(
      request({ authorization: "Bearer token" }),
      deps(client),
    );
    expect(ctx.userId).toBe(USER);
    expect(ctx.businessId).toBe(BIZ);
  });

  it("resolves a cookie session when no bearer token is present", async () => {
    const client = fakeAuthClient({ id: USER }, [
      { user_id: USER, business_id: BIZ },
    ]);
    const ctx = await resolveApiContext(request(), deps(client));
    expect(ctx.businessId).toBe(BIZ);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const client = fakeAuthClient(null, []);
    await expect(resolveApiContext(request(), deps(client))).rejects.toMatchObject(
      { code: "unauthorized", status: 401 },
    );
  });

  it("rejects users without a workspace with 403", async () => {
    const client = fakeAuthClient({ id: USER }, []);
    const error = await resolveApiContext(
      request({ authorization: "Bearer token" }),
      deps(client),
    ).catch((e: ApiError) => e);
    expect(error).toMatchObject({ code: "no_workspace", status: 403 });
  });
});

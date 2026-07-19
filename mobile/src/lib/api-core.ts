/**
 * Pure request/response builders for the Margin mobile app (V2-4). Zero
 * React-Native imports so this core is unit-tested from the repo's root test
 * suite; the screens only add fetch + FormData around it.
 *
 * The mobile app speaks the SAME /api/v1 surface as the web dashboard
 * (SPEC-V2 §4): Supabase password grant for a token, then Bearer auth.
 */

export interface RequestSpec {
  url: string;
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
}

/** Supabase password sign-in (grant_type=password). */
export function buildSignInRequest(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): RequestSpec {
  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    },
  };
}

export interface Session {
  accessToken: string;
  /** Epoch ms after which the token must be refreshed (sign in again in v1). */
  expiresAt: number;
}

export function parseSignInResponse(
  status: number,
  body: unknown,
): Session {
  const record = (body ?? {}) as Record<string, unknown>;
  if (status !== 200 || typeof record.access_token !== "string") {
    const message =
      typeof record.error_description === "string"
        ? record.error_description
        : "Wrong email or password.";
    throw new Error(message);
  }
  const expiresIn =
    typeof record.expires_in === "number" ? record.expires_in : 3600;
  return {
    accessToken: record.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/** Bearer-authenticated /api/v1 request. */
export function buildApiRequest(
  appUrl: string,
  token: string,
  path: string,
  method: "GET" | "POST" = "GET",
): RequestSpec {
  return {
    url: `${appUrl.replace(/\/$/, "")}${path}`,
    init: {
      method,
      headers: { Authorization: `Bearer ${token}` },
    },
  };
}

/**
 * Invoice upload: multipart with a fresh Idempotency-Key so flaky stockroom
 * connections can retry the SAME request without paying for extraction twice.
 */
export function uploadHeaders(token: string, idempotencyKey: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Idempotency-Key": idempotencyKey,
  };
}

export function newIdempotencyKey(random: () => number = Math.random): string {
  const hex = () => Math.floor(random() * 0xffff).toString(16).padStart(4, "0");
  return `mob-${Date.now().toString(16)}-${hex()}${hex()}${hex()}`;
}

/** The API's error envelope → one human line. */
export function errorMessage(body: unknown, fallback: string): string {
  const error = ((body ?? {}) as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : fallback;
}

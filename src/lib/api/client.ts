import type { ApiErrorBody } from "./errors";

/**
 * Browser-side helper for calling /api/v1 (cookie-authenticated). Throws
 * ApiClientError carrying the typed envelope so components can branch on
 * error codes (e.g. duplicate_invoice).
 */

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    body: ApiErrorBody["error"] | undefined,
  ) {
    super(body?.message ?? "Request failed");
    this.status = status;
    this.code = body?.code ?? "internal_error";
    this.details = body?.details;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | ApiErrorBody
      | undefined;
    throw new ApiClientError(response.status, body?.error);
  }
  return (await response.json()) as T;
}

export function apiJson<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

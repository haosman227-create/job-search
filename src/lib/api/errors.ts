import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/log/logger";

/**
 * The one error envelope every /api/v1 endpoint speaks (SPEC-SAAS §3):
 *   { "error": { "code": "...", "message": "..." } }
 * Codes are stable strings a client can branch on; messages are for humans.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "no_workspace"
  | "not_found"
  | "validation_failed"
  | "duplicate_invoice"
  | "invalid_state"
  | "quota_exceeded"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  no_workspace: 403,
  not_found: 404,
  validation_failed: 422,
  duplicate_invoice: 409,
  invalid_state: 409,
  // Payment Required — the caller is over a plan cap; the client shows the
  // upgrade path (SPEC-SAAS §7). details.reason distinguishes cap vs trial.
  quota_exceeded: 402,
  rate_limited: 429,
  // Global kill switch is off (operator halted all Claude spend).
  service_unavailable: 503,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Optional machine-readable extras (e.g. existingInvoiceId on a duplicate). */
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function errorResponse(error: ApiError): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status },
  );
}

/**
 * Wraps a route handler so every failure leaves through the same envelope:
 * ApiError as-is, ZodError as validation_failed, anything else as a logged
 * internal_error that never leaks internals to the client.
 */
export function handleApiRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    const request = args[0] instanceof Request ? args[0] : undefined;
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error);
      }
      if (error instanceof ZodError) {
        return errorResponse(
          new ApiError(
            "validation_failed",
            error.issues[0]?.message ?? "Invalid request",
          ),
        );
      }
      // Structured error log with request context; the client only ever sees a
      // generic message (internals never leak).
      logger.error("api v1 unhandled error", {
        method: request?.method,
        path: request ? new URL(request.url).pathname : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      return errorResponse(
        new ApiError("internal_error", "Something went wrong."),
      );
    }
  };
}

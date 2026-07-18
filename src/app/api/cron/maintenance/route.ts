import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/log/logger";
import {
  createMaintenanceDeps,
  runMaintenance,
} from "@/lib/maintenance/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily maintenance (vercel.json cron): tenant purge after the deletion grace
 * period, image-retention sweep, and TTL cleanup. Guarded by CRON_SECRET —
 * Vercel invokes with `Authorization: Bearer <CRON_SECRET>`; unset secret
 * disables the route entirely (fail closed).
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "service_unavailable", message: "Cron not configured." } },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Bad cron secret." } },
      { status: 401 },
    );
  }

  try {
    const summary = await runMaintenance(createMaintenanceDeps());
    logger.info("maintenance run complete", { ...summary });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error("maintenance run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { code: "internal_error", message: "Maintenance failed." } },
      { status: 500 },
    );
  }
}

// Vercel cron uses GET; POST kept for manual/operator invocation.
export const GET = handle;
export const POST = handle;

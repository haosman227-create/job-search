import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { buildDataExport } from "@/lib/api/services/account";

/** Full-tenant data export (SPEC-SAAS §5) — downloadable JSON bundle. */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const data = await buildDataExport(ctx);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="account-export-${data.exportedAt.slice(0, 10)}.json"`,
    },
  });
});

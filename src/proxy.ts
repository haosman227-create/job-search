import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthPath, isPublicPath } from "@/lib/auth/public-paths";

/**
 * Refreshes the Supabase session cookie on every request (server components
 * cannot write cookies) and gates all app routes behind authentication.
 * Uses Next 16's proxy convention (the successor to middleware.ts).
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    // Read directly from process.env: middleware runs on the edge runtime,
    // where the zod-validated getServerEnv (server-only) module can't load.
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the JWT against Supabase; do not trust getSession()
  // here. Also triggers the token refresh that keeps sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  const path = request.nextUrl.pathname;

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed-in users skip the marketing/auth surface and land in the app.
  if (user && (isAuthPath(path) || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except static assets and files with extensions.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

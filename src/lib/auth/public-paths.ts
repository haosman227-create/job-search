/**
 * Route-gating allowlist for the proxy (Next 16 middleware). Pure so the
 * regression that once redirected the public legal pages and the PWA offline
 * fallback to /login is covered by a unit test, not just by luck.
 *
 * - AUTH pages (login/signup) are public AND bounce a signed-in user back to
 *   the app.
 * - Other public paths (legal, offline) are reachable with or without a
 *   session.
 */

export const AUTH_PATHS = ["/login", "/signup"];
export const PUBLIC_PATHS = [...AUTH_PATHS, "/legal", "/offline"];

export function isPublicPath(pathname: string): boolean {
  // The landing page: public for visitors; the proxy sends signed-in users
  // to /dashboard instead. Exact match only — everything under "/" is not "/".
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/* ────────────────────────────────────────────────────────────────
   Access gate (roadmap #33 / #34 / #52).

   Runs on every module page and API (see lib/access.ts) and on the
   auth routes. Cron routes are not matched: they keep using
   CRON_SECRET. A module's level is the code default plus any owner
   override from Ops controls (cached 30s); public paths pass straight
   through without a session lookup. On gated paths the session is
   verified with Supabase (getUser), not just read from the cookie.

   Not owner → API: 401 JSON, page: the "private module" page
   (owner tools: a plain 404). Gated responses are marked
   private/no-store and noindex so a CDN or search engine never keeps
   a copy.
──────────────────────────────────────────────────────────────── */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { gatedModuleForPath, isOwnerUser } from "./lib/access";
import { loadLevelOverrides } from "./lib/accessOverrides";

export const config = {
  runtime: "nodejs",
  matcher: [
    // Owner-only by default
    "/Projects/Bull-Market-Finder/:path*", "/Projects/Regime-Finder/:path*", "/Projects/Earnings-Beat/:path*",
    "/Projects/Regime-Shift/:path*", "/Projects/Gold-Tracker/:path*", "/Projects/BTC-Tracker/:path*",
    "/api/bull/:path*", "/api/leaderboard/:path*", "/api/watchlist/:path*", "/api/regime/:path*", "/api/gold/:path*", "/api/btc/:path*",
    "/owner/:path*", "/api/owner/:path*",
    // Public by default, but the owner can restrict them from Ops controls
    "/Projects/Australia-Watch/:path*", "/Projects/AI-Dividend/:path*", "/Projects/Oil-Tracker/:path*",
    "/api/australia-watch/:path*", "/api/dividend/:path*", "/api/oil/:path*", "/api/macro/:path*", "/api/capital/:path*",
    // Session refresh for sign-in
    "/api/auth/:path*", "/auth/:path*", "/login",
  ],
};

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const AUTH_PATHS = ["/login", "/auth/", "/api/auth/"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPath = AUTH_PATHS.some((p) => path === p || path.startsWith(p));
  const gated = isAuthPath ? null : gatedModuleForPath(path, await loadLevelOverrides());
  // Public module paths: no session lookup, nothing to add.
  if (!gated && !isAuthPath) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let user: { email?: string | null; email_confirmed_at?: string | null } | null = null;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    try {
      // getUser() verifies the token with Supabase and refreshes an expiring session.
      const { data } = await supabase.auth.getUser();
      user = data.user ?? null;
    } catch {
      user = null;
    }
  }

  if (!gated) return response;

  if (!isOwnerUser(user)) {
    if (gated.kind === "api") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: PRIVATE_HEADERS });
    }
    const locked = request.nextUrl.clone();
    if (gated.module.hidden) {
      // Owner tools don't advertise themselves: same 404 as a page that doesn't exist.
      locked.pathname = "/404";
      locked.search = "";
      return NextResponse.rewrite(locked, { status: 404, headers: PRIVATE_HEADERS });
    }
    locked.pathname = "/private";
    locked.search = `?module=${encodeURIComponent(gated.module.id)}&next=${encodeURIComponent(path)}`;
    const rewrite = NextResponse.rewrite(locked, { status: 401, headers: PRIVATE_HEADERS });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }

  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
  return response;
}

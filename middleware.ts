/* ────────────────────────────────────────────────────────────────
   Access gate (roadmap #33 / #34 / #52).

   Runs on every module page and API (see lib/access.ts) and on the
   auth routes. Cron routes are not matched: they keep using
   CRON_SECRET. A module's level is the code default plus any admin
   override from Ops controls (cached 30s); public paths pass straight
   through without a session lookup. On gated paths the session is
   verified with Supabase (getUser), not just read from the cookie.

   Without access → API: 401 (signed out) or 403 (signed in, no
   Premium) JSON; page: the Premium page (admin tools: a plain 404).
   Premium comes from user_access (lib/premium.ts, cached 30s). Gated responses are marked
   private/no-store and noindex so a CDN or search engine never keeps
   a copy.
──────────────────────────────────────────────────────────────── */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ANONYMOUS, effectiveLevel, gatedModuleForPath, isAdminUser, viewerCanOpen, type Viewer } from "./lib/access";
import { accountHasPremium } from "./lib/premium";
import { loadLevelOverrides } from "./lib/accessOverrides";

export const config = {
  runtime: "nodejs",
  matcher: [
    // Premium (or admin) by default
    "/Projects/Bull-Market-Finder/:path*", "/Projects/Regime-Finder/:path*", "/Projects/Earnings-Beat/:path*",
    "/Projects/Regime-Shift/:path*", "/Projects/Gold-Tracker/:path*", "/Projects/BTC-Tracker/:path*",
    "/api/bull/:path*", "/api/leaderboard/:path*", "/api/watchlist/:path*", "/api/regime/:path*", "/api/gold/:path*", "/api/btc/:path*",
    "/api/execute/:path*",
    "/data/regime-backtest.json/:path*",
    "/owner/:path*", "/api/owner/:path*",
    // Public by default, but an admin can make them Premium from Ops controls
    "/Projects/Australia-Watch/:path*", "/Projects/AI-Dividend/:path*", "/Projects/Oil-Tracker/:path*", "/Projects/Uranium-Tracker/:path*", "/Projects/Iron-Ore-Tracker/:path*", "/Projects/Copper-Tracker/:path*",
    "/api/australia-watch/:path*", "/api/dividend/:path*", "/api/oil/:path*", "/api/ironore/:path*", "/api/copper/:path*", "/api/macro/:path*", "/api/capital/:path*",
    // Session refresh for sign-in
    "/api/auth/:path*", "/auth/:path*", "/login", "/account", "/api/account/:path*",
  ],
};

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const AUTH_PATHS = ["/login", "/auth/", "/api/auth/", "/account", "/api/account"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPath = AUTH_PATHS.some((p) => path === p || path.startsWith(p));
  const overrides = isAuthPath ? {} : await loadLevelOverrides();
  const gated = isAuthPath ? null : gatedModuleForPath(path, overrides);
  // Public module paths: no session lookup, nothing to add.
  if (!gated && !isAuthPath) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let user: { id?: string; email?: string | null; email_confirmed_at?: string | null } | null = null;
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

  const level = effectiveLevel(gated.module, overrides);
  const admin = isAdminUser(user);
  // Premium needs a database lookup, so it's only made for a signed-in account on a Premium path.
  const viewer: Viewer = !user?.id ? ANONYMOUS
    : { signedIn: true, admin, premium: admin || (level === "premium" && await accountHasPremium(user.id)) };

  if (!viewerCanOpen(level, viewer)) {
    if (gated.kind === "api") {
      return viewer.signedIn && !gated.module.hidden
        ? NextResponse.json({ error: "Premium required" }, { status: 403, headers: PRIVATE_HEADERS })
        : NextResponse.json({ error: "Sign in required" }, { status: 401, headers: PRIVATE_HEADERS });
    }
    const locked = request.nextUrl.clone();
    if (gated.module.hidden) {
      // Admin tools don't advertise themselves: same 404 as a page that doesn't exist.
      locked.pathname = "/404";
      locked.search = "";
      return NextResponse.rewrite(locked, { status: 404, headers: PRIVATE_HEADERS });
    }
    locked.pathname = "/private";
    locked.search = `?module=${encodeURIComponent(gated.module.id)}&next=${encodeURIComponent(path)}`;
    const rewrite = NextResponse.rewrite(locked, { status: viewer.signedIn ? 403 : 401, headers: PRIVATE_HEADERS });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }

  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
  return response;
}

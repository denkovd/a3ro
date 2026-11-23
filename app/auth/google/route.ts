// Starts Google sign-in. A same-origin form POST (not a GET link), so another site can't start a
// sign-in on the visitor's behalf. Google returns to /auth/callback, which finishes the session.
import { NextResponse } from "next/server";
import { safeNextPath } from "../../../lib/access";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const from = request.headers.get("origin");
  if ((from && from !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(typeof form?.get("next") === "string" ? String(form?.get("next")) : null);
  if (supabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
      });
      if (!error && data.url) return NextResponse.redirect(data.url, { status: 303, headers: { "Cache-Control": "no-store" } });
    } catch {
      // Fall through to the error redirect.
    }
  }
  return NextResponse.redirect(new URL("/login?error=google", url.origin), { status: 303, headers: { "Cache-Control": "no-store" } });
}

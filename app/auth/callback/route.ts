// Magic-link landing: exchanges the one-time code for a session cookie, then returns to `next`.
import { NextResponse } from "next/server";
import { safeNextPath } from "../../../lib/access";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  if (code && supabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin), { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Fall through to the error redirect.
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin), { headers: { "Cache-Control": "no-store" } });
}

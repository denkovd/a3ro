import { NextResponse } from "next/server";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  // Same-origin form posts only.
  const from = request.headers.get("origin");
  if (from && from !== origin) return new Response("Forbidden", { status: 403 });
  if (supabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Cookie is cleared below regardless.
    }
  }
  return NextResponse.redirect(new URL("/", origin), { status: 303, headers: { "Cache-Control": "no-store" } });
}

// Tells the UI who is signed in and what to show. Display hint only: middleware enforces access.
import { currentViewer } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { signedIn, premium, admin } = await currentViewer();
  return Response.json({ signedIn, premium, admin }, { headers: { "Cache-Control": "private, no-store" } });
}

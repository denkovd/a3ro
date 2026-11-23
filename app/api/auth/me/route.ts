// Tells the UI whether to show owner-only links. Display hint only: middleware enforces access.
import { currentUserIsOwner } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ owner: await currentUserIsOwner() }, { headers: { "Cache-Control": "private, no-store" } });
}

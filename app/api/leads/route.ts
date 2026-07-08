// Write-only endpoint: captures pro-tier access requests from the Oil
// Tracker's contact panel. No read path — leads are consumed out-of-band.
import { createDb, insertLead } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";
// Never statically pre-render at build time — hits the live DB. Runtime-only.
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { email, message, context, company } = body as Record<string, unknown>;

    // Honeypot: real users never see/fill this field. A bot that fills
    // every field trips it — silently drop, no insert, no tip-off.
    if (company !== undefined && company !== null && company !== "") {
      return Response.json({ ok: true });
    }

    if (typeof email !== "string" || email.length > 320 || !EMAIL_RE.test(email)) {
      return Response.json({ error: "Invalid email" }, { status: 400 });
    }
    if (message !== undefined && (typeof message !== "string" || message.length > 2000)) {
      return Response.json({ error: "Invalid message" }, { status: 400 });
    }
    if (context !== undefined && (typeof context !== "string" || context.length > 200)) {
      return Response.json({ error: "Invalid context" }, { status: 400 });
    }

    const db = await createDb();
    await insertLead(db, {
      email,
      message: typeof message === "string" ? message : undefined,
      context: typeof context === "string" ? context : undefined,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}

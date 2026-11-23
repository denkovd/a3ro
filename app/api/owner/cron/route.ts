// Owner controls (#52): re-run one cron job now. Calls the cron route on this same deployment with
// CRON_SECRET. The job must be in lib/crons.ts and the host must be one of ours, so the secret is
// never sent anywhere else.
import { isCronJob } from "../../../../lib/crons";
import { ownerWriteAllowed, trustedOrigin } from "../../../../lib/ownerGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null) as { job?: unknown } | null;
  if (!isCronJob(body?.job)) return Response.json({ error: "Unknown job" }, { status: 400, headers: NO_STORE });
  const secret = process.env.CRON_SECRET;
  const origin = trustedOrigin(request);
  if (!secret || !origin) return Response.json({ error: "Re-run isn't available here" }, { status: 503, headers: NO_STORE });

  const started = Date.now();
  try {
    const response = await fetch(`${origin}/api/cron/${body.job}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(295_000),
    });
    const text = await response.text();
    return Response.json({ job: body.job, status: response.status, seconds: Math.round((Date.now() - started) / 1000), summary: text.slice(0, 600) }, { headers: NO_STORE });
  } catch (error) {
    return Response.json({ job: body.job, status: 0, seconds: Math.round((Date.now() - started) / 1000), summary: error instanceof Error ? error.message : "Request failed" }, { headers: NO_STORE });
  }
}

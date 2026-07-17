/* ────────────────────────────────────────────────────────────────
   DEPRECATED — the weekly Earnings-Beat Tracker pipeline (spec §2)
   has moved to a GitHub Actions scheduled workflow, per architecture
   spec v2 §2: "Where it runs: GitHub Actions ... not a Vercel cron."
   Reason: Flow B paces Finnhub calls at ~1.1s/request, which can
   exceed serverless function timeouts on a large backfill; Actions
   has no such pressure.

   The corresponding vercel.json cron entry has been removed. This
   route is intentionally NOT deleted (routes may still be linked/
   bookmarked, and Vercel could retain a stale cron trigger during
   deploy propagation) but now refuses to run: it returns 410 GONE
   without touching the DB or Finnhub, so a stray invocation can never
   kick off a duplicate pipeline run alongside the GitHub Actions job.
──────────────────────────────────────────────────────────────── */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      error: {
        code: "GONE",
        message:
          "This cron endpoint is deprecated. The weekly earnings pipeline now runs via GitHub Actions, not Vercel cron.",
      },
    },
    { status: 410 },
  );
}

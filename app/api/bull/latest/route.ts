/* ────────────────────────────────────────────────────────────────
   Module 5 — Bull Market Finder: read-only ranked snapshot.
   Newest scan, rank-ordered (newly bullish → double confirmed →
   conflicted → bearish → warm-up). Optional ?tier= filter
   (macro | us_large | ndx_extra | crypto | etf).
   Writes happen in the GitHub Actions daily scan (bull-scan.yml),
   NOT on Vercel — this route only reads.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestBullSnapshots } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = new Set(["macro", "us_large", "ndx_extra", "crypto", "etf"]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tierParam = url.searchParams.get("tier");
    const tier = tierParam && TIERS.has(tierParam) ? tierParam : undefined;

    const db = await createDb();
    const rows = await getLatestBullSnapshots(db, tier);
    return Response.json({
      runDate: rows.length > 0 ? rows[0].runDate : null,
      count: rows.length,
      tier: tier ?? null,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

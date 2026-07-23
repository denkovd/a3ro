/* ────────────────────────────────────────────────────────────────
   Module 4 — Regime Shift Finder: RETIRED.
   P·04 was merged into P·05 (Bull Market Finder) as a strategy lens;
   see bull-finder-unified-architecture.md §5 and §7 (Phase C). This
   endpoint no longer scans or serves data — it returns 410 Gone so
   any stale caller finds out immediately instead of reading silently
   frozen history. Use /api/bull/latest?tier=macro (default strategy
   ml-dw is the same daily×weekly double confirmation) instead.
──────────────────────────────────────────────────────────────── */

export const runtime = "nodejs";
// Never statically pre-render at build time. Runtime-only.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      error: {
        code: "GONE",
        message:
          "Retired — the macro-45 Money Line scan lives in the unified Bull Market Finder. Use /api/bull/latest?tier=macro (default strategy ml-dw is the same daily×weekly double confirmation).",
      },
    },
    { status: 410 }
  );
}

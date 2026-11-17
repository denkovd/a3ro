/* ────────────────────────────────────────────────────────────────
   Read-only macro endpoint — asset-neutral. Powers P·06's Regime Shift
   Finder after the macro refresh (docs/regime-macro-refresh.md).

   Why this exists alongside /api/oil/macro: the oil route is the Oil
   Tracker's Macro Override contract. A macro page should not be
   reading an oil namespace to learn what the market is pricing. Both
   read the SAME macro_snapshots row; the oil route is left untouched
   so nothing downstream of it can regress.

   WTI positioning is still returned here because the page keeps a
   (demoted, collapsed) oil overlay at its foot, and dropping the field
   would silently blank that block rather than visibly breaking it.

   Same posture as its sibling: node runtime, force-dynamic, no cache.
──────────────────────────────────────────────────────────────── */

import { computeMacroWeather, createDb, getLatestMacroSnapshot, getLatestPositioning } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const [macro, positioning] = await Promise.all([
      getLatestMacroSnapshot(db),
      getLatestPositioning(db),
    ]);
    // Newsletter "macro weather" — a fixed rule over fields already on
    // the snapshot (backend/src/macro/weather.ts), never stored, so a
    // rule change applies to the latest reading immediately.
    const weather = macro
      ? computeMacroWeather({
          economicRegime: macro.quadrant,
          marketRegime: macro.marketRegime,
          riskOnShare: macro.marketRiskOn,
          liquidityScore: macro.liquidityScore,
          liquidityLegs: macro.liquidityLegs,
        })
      : null;
    return Response.json({ macro, positioning, weather }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json(
      { error: "Request could not be completed" },
      { status: 500 },
    );
  }
}

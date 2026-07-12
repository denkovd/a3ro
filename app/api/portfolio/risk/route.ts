/* ────────────────────────────────────────────────────────────────
   Portfolio risk audit (P·07 phase 3) — the report endpoint.

   GET /api/portfolio/risk?thesisId=12
   → { report: PortfolioRiskReport, thesis?: { id, title } }

   Assembly: positions → live marks → close series per symbol (for
   correlations/β) → realized-σ fallback for positions without an ATR
   (labeled) → scenario set from the requested thesis (or the newest
   saved one) → pure risk engine. Everything unmodelable is labeled
   and counted in coverage; nothing is silently zero.
   Node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import {
  buildRiskReport,
  closeSeriesFor,
  createDb,
  getThesis,
  getThesisMeta,
  listPositions,
  listTheses,
  markPositions,
  realizedVolFrom,
} from "@a3ro/oil-backend";
import type { ScenarioSet } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const thesisIdRaw = searchParams.get("thesisId");
    const requestedThesisId = thesisIdRaw !== null ? Number(thesisIdRaw) : null;

    const db = await createDb();
    const rows = await listPositions(db);
    const positions = await markPositions(db, rows);

    // close series per distinct symbol (correlation + β + σ fallback)
    const symbols = [...new Set(positions.map((p) => p.symbol))];
    const seriesBySymbol = new Map<string, { date: string; close: number }[]>();
    await Promise.all(
      symbols.map(async (s) => {
        seriesBySymbol.set(s, await closeSeriesFor(db, s));
      }),
    );

    // σ fallback for positions without an ATR — labeled, never silent
    for (const p of positions) {
      if (p.dailyVol === null) {
        const vol = realizedVolFrom(seriesBySymbol.get(p.symbol) ?? []);
        if (vol) {
          p.dailyVol = vol.dailySigma;
          p.volSource = `realized σ, ${vol.observations} sessions (close series)`;
        }
      }
    }

    // scenario set: requested thesis, else the newest saved one
    let scenarioSet: ScenarioSet | null = null;
    let thesisInfo: { id: number; title: string } | undefined;
    let scenarioNote = "";
    if (requestedThesisId !== null && Number.isInteger(requestedThesisId) && requestedThesisId > 0) {
      const t = await getThesis(db, requestedThesisId);
      if (!t) return Response.json({ error: `thesis ${requestedThesisId} not found` }, { status: 404 });
      scenarioSet = t.analysis.scenarios;
      thesisInfo = { id: t.id, title: t.title };
    } else {
      const summaries = await listTheses(db, 1);
      if (summaries.length > 0) {
        const t = await getThesis(db, summaries[0].id);
        if (t) {
          scenarioSet = t.analysis.scenarios;
          thesisInfo = { id: t.id, title: t.title };
          scenarioNote = " (newest saved thesis — pass ?thesisId= to pin another)";
        }
      }
    }

    const driverSeries = scenarioSet ? (seriesBySymbol.get(scenarioSet.instrument) ?? (await closeSeriesFor(db, scenarioSet.instrument))) : null;

    const thesisIds = [...new Set(rows.map((r) => r.thesisId).filter((x): x is number => x !== null))];
    const thesisMeta = await getThesisMeta(db, thesisIds);

    const report = buildRiskReport({
      positions,
      seriesBySymbol,
      scenarioSet,
      driverSeries,
      thesisMeta,
    });
    if (scenarioNote) report.scenarioBasis += scenarioNote;

    return Response.json({ report, ...(thesisInfo ? { thesis: thesisInfo } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "(portfolio_positions|theses)" does not exist/i.test(message)) {
      return Response.json(
        { error: "Thesis Lab tables missing — run `npm run migrate:thesis` in backend/.", cause: message },
        { status: 503 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

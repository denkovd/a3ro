/* ────────────────────────────────────────────────────────────────
   Thesis Lab — analyze endpoint (P·07).

   POST /api/thesis/analyze
   body: { title, body, direction?, instrument?, horizonDays?, save? }
   → { analysis: ThesisAnalysis, scenarios: ScenarioSet, thesisId? }

   Flow: parse (pure) → assemble live MarketContext for the parsed or
   overridden instrument (tape / macro / COT / trend / price / vol —
   every miss an honest null) → pressure-test (pure) → scenarios
   (pure) → optional persist. Node runtime, force-dynamic, never
   cached (house convention for storage-touching routes).
──────────────────────────────────────────────────────────────── */

import {
  analyzeThesis,
  assembleMarketContext,
  buildScenarios,
  createDb,
  insertThesis,
  parseThesis,
  THESIS_ENGINE_VERSION,
} from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DIRECTIONS = new Set(["long", "short", "neutral"]);

/** Missing-table errors get a setup hint instead of a bare 500. */
function migrationHint(message: string): string | null {
  if (/relation "(theses|portfolio_positions)" does not exist/i.test(message)) {
    return "Thesis Lab tables missing — run `npm run migrate:thesis` in backend/ (migrations/012_thesis.sql).";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw || typeof raw.body !== "string" || raw.body.trim().length < 20) {
      return Response.json(
        { error: "thesis `body` (≥ 20 chars) is required — write the thesis as you'd say it" },
        { status: 400 },
      );
    }
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 160) : "Untitled thesis";
    const body = raw.body.trim().slice(0, 8000);

    const overrides: { direction?: "long" | "short" | "neutral"; instrument?: string; horizonDays?: number } = {};
    if (typeof raw.direction === "string" && DIRECTIONS.has(raw.direction)) {
      overrides.direction = raw.direction as "long" | "short" | "neutral";
    }
    if (typeof raw.instrument === "string" && raw.instrument.trim()) {
      overrides.instrument = raw.instrument.trim().toUpperCase().slice(0, 24);
    }
    if (typeof raw.horizonDays === "number" && Number.isFinite(raw.horizonDays)) {
      overrides.horizonDays = Math.min(Math.max(Math.round(raw.horizonDays), 7), 730);
    }

    const asOf = new Date().toISOString().slice(0, 10);
    // Parse once (pure) to learn the instrument, then pull the live
    // context for exactly that instrument.
    const parsed = parseThesis(title, body, asOf, overrides);

    // The engine is pure — a dead DB must not kill the pressure test.
    // On context failure we run against an EMPTY context (every check
    // reads no_data) and say so, instead of returning a bare 500.
    let db: Awaited<ReturnType<typeof createDb>> | null = null;
    let ctx: Awaited<ReturnType<typeof assembleMarketContext>>;
    let contextError: string | undefined;
    try {
      db = await createDb();
      ctx = await assembleMarketContext(db, parsed.instrument);
    } catch (e) {
      contextError = e instanceof Error ? e.message : String(e);
      ctx = {
        asOf,
        price: null,
        priceSeries: [],
        realizedVol: null,
        tape: null,
        macro: null,
        positioning: null,
        trend: null,
        oilAdjacent: parsed.instrument === "WTI" || parsed.instrument === "BRENT",
      };
    }

    const analysis = analyzeThesis(title, body, ctx, overrides);
    const scenarios = buildScenarios(analysis, ctx);

    let thesisId: number | undefined;
    let saveError: string | undefined;
    if (raw.save === true) {
      if (db === null) {
        saveError = `not saved — live context unavailable (${contextError ?? "db error"})`;
      } else {
        try {
          thesisId = await insertThesis(db, {
            title,
            body,
            direction: analysis.parsed.direction,
            instrument: analysis.parsed.instrument,
            horizonDays: analysis.parsed.horizonDays,
            analysis,
            scenarios,
            engineVersion: THESIS_ENGINE_VERSION,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          saveError = migrationHint(msg) ?? `not saved — ${msg}`;
        }
      }
    }

    return Response.json({
      analysis,
      scenarios,
      ...(thesisId !== undefined ? { thesisId } : {}),
      ...(contextError ? { contextError: `live context unavailable — analyzed against empty context (every check reads no_data): ${contextError}` } : {}),
      ...(saveError ? { saveError } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = migrationHint(message);
    return Response.json(
      hint ? { error: hint, cause: message } : { error: message },
      { status: hint ? 503 : 500 },
    );
  }
}

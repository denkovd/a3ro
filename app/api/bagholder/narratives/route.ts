/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — narrative curation endpoint (P·08).

   GET  /api/bagholder/narratives      → { narratives: Narrative[] }
   POST /api/bagholder/narratives      → { narrative, trigger, cycleReport, board }

   V1 is hand-curated by design (architecture doc §6/§13 — automated
   narrative extraction is explicitly V3 scope): a curator reads the
   post/reply thread and submits the narrative, its implicated assets,
   the first event, and an initial trigger draft in one POST. The
   engine then scores it immediately ("analyze-on-POST", same pattern
   as Thesis Lab) by running the full deterministic cycle so the
   curator sees the real composite/state, not a stub.

   Node runtime, force-dynamic, never cached (house convention for
   storage-touching routes).
──────────────────────────────────────────────────────────────── */

import {
  createDb, insertNarrative, upsertAsset, linkNarrativeAsset, insertNarrativeEvent,
  insertTrigger, listNarratives, runBagholderCycle, getTriggerBoard,
} from "@a3ro/oil-backend";
import type {
  NarrativeCategory, PrimaryDirection, BagholderAssetClass, AssetRole, ExposureType, ImpliedDirection,
  SourceType, TriggerTaxonomy, TriggerDirection, Timeframe,
} from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CATEGORIES = new Set(["CRYPTO", "EQUITY", "MACRO", "COMMODITY", "CROSS_ASSET"]);
const DIRECTIONS = new Set(["bullish", "bearish", "mixed"]);
const ASSET_CLASSES = new Set(["CRYPTO", "MINER_EQUITY", "AI_INFRA_EQUITY", "MACRO_PROXY", "COMMODITY", "EQUITY"]);
const ASSET_ROLES = new Set(["UNDERLYING", "INFRA", "SUBSTITUTE", "BENCHMARK"]);
const EXPOSURE_TYPES = new Set(["DIRECT", "INDIRECT_INFRA", "SUBSTITUTE", "BENCHMARK"]);
const IMPLIED_DIRECTIONS = new Set(["long", "short"]);
const SOURCE_TYPES = new Set(["X_POST", "NEWS", "FILING", "ONCHAIN", "OTHER"]);
const TAXONOMIES = new Set(["LATE_NARRATIVE_FADE", "MOMENTUM_TRAP", "FORCED_ROTATION", "MINER_RERATING", "STRUCTURAL_CYCLICAL_MISMATCH"]);
const TRIGGER_DIRECTIONS = new Set(["long", "short", "pair", "basket", "no_trade"]);
const TIMEFRAMES = new Set(["INTRADAY", "SWING", "MULTI_WEEK"]);

function migrationHint(message: string): string | null {
  if (/relation "bh_\w+" does not exist/i.test(message)) {
    return "Bagholder tables missing — run `npm run migrate:bagholder` in backend/ (migrations/021_bagholder.sql).";
  }
  return null;
}

function slugify(headline: string): string {
  const base = headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "narrative";
}

export async function GET() {
  try {
    const db = await createDb();
    const narratives = await listNarratives(db);
    return Response.json({ narratives });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = migrationHint(message);
    return Response.json(hint ? { error: hint, cause: message } : { error: message }, { status: hint ? 503 : 500 });
  }
}

interface AssetInput {
  symbol: string;
  displayName: string;
  assetClass: BagholderAssetClass;
  role: AssetRole;
  exposureType: ExposureType;
  impliedDirection: ImpliedDirection | null;
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw || typeof raw.headline !== "string" || raw.headline.trim().length < 8) {
      return Response.json({ error: "`headline` (≥ 8 chars) is required" }, { status: 400 });
    }
    if (typeof raw.firstSeenAt !== "string" || Number.isNaN(Date.parse(raw.firstSeenAt))) {
      return Response.json({ error: "`firstSeenAt` (ISO date/time — the narrative's true origin, not today) is required" }, { status: 400 });
    }
    if (typeof raw.category !== "string" || !CATEGORIES.has(raw.category)) {
      return Response.json({ error: `\`category\` must be one of ${[...CATEGORIES].join(", ")}` }, { status: 400 });
    }
    if (typeof raw.primaryDirection !== "string" || !DIRECTIONS.has(raw.primaryDirection)) {
      return Response.json({ error: `\`primaryDirection\` must be one of ${[...DIRECTIONS].join(", ")}` }, { status: 400 });
    }
    if (!Array.isArray(raw.assets) || raw.assets.length === 0) {
      return Response.json({ error: "`assets` must be a non-empty array" }, { status: 400 });
    }
    const assets: AssetInput[] = [];
    for (const a of raw.assets as Record<string, unknown>[]) {
      if (typeof a.symbol !== "string" || !a.symbol.trim()) return Response.json({ error: "each asset needs a `symbol`" }, { status: 400 });
      if (typeof a.assetClass !== "string" || !ASSET_CLASSES.has(a.assetClass)) return Response.json({ error: `asset ${a.symbol}: invalid assetClass` }, { status: 400 });
      if (typeof a.role !== "string" || !ASSET_ROLES.has(a.role)) return Response.json({ error: `asset ${a.symbol}: invalid role` }, { status: 400 });
      if (typeof a.exposureType !== "string" || !EXPOSURE_TYPES.has(a.exposureType)) return Response.json({ error: `asset ${a.symbol}: invalid exposureType` }, { status: 400 });
      const impliedDirection = typeof a.impliedDirection === "string" && IMPLIED_DIRECTIONS.has(a.impliedDirection) ? (a.impliedDirection as ImpliedDirection) : null;
      assets.push({
        symbol: a.symbol.trim().toUpperCase().slice(0, 24),
        displayName: typeof a.displayName === "string" && a.displayName.trim() ? a.displayName.trim().slice(0, 80) : a.symbol.trim().toUpperCase(),
        assetClass: a.assetClass as BagholderAssetClass,
        role: a.role as AssetRole,
        exposureType: a.exposureType as ExposureType,
        impliedDirection,
      });
    }

    const triggerRaw = raw.trigger as Record<string, unknown> | undefined;
    if (!triggerRaw || typeof triggerRaw.taxonomy !== "string" || !TAXONOMIES.has(triggerRaw.taxonomy)) {
      return Response.json({ error: `\`trigger.taxonomy\` must be one of ${[...TAXONOMIES].join(", ")}` }, { status: 400 });
    }
    const timeframe: Timeframe = typeof triggerRaw.timeframe === "string" && TIMEFRAMES.has(triggerRaw.timeframe) ? (triggerRaw.timeframe as Timeframe) : "SWING";
    const direction: TriggerDirection | null = typeof triggerRaw.direction === "string" && TRIGGER_DIRECTIONS.has(triggerRaw.direction) ? (triggerRaw.direction as TriggerDirection) : null;
    const primarySymbol = typeof triggerRaw.primarySymbol === "string" && triggerRaw.primarySymbol.trim() ? triggerRaw.primarySymbol.trim().toUpperCase() : null;
    const triggerCondition = triggerRaw.triggerCondition && typeof triggerRaw.triggerCondition === "object"
      ? (triggerRaw.triggerCondition as Record<string, unknown>)
      : { condition: "composite_final >= 75 sustained 2 cycles" };
    const invalidation = triggerRaw.invalidation && typeof triggerRaw.invalidation === "object"
      ? (triggerRaw.invalidation as Record<string, unknown>)
      : { type: "manual", condition: "set at trigger creation — no invalidation rule supplied" };

    let firstEvent: { sourceType: SourceType; sourceUrl: string | null; author: string | null; authorWeight: number | null; postedAt: string; text: string | null; replyAgree: number; replyDisagree: number; replyReframe: number; hedgeDetected: boolean } | null = null;
    const eventRaw = raw.firstEvent as Record<string, unknown> | undefined;
    if (eventRaw && typeof eventRaw.postedAt === "string" && !Number.isNaN(Date.parse(eventRaw.postedAt))) {
      firstEvent = {
        sourceType: typeof eventRaw.sourceType === "string" && SOURCE_TYPES.has(eventRaw.sourceType) ? (eventRaw.sourceType as SourceType) : "OTHER",
        sourceUrl: typeof eventRaw.sourceUrl === "string" ? eventRaw.sourceUrl.slice(0, 500) : null,
        author: typeof eventRaw.author === "string" ? eventRaw.author.slice(0, 120) : null,
        authorWeight: typeof eventRaw.authorWeight === "number" ? Math.max(0, Math.min(1, eventRaw.authorWeight)) : null,
        postedAt: eventRaw.postedAt,
        text: typeof eventRaw.text === "string" ? eventRaw.text.slice(0, 4000) : null,
        replyAgree: typeof eventRaw.replyAgree === "number" ? Math.max(0, Math.round(eventRaw.replyAgree)) : 0,
        replyDisagree: typeof eventRaw.replyDisagree === "number" ? Math.max(0, Math.round(eventRaw.replyDisagree)) : 0,
        replyReframe: typeof eventRaw.replyReframe === "number" ? Math.max(0, Math.round(eventRaw.replyReframe)) : 0,
        hedgeDetected: eventRaw.hedgeDetected === true,
      };
    }

    const db = await createDb();

    let slug = slugify(raw.headline);
    let narrative;
    try {
      narrative = await insertNarrative(db, {
        slug,
        headline: raw.headline.trim().slice(0, 200),
        firstSeenAt: raw.firstSeenAt,
        category: raw.category as NarrativeCategory,
        primaryDirection: raw.primaryDirection as PrimaryDirection,
      });
    } catch {
      // slug collision — retry once with a disambiguating suffix
      slug = `${slug}-${Date.now().toString(36)}`;
      narrative = await insertNarrative(db, {
        slug,
        headline: raw.headline.trim().slice(0, 200),
        firstSeenAt: raw.firstSeenAt,
        category: raw.category as NarrativeCategory,
        primaryDirection: raw.primaryDirection as PrimaryDirection,
      });
    }

    for (const a of assets) {
      await upsertAsset(db, { symbol: a.symbol, displayName: a.displayName, assetClass: a.assetClass, role: a.role });
      await linkNarrativeAsset(db, { narrativeId: narrative.id, symbol: a.symbol, exposureType: a.exposureType, impliedDirection: a.impliedDirection });
    }

    if (firstEvent) {
      await insertNarrativeEvent(db, { narrativeId: narrative.id, ...firstEvent });
    }

    const trigger = await insertTrigger(db, {
      narrativeId: narrative.id,
      taxonomy: triggerRaw.taxonomy as TriggerTaxonomy,
      direction,
      primarySymbol,
      triggerCondition: { condition: String(triggerCondition.condition ?? ""), ...triggerCondition },
      invalidation: { type: String(invalidation.type ?? "manual"), condition: String(invalidation.condition ?? ""), ...invalidation },
      timeframe,
    });

    // Analyze-on-POST: run the real deterministic cycle immediately so
    // the curator sees the actual composite/state, not a stub value.
    const cycleReport = await runBagholderCycle(db);
    const board = (await getTriggerBoard(db)).filter((e) => e.narrative.id === narrative.id);

    return Response.json({ narrative, trigger, cycleReport, board });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = migrationHint(message);
    return Response.json(hint ? { error: hint, cause: message } : { error: message }, { status: hint ? 503 : 500 });
  }
}

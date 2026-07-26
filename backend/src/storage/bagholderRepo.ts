/* ────────────────────────────────────────────────────────────────
   Repository for the bh_* tables (Bagholder Risk Map, P·08).
   Every function takes `db: Queryable` first, same shape as every
   other repo in this backend. jsonb columns are written via
   JSON.stringify and read back defensively (pg parses jsonb
   automatically, but a text fallback is parsed by hand — same
   pattern as macroRepo.ts).
──────────────────────────────────────────────────────────────── */

import { Queryable } from "./db";
import { bandFor } from "../bagholder/engine";
import {
  AssetRef,
  BagholderAnalysis,
  InvalidationSpec,
  Narrative,
  NarrativeAssetLink,
  NarrativeCategory,
  NarrativeEvent,
  NarrativeStatus,
  PrimaryDirection,
  SourceType,
  Timeframe,
  Trigger,
  TriggerBoardEntry,
  TriggerConditionSpec,
  TriggerDirection,
  TriggerEvent,
  TriggerStateId,
  TriggerTaxonomy,
  TradeObject,
} from "../bagholder/types";

function toDateStr(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
}

/* ── narratives ────────────────────────────────────────────────── */

export interface NarrativeInput {
  slug: string;
  headline: string;
  firstSeenAt: string;
  category: NarrativeCategory;
  primaryDirection: PrimaryDirection;
}

function rowToNarrative(r: Record<string, unknown>): Narrative {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    headline: String(r.headline),
    firstSeenAt: toIso(r.first_seen_at),
    category: r.category as NarrativeCategory,
    primaryDirection: r.primary_direction as PrimaryDirection,
    status: r.status as NarrativeStatus,
    createdAt: toIso(r.created_at),
  };
}

export async function insertNarrative(db: Queryable, input: NarrativeInput): Promise<Narrative> {
  const res = await db.query(
    `insert into bh_narratives (slug, headline, first_seen_at, category, primary_direction)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [input.slug, input.headline, input.firstSeenAt, input.category, input.primaryDirection],
  );
  return rowToNarrative(res.rows[0]);
}

export async function listActiveNarratives(db: Queryable): Promise<Narrative[]> {
  const res = await db.query(`select * from bh_narratives where status = 'active' order by first_seen_at desc`);
  return res.rows.map(rowToNarrative);
}

export async function listNarratives(db: Queryable): Promise<Narrative[]> {
  const res = await db.query(`select * from bh_narratives order by first_seen_at desc`);
  return res.rows.map(rowToNarrative);
}

export async function getNarrative(db: Queryable, id: number): Promise<Narrative | null> {
  const res = await db.query(`select * from bh_narratives where id = $1`, [id]);
  return res.rows[0] ? rowToNarrative(res.rows[0]) : null;
}

export async function getNarrativeBySlug(db: Queryable, slug: string): Promise<Narrative | null> {
  const res = await db.query(`select * from bh_narratives where slug = $1`, [slug]);
  return res.rows[0] ? rowToNarrative(res.rows[0]) : null;
}

export async function updateNarrativeStatus(db: Queryable, id: number, status: NarrativeStatus): Promise<void> {
  await db.query(`update bh_narratives set status = $2 where id = $1`, [id, status]);
}

/* ── narrative events ─────────────────────────────────────────── */

export interface NarrativeEventInput {
  narrativeId: number;
  sourceType: SourceType;
  sourceUrl: string | null;
  author: string | null;
  authorWeight: number | null;
  postedAt: string;
  text: string | null;
  replyAgree: number;
  replyDisagree: number;
  replyReframe: number;
  hedgeDetected: boolean;
}

function rowToEvent(r: Record<string, unknown>): NarrativeEvent {
  return {
    id: Number(r.id),
    narrativeId: Number(r.narrative_id),
    sourceType: r.source_type as SourceType,
    sourceUrl: r.source_url === null ? null : String(r.source_url),
    author: r.author === null ? null : String(r.author),
    authorWeight: r.author_weight === null ? null : Number(r.author_weight),
    postedAt: toIso(r.posted_at),
    text: r.text === null ? null : String(r.text),
    replyAgree: Number(r.reply_agree),
    replyDisagree: Number(r.reply_disagree),
    replyReframe: Number(r.reply_reframe),
    hedgeDetected: Boolean(r.hedge_detected),
    createdAt: toIso(r.created_at),
  };
}

export async function insertNarrativeEvent(db: Queryable, input: NarrativeEventInput): Promise<NarrativeEvent> {
  const res = await db.query(
    `insert into bh_narrative_events
       (narrative_id, source_type, source_url, author, author_weight, posted_at, text,
        reply_agree, reply_disagree, reply_reframe, hedge_detected)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [
      input.narrativeId, input.sourceType, input.sourceUrl, input.author, input.authorWeight,
      input.postedAt, input.text, input.replyAgree, input.replyDisagree, input.replyReframe, input.hedgeDetected,
    ],
  );
  return rowToEvent(res.rows[0]);
}

export async function listNarrativeEvents(db: Queryable, narrativeId: number): Promise<NarrativeEvent[]> {
  const res = await db.query(
    `select * from bh_narrative_events where narrative_id = $1 order by posted_at desc`,
    [narrativeId],
  );
  return res.rows.map(rowToEvent);
}

/* ── assets & links ───────────────────────────────────────────── */

export async function upsertAsset(db: Queryable, asset: AssetRef): Promise<void> {
  await db.query(
    `insert into bh_assets (symbol, display_name, asset_class, role)
     values ($1,$2,$3,$4)
     on conflict (symbol) do update
       set display_name = excluded.display_name, asset_class = excluded.asset_class, role = excluded.role`,
    [asset.symbol, asset.displayName, asset.assetClass, asset.role],
  );
}

export async function listAssets(db: Queryable): Promise<AssetRef[]> {
  const res = await db.query(`select * from bh_assets order by symbol asc`);
  return res.rows.map((r) => ({
    symbol: String(r.symbol),
    displayName: String(r.display_name),
    assetClass: r.asset_class as AssetRef["assetClass"],
    role: r.role as AssetRef["role"],
  }));
}

export async function linkNarrativeAsset(db: Queryable, link: NarrativeAssetLink): Promise<void> {
  await db.query(
    `insert into bh_narrative_assets (narrative_id, symbol, exposure_type, implied_direction)
     values ($1,$2,$3,$4)
     on conflict (narrative_id, symbol) do update
       set exposure_type = excluded.exposure_type, implied_direction = excluded.implied_direction`,
    [link.narrativeId, link.symbol, link.exposureType, link.impliedDirection],
  );
}

export async function listNarrativeAssets(db: Queryable, narrativeId: number): Promise<NarrativeAssetLink[]> {
  const res = await db.query(`select * from bh_narrative_assets where narrative_id = $1`, [narrativeId]);
  return res.rows.map((r) => ({
    narrativeId: Number(r.narrative_id),
    symbol: String(r.symbol),
    exposureType: r.exposure_type as NarrativeAssetLink["exposureType"],
    impliedDirection: r.implied_direction === null ? null : (r.implied_direction as NarrativeAssetLink["impliedDirection"]),
  }));
}

/* ── positioning indicators ───────────────────────────────────── */

export interface PositioningIndicatorInput {
  symbol: string;
  indicatorType: string;
  reportDate: string;
  value: number;
  percentile1y: number | null;
  stance: string | null;
  source: string;
}

export async function upsertPositioningIndicator(db: Queryable, input: PositioningIndicatorInput): Promise<void> {
  await db.query(
    `insert into bh_positioning_indicators (symbol, indicator_type, report_date, value, percentile_1y, stance, source)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (symbol, indicator_type, report_date) do update
       set value = excluded.value, percentile_1y = excluded.percentile_1y,
           stance = excluded.stance, source = excluded.source, computed_at = now()`,
    [input.symbol, input.indicatorType, input.reportDate, input.value, input.percentile1y, input.stance, input.source],
  );
}

export interface PositioningIndicatorRow {
  symbol: string;
  indicatorType: string;
  reportDate: string;
  value: number;
  percentile1y: number | null;
  stance: string | null;
}

/** Latest reading per (symbol, indicator_type) for a set of symbols. */
export async function getLatestPositioningForSymbols(db: Queryable, symbols: string[]): Promise<PositioningIndicatorRow[]> {
  if (symbols.length === 0) return [];
  const res = await db.query(
    `select distinct on (symbol, indicator_type) symbol, indicator_type, report_date, value, percentile_1y, stance
       from bh_positioning_indicators
      where symbol = any($1)
      order by symbol, indicator_type, report_date desc`,
    [symbols],
  );
  return res.rows.map((r) => ({
    symbol: String(r.symbol),
    indicatorType: String(r.indicator_type),
    reportDate: toDateStr(r.report_date),
    value: Number(r.value),
    percentile1y: r.percentile_1y === null ? null : Number(r.percentile_1y),
    stance: r.stance === null ? null : String(r.stance),
  }));
}

/* ── regime snapshots ─────────────────────────────────────────── */

export interface RegimeSnapshotInput {
  narrativeId: number;
  runDate: string;
  timeframe: Timeframe;
  analysis: BagholderAnalysis;
}

export async function upsertRegimeSnapshot(db: Queryable, input: RegimeSnapshotInput): Promise<void> {
  const { analysis } = input;
  await db.query(
    `insert into bh_regime_snapshots
       (narrative_id, run_date, macro_score, narrative_score, positioning_score, opportunity_score,
        confidence_score, composite_raw, composite_final, timeframe, components, coverage, computed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     on conflict (narrative_id, run_date, timeframe) do update
       set macro_score = excluded.macro_score, narrative_score = excluded.narrative_score,
           positioning_score = excluded.positioning_score, opportunity_score = excluded.opportunity_score,
           confidence_score = excluded.confidence_score, composite_raw = excluded.composite_raw,
           composite_final = excluded.composite_final, components = excluded.components,
           coverage = excluded.coverage, computed_at = now()`,
    [
      input.narrativeId, input.runDate,
      analysis.layers.macro.score, analysis.layers.narrative.score, analysis.layers.positioning.score,
      analysis.layers.opportunity.score, analysis.layers.confidence.score,
      analysis.composite.raw, analysis.composite.final, input.timeframe,
      JSON.stringify({
        macro: analysis.layers.macro.components,
        narrative: analysis.layers.narrative.components,
        positioning: analysis.layers.positioning.components,
        opportunity: analysis.layers.opportunity.components,
        confidence: analysis.layers.confidence.components,
      }),
      analysis.coverage.total > 0 ? Math.round((analysis.coverage.available / analysis.coverage.total) * 100) : 0,
    ],
  );
}

export interface RegimeSnapshotRow {
  narrativeId: number;
  runDate: string;
  timeframe: Timeframe;
  macroScore: number;
  narrativeScore: number;
  positioningScore: number;
  opportunityScore: number;
  confidenceScore: number;
  compositeRaw: number;
  compositeFinal: number;
  components: Record<string, unknown>;
  coverage: number;
  computedAt: string;
}

function rowToSnapshot(r: Record<string, unknown>): RegimeSnapshotRow {
  return {
    narrativeId: Number(r.narrative_id),
    runDate: toDateStr(r.run_date),
    timeframe: r.timeframe as Timeframe,
    macroScore: Number(r.macro_score),
    narrativeScore: Number(r.narrative_score),
    positioningScore: Number(r.positioning_score),
    opportunityScore: Number(r.opportunity_score),
    confidenceScore: Number(r.confidence_score),
    compositeRaw: Number(r.composite_raw),
    compositeFinal: Number(r.composite_final),
    components: parseJsonb(r.components, {}),
    coverage: Number(r.coverage),
    computedAt: toIso(r.computed_at),
  };
}

export async function getLatestRegimeSnapshot(db: Queryable, narrativeId: number, timeframe: Timeframe): Promise<RegimeSnapshotRow | null> {
  const res = await db.query(
    `select * from bh_regime_snapshots where narrative_id = $1 and timeframe = $2 order by run_date desc limit 1`,
    [narrativeId, timeframe],
  );
  return res.rows[0] ? rowToSnapshot(res.rows[0]) : null;
}

/** Most recent N snapshots, newest first — used for the hysteresis check. */
export async function listRecentRegimeSnapshots(db: Queryable, narrativeId: number, timeframe: Timeframe, limit = 3): Promise<RegimeSnapshotRow[]> {
  const res = await db.query(
    `select * from bh_regime_snapshots where narrative_id = $1 and timeframe = $2 order by run_date desc limit $3`,
    [narrativeId, timeframe, limit],
  );
  return res.rows.map(rowToSnapshot);
}

/* ── triggers ──────────────────────────────────────────────────── */

export interface TriggerInput {
  narrativeId: number;
  taxonomy: TriggerTaxonomy;
  direction: TriggerDirection | null;
  primarySymbol: string | null;
  triggerCondition: TriggerConditionSpec;
  invalidation: InvalidationSpec;
  timeframe: Timeframe;
}

function rowToTrigger(r: Record<string, unknown>): Trigger {
  return {
    id: Number(r.id),
    narrativeId: Number(r.narrative_id),
    taxonomy: r.taxonomy as TriggerTaxonomy,
    state: r.state as TriggerStateId,
    direction: r.direction === null ? null : (r.direction as TriggerDirection),
    primarySymbol: r.primary_symbol === null ? null : String(r.primary_symbol),
    triggerCondition: parseJsonb(r.trigger_condition, { condition: "" }),
    invalidation: parseJsonb(r.invalidation, { type: "", condition: "" }),
    timeframe: r.timeframe as Timeframe,
    sustainCycles: Number(r.sustain_cycles),
    enteredStateAt: toIso(r.entered_state_at),
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

export async function insertTrigger(db: Queryable, input: TriggerInput): Promise<Trigger> {
  const res = await db.query(
    `insert into bh_triggers
       (narrative_id, taxonomy, direction, primary_symbol, trigger_condition, invalidation, timeframe)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [
      input.narrativeId, input.taxonomy, input.direction, input.primarySymbol,
      JSON.stringify(input.triggerCondition), JSON.stringify(input.invalidation), input.timeframe,
    ],
  );
  return rowToTrigger(res.rows[0]);
}

export async function getTrigger(db: Queryable, id: number): Promise<Trigger | null> {
  const res = await db.query(`select * from bh_triggers where id = $1`, [id]);
  return res.rows[0] ? rowToTrigger(res.rows[0]) : null;
}

/** Open (non-terminal) trigger for a (narrative, taxonomy) pair —
 *  dedup rule from the architecture doc §11: never spawn a second
 *  trigger for the same trapped cohort. */
export async function getOpenTriggerFor(db: Queryable, narrativeId: number, taxonomy: TriggerTaxonomy): Promise<Trigger | null> {
  const res = await db.query(
    `select * from bh_triggers
      where narrative_id = $1 and taxonomy = $2 and state not in ('INVALIDATED','EXPIRED')
      order by created_at desc limit 1`,
    [narrativeId, taxonomy],
  );
  return res.rows[0] ? rowToTrigger(res.rows[0]) : null;
}

export async function listTriggersForNarrative(db: Queryable, narrativeId: number): Promise<Trigger[]> {
  const res = await db.query(`select * from bh_triggers where narrative_id = $1 order by created_at desc`, [narrativeId]);
  return res.rows.map(rowToTrigger);
}

export async function updateTriggerState(
  db: Queryable,
  id: number,
  state: TriggerStateId,
  sustainCycles: number,
  resetEnteredAt: boolean,
): Promise<void> {
  await db.query(
    `update bh_triggers
        set state = $2, sustain_cycles = $3, updated_at = now()
            ${resetEnteredAt ? ", entered_state_at = now()" : ""}
      where id = $1`,
    [id, state, sustainCycles],
  );
}

export async function insertTriggerEvent(db: Queryable, input: {
  triggerId: number;
  fromState: TriggerStateId | null;
  toState: TriggerStateId;
  reason: string;
  evidence: unknown[];
}): Promise<void> {
  await db.query(
    `insert into bh_trigger_events (trigger_id, from_state, to_state, reason, evidence)
     values ($1,$2,$3,$4,$5)`,
    [input.triggerId, input.fromState, input.toState, input.reason, JSON.stringify(input.evidence)],
  );
}

export async function listTriggerEvents(db: Queryable, triggerId: number): Promise<TriggerEvent[]> {
  const res = await db.query(`select * from bh_trigger_events where trigger_id = $1 order by created_at desc`, [triggerId]);
  return res.rows.map((r) => ({
    id: Number(r.id),
    triggerId: Number(r.trigger_id),
    fromState: r.from_state === null ? null : (r.from_state as TriggerStateId),
    toState: r.to_state as TriggerStateId,
    reason: String(r.reason),
    evidence: parseJsonb(r.evidence, []),
    createdAt: toIso(r.created_at),
  }));
}

/* ── trade objects ─────────────────────────────────────────────── */

export async function insertTradeObject(db: Queryable, triggerId: number, payload: TradeObject): Promise<number> {
  const res = await db.query(
    `insert into bh_trade_objects (trigger_id, payload) values ($1,$2) returning id`,
    [triggerId, JSON.stringify(payload)],
  );
  return Number(res.rows[0].id);
}

/* ── board (the one query the frontend actually calls) ───────── */

export async function getTriggerBoard(db: Queryable): Promise<TriggerBoardEntry[]> {
  const triggerRes = await db.query(`select * from bh_triggers order by updated_at desc`);
  const triggers = triggerRes.rows.map(rowToTrigger);
  if (triggers.length === 0) return [];

  const narrativeIds = [...new Set(triggers.map((t) => t.narrativeId))];
  const narrativeRes = await db.query(`select * from bh_narratives where id = any($1)`, [narrativeIds]);
  const narrativesById = new Map(narrativeRes.rows.map((r) => [Number(r.id), rowToNarrative(r)]));

  const snapshotRes = await db.query(
    `select distinct on (narrative_id, timeframe) *
       from bh_regime_snapshots
      where narrative_id = any($1)
      order by narrative_id, timeframe, run_date desc`,
    [narrativeIds],
  );
  const snapshotsByNarrativeTimeframe = new Map<string, RegimeSnapshotRow>();
  for (const r of snapshotRes.rows) {
    const s = rowToSnapshot(r);
    snapshotsByNarrativeTimeframe.set(`${s.narrativeId}:${s.timeframe}`, s);
  }

  const entries: TriggerBoardEntry[] = [];
  for (const trigger of triggers) {
    const narrative = narrativesById.get(trigger.narrativeId);
    if (!narrative) continue;
    const snap = snapshotsByNarrativeTimeframe.get(`${trigger.narrativeId}:${trigger.timeframe}`);
    const components = snap ? (snap.components as Record<string, { key: string; label: string; effect: number; detail: string }[]>) : null;
    entries.push({
      trigger,
      narrative,
      latestSnapshot: snap
        ? {
            runDate: snap.runDate,
            layers: {
              macro: { score: snap.macroScore, coverage: { available: 0, total: 0 }, components: components?.macro ?? [] },
              narrative: { score: snap.narrativeScore, coverage: { available: 0, total: 0 }, components: components?.narrative ?? [] },
              positioning: { score: snap.positioningScore, coverage: { available: 0, total: 0 }, components: components?.positioning ?? [] },
              opportunity: { score: snap.opportunityScore, coverage: { available: 0, total: 0 }, components: components?.opportunity ?? [] },
              confidence: { score: snap.confidenceScore, coverage: { available: 0, total: 0 }, components: components?.confidence ?? [] },
            },
            composite: {
              raw: snap.compositeRaw,
              final: snap.compositeFinal,
              band: bandFor(snap.compositeFinal),
              confidenceMultiplier: 0.5 + 0.5 * (snap.confidenceScore / 100),
            },
            coverage: { available: snap.coverage, total: 100 },
          }
        : null,
    });
  }
  return entries;
}

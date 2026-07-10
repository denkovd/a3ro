/* ────────────────────────────────────────────────────────────────
   Conflict resolution: many per-source observations → one answer.
   Two independent products (never conflated — RULES.md §3):

     resolveLatestQuote : freshest usable price of ANY kind
                          (ticker/header display)
     resolveDailyClose  : one settlement value per market day
                          (canonical chart series)

   Newest-market-truth rule (RULES.md §3.1, amended):
   resolveLatestQuote no longer stops at "best usable record" — it
   also considers the newest live/delayed market print regardless of
   its staleness tier. A newer market print, however aged, is more
   truthful for a ticker than an older settlement; the staleness
   field carries the honesty (a "dead" quote is still labeled dead).
   This matters over weekends and holiday closures: a Friday market
   close ages past its live-cadence tiers by Sunday under wall-clock
   rules, while an EIA settlement from days earlier can still read
   "fresh" under its business-day publication-lag rules. Comparing
   raw observedAt sidesteps that mismatch entirely — no market-
   calendar math needed to know Thursday's trade is newer information
   than Monday's settlement. Alerting is unaffected: isAlertGrade is
   a separate, stricter gate applied downstream of this function.
──────────────────────────────────────────────────────────────── */

import {
  Benchmark,
  DailyPrice,
  LatestQuote,
  PriceRecord,
  SourceDescriptor,
  Staleness,
} from "../core/types";
import { classifyStaleness, isAlertGrade, isUsable, nowIso } from "../core/time";

/** Settlement values within this relative spread are "in agreement". */
export const DISAGREEMENT_TOLERANCE = 0.005; // 0.5 %

/** A live quote deviating this much from last settlement is suspect. */
export const SUSPECT_DEVIATION = 0.10; // 10 %

/** Kind precedence for the ticker: fresher semantics win. */
const KIND_RANK: Record<PriceRecord["kind"], number> = {
  live: 0,
  delayed: 1,
  settlement: 2,
  historical: 3,
};

export interface DescriptorLookup {
  (sourceId: string): Pick<
    SourceDescriptor,
    "priority" | "expectedCadenceMs" | "publicationLagBusinessDays"
  >;
}

interface Classified {
  record: PriceRecord;
  staleness: Staleness;
  priority: number;
}

function classifyAll(
  records: PriceRecord[],
  lookup: DescriptorLookup,
  now: Date,
): Classified[] {
  return records.map((record) => {
    const d = lookup(record.source);
    return {
      record,
      staleness: classifyStaleness(record, d, now),
      priority: d.priority,
    };
  });
}

/**
 * Ticker resolution (RULES.md §3.1, amended — newest-market-truth rule):
 *
 * 1. `usableBest`: the current-behavior pick — usable records only
 *    (fresh/aging/stale), best kind (live > delayed > settlement) →
 *    within a kind, best staleness tier → then source priority.
 * 2. `newestMarket`: among ALL classified records of kind live or
 *    delayed — usable or not — the one with the max observedAt (tie-
 *    break by staleness tier, then source priority). This is the
 *    freshest actual market print we have, full stop.
 * 3. Selection: `usableBest` wins UNLESS `newestMarket` carries a
 *    strictly newer observedAt, in which case `newestMarket` wins —
 *    returned with its honest (possibly stale/dead) staleness. A
 *    newer market print, however aged, is more truthful for a ticker
 *    than an older settlement; the staleness field carries the
 *    honesty rather than the selection filtering it out. This is
 *    what fixes the weekend/holiday case: a Thursday live quote can
 *    classify "dead" by Sunday under wall-clock cadence rules while
 *    an older EIA settlement still reads "fresh" under its business-
 *    day publication-lag rules — no market-calendar math is needed
 *    to know the live print is newer information.
 *
 * Live quotes are sanity-checked against the reference settlement
 * either way. Alerting is unaffected — isAlertGrade gates separately,
 * downstream, and still excludes stale/dead records regardless of
 * what the ticker displays.
 */
export function resolveLatestQuote(
  benchmark: Benchmark,
  records: PriceRecord[],
  lookup: DescriptorLookup,
  referenceSettlement: number | null,
  now: Date = new Date(),
  /** Staleness of `referenceSettlement` itself. When the reference close is
   *  stale/dead the suspect check is skipped — you can't call a live quote
   *  "suspect" against a lagging settlement (docs/RULES.md §3.1). Undefined
   *  (no reference classification) keeps the original always-check behavior. */
  referenceStaleness?: Staleness,
): LatestQuote | null {
  const stalenessRank: Record<Staleness, number> = { fresh: 0, aging: 1, stale: 2, dead: 3 };
  const classified = classifyAll(records, lookup, now).filter(
    (c) => c.record.benchmark === benchmark,
  );

  const usableBest = classified
    .filter((c) => isUsable(c.staleness))
    .sort(
      (a, b) =>
        KIND_RANK[a.record.kind] - KIND_RANK[b.record.kind] ||
        stalenessRank[a.staleness] - stalenessRank[b.staleness] ||
        a.priority - b.priority,
    )[0];

  const newestMarket = classified
    .filter((c) => c.record.kind === "live" || c.record.kind === "delayed")
    .sort(
      (a, b) =>
        b.record.observedAt.localeCompare(a.record.observedAt) ||
        stalenessRank[a.staleness] - stalenessRank[b.staleness] ||
        a.priority - b.priority,
    )[0];

  let chosen: Classified | undefined;
  if (
    usableBest &&
    (!newestMarket || usableBest.record.observedAt >= newestMarket.record.observedAt)
  ) {
    chosen = usableBest;
  } else if (
    newestMarket &&
    (!usableBest || newestMarket.record.observedAt > usableBest.record.observedAt)
  ) {
    chosen = newestMarket;
  } else {
    chosen = undefined;
  }
  if (!chosen) return null;

  let suspect = false;
  if (
    (chosen.record.kind === "live" || chosen.record.kind === "delayed") &&
    referenceSettlement !== null &&
    referenceSettlement !== 0
  ) {
    // Only sanity-check a live quote against a CURRENT settlement. When the
    // reference close is itself stale/dead (e.g. a lagging Brent settlement),
    // a real multi-day price move would be mislabeled "suspect" — so gate on
    // the reference's own freshness (fresh/aging = alert-grade). Callers that
    // pass no referenceStaleness keep the original always-check behavior.
    const referenceCurrent =
      referenceStaleness === undefined || isAlertGrade(referenceStaleness);
    if (referenceCurrent) {
      const deviation =
        Math.abs(chosen.record.price - referenceSettlement) / Math.abs(referenceSettlement);
      suspect = deviation > SUSPECT_DEVIATION;
    }
  }

  return {
    benchmark,
    price: chosen.record.price,
    kind: chosen.record.kind,
    source: chosen.record.source,
    observedAt: chosen.record.observedAt,
    staleness: chosen.staleness,
    suspect,
    updatedAt: nowIso(),
  };
}

/**
 * Daily-close resolution for one market day (RULES.md §3.2):
 * settlement/historical records only, same period_date.
 *  - 1 value  → take it.
 *  - 2 values → take higher-priority source; flag if spread > 0.5 %.
 *  - 3+ values → discard outliers (further than tolerance from the
 *                median), take the highest-priority survivor; flag if
 *                total spread > 0.5 %. Median is for OUTLIER REJECTION,
 *                not selection — among agreeing values, confidence wins.
 */
export function resolveDailyClose(
  benchmark: Benchmark,
  periodDate: string,
  records: PriceRecord[],
  lookup: DescriptorLookup,
): DailyPrice | null {
  const candidates = records
    .filter(
      (r) =>
        r.benchmark === benchmark &&
        r.periodDate === periodDate &&
        (r.kind === "settlement" || r.kind === "historical"),
    )
    // one record per source: prefer settlement over historical backfill
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);

  const bySource = new Map<string, PriceRecord>();
  for (const r of candidates) if (!bySource.has(r.source)) bySource.set(r.source, r);
  const values = [...bySource.values()];
  if (values.length === 0) return null;

  const prices = values.map((v) => v.price).sort((a, b) => a - b);
  const lo = prices[0];
  const hi = prices[prices.length - 1];
  const mid = (lo + hi) / 2;
  const spreadPct = mid === 0 ? 0 : Math.abs(hi - lo) / Math.abs(mid);
  const disagreement = values.length > 1 && spreadPct > DISAGREEMENT_TOLERANCE;

  let chosen: PriceRecord;
  if (values.length <= 2) {
    chosen = values.sort((a, b) => lookup(a.source).priority - lookup(b.source).priority)[0];
  } else {
    const median = prices[Math.floor(prices.length / 2)];
    const nearMedian = values.filter(
      (v) =>
        Math.abs(v.price - median) <=
        Math.abs(median === 0 ? 1 : median) * DISAGREEMENT_TOLERANCE,
    );
    const pool = nearMedian.length > 0 ? nearMedian : values;
    chosen = pool.sort(
      (a, b) =>
        lookup(a.source).priority - lookup(b.source).priority ||
        Math.abs(a.price - median) - Math.abs(b.price - median),
    )[0];
  }

  return {
    benchmark,
    periodDate,
    price: chosen.price,
    source: chosen.source,
    disagreement,
    spreadPct: values.length > 1 ? Math.round(spreadPct * 1e5) / 1e5 : null,
    updatedAt: nowIso(),
  };
}

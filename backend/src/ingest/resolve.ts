/* ────────────────────────────────────────────────────────────────
   Conflict resolution: many per-source observations → one answer.
   Two independent products (never conflated — RULES.md §3):

     resolveLatestQuote : freshest usable price of ANY kind
                          (ticker/header display)
     resolveDailyClose  : one settlement value per market day
                          (canonical chart series)
──────────────────────────────────────────────────────────────── */

import {
  Benchmark,
  DailyPrice,
  LatestQuote,
  PriceRecord,
  SourceDescriptor,
  Staleness,
} from "../core/types";
import { classifyStaleness, isUsable, nowIso } from "../core/time";

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
 * Ticker resolution (RULES.md §3.1):
 * usable records only → best kind (live > delayed > settlement) →
 * within a kind, best staleness tier → then source priority.
 * Live quotes are sanity-checked against the reference settlement.
 */
export function resolveLatestQuote(
  benchmark: Benchmark,
  records: PriceRecord[],
  lookup: DescriptorLookup,
  referenceSettlement: number | null,
  now: Date = new Date(),
): LatestQuote | null {
  const stalenessRank: Record<Staleness, number> = { fresh: 0, aging: 1, stale: 2, dead: 3 };
  const usable = classifyAll(records, lookup, now)
    .filter((c) => c.record.benchmark === benchmark && isUsable(c.staleness))
    .sort(
      (a, b) =>
        KIND_RANK[a.record.kind] - KIND_RANK[b.record.kind] ||
        stalenessRank[a.staleness] - stalenessRank[b.staleness] ||
        a.priority - b.priority,
    );

  const best = usable[0];
  if (!best) return null;

  let suspect = false;
  if (
    (best.record.kind === "live" || best.record.kind === "delayed") &&
    referenceSettlement !== null &&
    referenceSettlement !== 0
  ) {
    const deviation = Math.abs(best.record.price - referenceSettlement) / Math.abs(referenceSettlement);
    suspect = deviation > SUSPECT_DEVIATION;
  }

  return {
    benchmark,
    price: best.record.price,
    kind: best.record.kind,
    source: best.record.source,
    observedAt: best.record.observedAt,
    staleness: best.staleness,
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

/* ────────────────────────────────────────────────────────────────
   Narrative Rotation (P·09?) — deterministic scoring engine.
   Pure functions only: no React, no fetch, no Date.now(). `asOf` is
   always passed in so results are reproducible — this file is
   golden-tested against tests/fixtures/narrative-inputs.json in
   tests/narrativeScoring.test.ts.

   Concept (Trend Acceleration, absorbed per PLAN-frontend-intelligence-
   modules.md Task 3): for each narrative, look at every attention
   metric it has datapoints for, compute the delta over 1d/1w/1m
   windows, then CROSS-SECTIONALLY z-score each (metric, window) delta
   against every other narrative's delta for that same metric+window.
   This is what makes it a rotation board rather than a single-name
   trend line — "climbing" is relative to the other narratives fed the
   same day, not to the narrative's own history (which would need a
   much longer backfill than a user is going to hand-type or upload).

   A narrative's score is the weight-normalized mean of its available
   (metric, window) z-scores. Below MIN_INPUT_COUNT raw datapoints, or
   with zero computable contributions, the narrative is
   `insufficient_data` — never a score of 0 (0 is a real "no signal"
   read; insufficient_data means "we don't know yet").
──────────────────────────────────────────────────────────────── */

export type AttentionDatapoint = {
  narrativeId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Free-form input source, e.g. "google_trends", "manual_score", "mentions". */
  metric: string;
  value: number;
  source: string;
};

export type Window = "1d" | "1w" | "1m";
export const WINDOWS: Window[] = ["1d", "1w", "1m"];

/** Calendar days back that define each window's target date. */
export const WINDOW_DAYS: Record<Window, number> = { "1d": 1, "1w": 7, "1m": 30 };

/** How many days of slack around the target date count as "the" prior
 *  datapoint for that window — real-world feeds (weekly CSV exports,
 *  irregular manual entries) rarely land exactly on the target day. */
export const WINDOW_TOLERANCE_DAYS: Record<Window, number> = { "1d": 1, "1w": 2, "1m": 5 };

/** Named weight constants — recency-biased (Trend Acceleration reads
 *  the most recent move hardest), sum to 1 so a score is always a
 *  weight-normalized mean of whichever windows are actually present. */
export const WEIGHT_1D = 0.5;
export const WEIGHT_1W = 0.3;
export const WEIGHT_1M = 0.2;
export const WINDOW_WEIGHT: Record<Window, number> = {
  "1d": WEIGHT_1D,
  "1w": WEIGHT_1W,
  "1m": WEIGHT_1M,
};

/** A narrative needs at least this many raw datapoints (any metric,
 *  any date) before scoring is attempted at all. */
export const MIN_INPUT_COUNT = 3;

export type Contribution = {
  metric: string;
  window: Window;
  rawDelta: number;
  latestDate: string;
  priorDate: string;
  /** Cross-sectional z-score vs. every other narrative's delta for this (metric, window). */
  zscore: number;
  weight: number;
  weighted: number;
};

export type NarrativeScoreStatus = "scored" | "insufficient_data";

export type NarrativeScore = {
  narrativeId: string;
  inputCount: number;
  status: NarrativeScoreStatus;
  /** Weight-normalized mean of `contributions[].weighted`. Null iff insufficient_data. */
  score: number | null;
  /** Per-window chip = mean z-score across metrics for that window; null = no metric covers this window. */
  chips: Record<Window, number | null>;
  contributions: Contribution[];
  asOf: string;
};

const DAY_MS = 86_400_000;

function toEpochDays(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
}

/** Most recent point with date <= targetDays; null if none. */
function latestOnOrBefore(points: AttentionDatapoint[], targetDays: number): AttentionDatapoint | null {
  let best: AttentionDatapoint | null = null;
  let bestDays = -Infinity;
  for (const p of points) {
    const d = toEpochDays(p.date);
    if (d <= targetDays && d > bestDays) {
      best = p;
      bestDays = d;
    }
  }
  return best;
}

type RawDelta = { rawDelta: number; latestDate: string; priorDate: string };

/** One metric's series (any order, may include same-day duplicates —
 *  last one in array order wins per date via latestOnOrBefore's >
 *  comparison, which keeps the first-seen at a tied epoch day; callers
 *  should pre-dedupe if that matters, this engine does not care which
 *  survives as long as it's deterministic given a fixed input order). */
function computeDeltas(series: AttentionDatapoint[], asOfDays: number): Partial<Record<Window, RawDelta>> {
  const out: Partial<Record<Window, RawDelta>> = {};
  const latest = latestOnOrBefore(series, asOfDays);
  if (!latest) return out;
  const latestDays = toEpochDays(latest.date);
  for (const w of WINDOWS) {
    const targetDays = asOfDays - WINDOW_DAYS[w];
    const prior = latestOnOrBefore(series, targetDays);
    if (!prior) continue;
    const priorDays = toEpochDays(prior.date);
    if (priorDays === latestDays) continue; // same point — no real elapsed time, no delta
    if (targetDays - priorDays > WINDOW_TOLERANCE_DAYS[w]) continue; // too stale to count
    out[w] = { rawDelta: latest.value - prior.value, latestDate: latest.date, priorDate: prior.date };
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function populationStdev(xs: number[], m: number): number {
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Score every narrative in `narrativeIds` from a flat datapoint pool.
 *  Datapoints for narrative ids not in the list are ignored (e.g. a
 *  stale narrative removed from narratives.json but still in a user's
 *  saved log). `asOf` is the "now" reference — pass the latest date
 *  seen across the fed data, not wall-clock time, so results replay
 *  identically from a saved fixture. */
export function scoreNarratives(
  narrativeIds: string[],
  datapoints: AttentionDatapoint[],
  asOf: string,
): Record<string, NarrativeScore> {
  const asOfDays = toEpochDays(asOf);
  const idSet = new Set(narrativeIds);

  const pointsByNarrative = new Map<string, AttentionDatapoint[]>();
  for (const id of narrativeIds) pointsByNarrative.set(id, []);
  for (const dp of datapoints) {
    if (!idSet.has(dp.narrativeId)) continue;
    pointsByNarrative.get(dp.narrativeId)!.push(dp);
  }

  // Per narrative: raw (metric, window) deltas, pre-zscore.
  type Raw = { metric: string; window: Window } & RawDelta;
  const rawByNarrative = new Map<string, Raw[]>();
  for (const [id, points] of pointsByNarrative) {
    const byMetric = new Map<string, AttentionDatapoint[]>();
    for (const p of points) {
      if (!byMetric.has(p.metric)) byMetric.set(p.metric, []);
      byMetric.get(p.metric)!.push(p);
    }
    const rows: Raw[] = [];
    for (const [metric, series] of byMetric) {
      const deltas = computeDeltas(series, asOfDays);
      for (const w of WINDOWS) {
        const d = deltas[w];
        if (d) rows.push({ metric, window: w, ...d });
      }
    }
    rawByNarrative.set(id, rows);
  }

  // Cross-sectional groups: every narrative's delta for the same (metric, window).
  const groups = new Map<string, number[]>();
  for (const rows of rawByNarrative.values()) {
    for (const r of rows) {
      const key = `${r.metric}|${r.window}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r.rawDelta);
    }
  }
  const stats = new Map<string, { mean: number; stdev: number }>();
  for (const [key, vals] of groups) {
    if (vals.length < 2) continue; // can't compare cross-sectionally with one data point
    const m = mean(vals);
    stats.set(key, { mean: m, stdev: populationStdev(vals, m) });
  }

  const result: Record<string, NarrativeScore> = {};
  for (const id of narrativeIds) {
    const points = pointsByNarrative.get(id) ?? [];
    const rows = rawByNarrative.get(id) ?? [];

    const contributions: Contribution[] = [];
    for (const r of rows) {
      const key = `${r.metric}|${r.window}`;
      const groupVals = groups.get(key);
      if (!groupVals || groupVals.length < 2) continue;
      const st = stats.get(key)!;
      const zscore = st.stdev === 0 ? 0 : (r.rawDelta - st.mean) / st.stdev;
      const weight = WINDOW_WEIGHT[r.window];
      contributions.push({
        metric: r.metric,
        window: r.window,
        rawDelta: r.rawDelta,
        latestDate: r.latestDate,
        priorDate: r.priorDate,
        zscore,
        weight,
        weighted: weight * zscore,
      });
    }

    const chips: Record<Window, number | null> = { "1d": null, "1w": null, "1m": null };
    for (const w of WINDOWS) {
      const zs = contributions.filter((c) => c.window === w).map((c) => c.zscore);
      chips[w] = zs.length > 0 ? mean(zs) : null;
    }

    const weightSum = contributions.reduce((a, c) => a + c.weight, 0);
    const insufficient = points.length < MIN_INPUT_COUNT || contributions.length === 0 || weightSum === 0;
    const score = insufficient ? null : contributions.reduce((a, c) => a + c.weighted, 0) / weightSum;

    result[id] = {
      narrativeId: id,
      inputCount: points.length,
      status: insufficient ? "insufficient_data" : "scored",
      score,
      chips,
      contributions,
      asOf,
    };
  }
  return result;
}

/** Latest date across a datapoint pool — the natural `asOf` when the
 *  caller has no better "now" (e.g. rendering with whatever the user
 *  has fed so far). Null if the pool is empty. */
export function latestDateOf(datapoints: AttentionDatapoint[]): string | null {
  if (datapoints.length === 0) return null;
  return datapoints.reduce((latest, d) => (d.date > latest ? d.date : latest), datapoints[0].date);
}

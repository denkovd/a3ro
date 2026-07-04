/* ────────────────────────────────────────────────────────────────
   Alert threshold logic — pure functions, no delivery.
   The pipeline evaluates these each cycle and appends to
   alert_events; a delivery worker (deferred) consumes that table.

   Design: every rule is a LATCH (armed → fired). A fired rule does
   not fire again until its re-arm condition clears. That plus the
   edge-case guards below is what prevents alert spam. Full prose
   rules: docs/RULES.md §4.

   Hard edge-case guards (encoded in code, not convention):
   G1  Missing data is never zero — no quote ⇒ no evaluation.
   G2  Price rules only evaluate alert-grade data (fresh/aging) and
       never `suspect` quotes. Staleness itself is alerted by the
       dedicated stale_benchmark rule, not by price rules misfiring.
   G3  pct_move never compares across kinds (live vs settlement) —
       basis is explicit; a gap wider than 2× the window ⇒ skip.
   G4  Hysteresis: level_cross re-arms only after price exits the
       re-arm band (default 0.5 %) on the other side of the level.
   G5  Restart-safe dedup: the latch lives in alert_state (DB), so
       redeploys/serverless restarts don't re-fire active alerts.
──────────────────────────────────────────────────────────────── */

import { Benchmark, DailyPrice, LatestQuote } from "../core/types";
import { isAlertGrade } from "../core/time";

/* ── rule shapes (alert_rules.params) ─────────────────────────── */

export interface LevelCrossParams {
  direction: "above" | "below";
  level: number; // USD/bbl
  /** Re-arm band as fraction of level (default 0.005 = 0.5 %). */
  rearmBandPct?: number;
}

export interface PctMoveParams {
  basis: "daily_close" | "intraday";
  /** daily_close: compare vs close N trading days back. */
  windowDays?: number;
  /** intraday: compare vs oldest live/delayed quote within window. */
  windowHours?: number;
  thresholdPct: number; // e.g. 5 = 5 %
}

export interface StaleBenchmarkParams {
  /** Max acceptable age of the latest usable quote, in hours. */
  maxAgeHours: number;
}

export type AlertRule =
  | { id: string; benchmark: Benchmark; type: "level_cross"; params: LevelCrossParams }
  | { id: string; benchmark: Benchmark; type: "pct_move"; params: PctMoveParams }
  | { id: string; benchmark: Benchmark; type: "stale_benchmark"; params: StaleBenchmarkParams }
  | { id: string; benchmark: Benchmark; type: "source_disagreement"; params: Record<string, never> };

export interface AlertState {
  status: "armed" | "fired";
  lastValue: number | null;
}

export interface Evaluation {
  /** Latch transition to persist. */
  nextStatus: "armed" | "fired";
  /** Present only on the armed→fired edge. */
  event?: { ruleId: string; payload: Record<string, unknown> };
  /** Value to persist for the next evaluation's context. */
  lastValue?: number | null;
}

/** Inputs the pipeline gathers once per benchmark per cycle. */
export interface EvalContext {
  quote: LatestQuote | null;             // resolved ticker (may be absent)
  dailySeries: DailyPrice[];             // resolved closes, ascending by date
  intradaySeries: { price: number; observedAt: string }[]; // live/delayed obs, ascending
  now: Date;
}

const WEEKEND_AGE_FACTOR = 3; // markets closed: tolerate 3× the age

export function evaluateRule(rule: AlertRule, state: AlertState, ctx: EvalContext): Evaluation {
  switch (rule.type) {
    case "level_cross":
      return evalLevelCross(rule.id, rule.params, state, ctx);
    case "pct_move":
      return evalPctMove(rule.id, rule.params, state, ctx);
    case "stale_benchmark":
      return evalStale(rule.id, rule.params, state, ctx);
    case "source_disagreement":
      return evalDisagreement(rule.id, state, ctx);
  }
}

/* ── level_cross ──────────────────────────────────────────────── */

function priceRuleInput(ctx: EvalContext): LatestQuote | null {
  const q = ctx.quote;
  if (!q) return null; // G1
  if (!isAlertGrade(q.staleness) || q.suspect) return null; // G2
  return q;
}

function evalLevelCross(
  ruleId: string,
  p: LevelCrossParams,
  state: AlertState,
  ctx: EvalContext,
): Evaluation {
  const q = priceRuleInput(ctx);
  if (!q) return { nextStatus: state.status }; // no usable data → hold state

  const band = Math.abs(p.level) * (p.rearmBandPct ?? 0.005);
  const crossed = p.direction === "above" ? q.price >= p.level : q.price <= p.level;

  if (state.status === "armed") {
    if (crossed) {
      return {
        nextStatus: "fired",
        lastValue: q.price,
        event: {
          ruleId,
          payload: {
            type: "level_cross", benchmark: q.benchmark, direction: p.direction,
            level: p.level, price: q.price, source: q.source,
            kind: q.kind, observedAt: q.observedAt,
          },
        },
      };
    }
    return { nextStatus: "armed", lastValue: q.price };
  }

  // fired → re-arm only once price exits the band on the other side (G4)
  const rearmed =
    p.direction === "above" ? q.price < p.level - band : q.price > p.level + band;
  return { nextStatus: rearmed ? "armed" : "fired", lastValue: q.price };
}

/* ── pct_move ─────────────────────────────────────────────────── */

function evalPctMove(
  ruleId: string,
  p: PctMoveParams,
  state: AlertState,
  ctx: EvalContext,
): Evaluation {
  let current: number | null = null;
  let reference: number | null = null;
  let refAt: string | null = null;

  if (p.basis === "daily_close") {
    const windowDays = p.windowDays ?? 1;
    const s = ctx.dailySeries;
    if (s.length >= windowDays + 1) {
      const cur = s[s.length - 1];
      const ref = s[s.length - 1 - windowDays];
      // G3 gap guard: if the series has holes (source outage), the Nth-back
      // row may be far older than N trading days — skip rather than compare
      // across a gap. Allow weekends/holidays: 2× window + 3 calendar days.
      const calendarGapDays =
        (Date.parse(cur.periodDate) - Date.parse(ref.periodDate)) / 86_400_000;
      if (calendarGapDays <= windowDays * 2 + 3) {
        current = cur.price;
        reference = ref.price;
        refAt = ref.periodDate;
      }
    }
  } else {
    // intraday: same-kind live/delayed series only (G3)
    const q = priceRuleInput(ctx);
    if (q && (q.kind === "live" || q.kind === "delayed")) {
      const windowMs = (p.windowHours ?? 4) * 3_600_000;
      const cutoff = ctx.now.getTime() - windowMs;
      const inWindow = ctx.intradaySeries.filter(
        (o) => new Date(o.observedAt).getTime() >= cutoff,
      );
      const oldest = inWindow[0];
      if (oldest) {
        const spanMs = ctx.now.getTime() - new Date(oldest.observedAt).getTime();
        if (spanMs >= windowMs * 0.25) { // need a meaningful window covered
          current = q.price;
          reference = oldest.price;
          refAt = oldest.observedAt;
        }
      }
    }
  }

  if (current === null || reference === null || reference === 0) {
    return { nextStatus: state.status }; // G1/G3 → skip, hold latch
  }

  const movePct = Math.abs((current - reference) / Math.abs(reference)) * 100;
  const breached = movePct >= p.thresholdPct;

  if (state.status === "armed" && breached) {
    return {
      nextStatus: "fired",
      lastValue: current,
      event: {
        ruleId,
        payload: {
          type: "pct_move", basis: p.basis, movePct: Math.round(movePct * 100) / 100,
          thresholdPct: p.thresholdPct, current, reference, referenceAt: refAt,
        },
      },
    };
  }
  // re-arm once the move (vs the rolling reference) is back under half the threshold
  if (state.status === "fired" && movePct < p.thresholdPct / 2) {
    return { nextStatus: "armed", lastValue: current };
  }
  return { nextStatus: state.status, lastValue: current };
}

/* ── stale_benchmark ──────────────────────────────────────────── */

function evalStale(
  ruleId: string,
  p: StaleBenchmarkParams,
  state: AlertState,
  ctx: EvalContext,
): Evaluation {
  // No quote at all counts as stale from "forever" — that's exactly
  // what this rule exists to catch (G1 does NOT apply here).
  const ageMs = ctx.quote
    ? ctx.now.getTime() - new Date(ctx.quote.observedAt).getTime()
    : Number.POSITIVE_INFINITY;

  const day = ctx.now.getUTCDay();
  const weekend = day === 0 || day === 6;
  const limitMs = p.maxAgeHours * 3_600_000 * (weekend ? WEEKEND_AGE_FACTOR : 1);
  const isStale = ageMs > limitMs;

  if (state.status === "armed" && isStale) {
    return {
      nextStatus: "fired",
      event: {
        ruleId,
        payload: {
          type: "stale_benchmark",
          ageHours: Number.isFinite(ageMs) ? Math.round(ageMs / 360_000) / 10 : null,
          maxAgeHours: p.maxAgeHours,
          lastObservedAt: ctx.quote?.observedAt ?? null,
          lastSource: ctx.quote?.source ?? null,
        },
      },
    };
  }
  if (state.status === "fired" && !isStale) return { nextStatus: "armed" };
  return { nextStatus: state.status };
}

/* ── source_disagreement ──────────────────────────────────────── */

function evalDisagreement(ruleId: string, state: AlertState, ctx: EvalContext): Evaluation {
  const latest = ctx.dailySeries[ctx.dailySeries.length - 1];
  if (!latest) return { nextStatus: state.status };

  if (state.status === "armed" && latest.disagreement) {
    return {
      nextStatus: "fired",
      event: {
        ruleId,
        payload: {
          type: "source_disagreement",
          benchmark: latest.benchmark,
          periodDate: latest.periodDate,
          spreadPct: latest.spreadPct,
          chosenSource: latest.source,
        },
      },
    };
  }
  // re-arm when the most recent close is back in agreement
  if (state.status === "fired" && !latest.disagreement) return { nextStatus: "armed" };
  return { nextStatus: state.status };
}

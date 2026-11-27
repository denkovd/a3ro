/* ────────────────────────────────────────────────────────────────
   Ops data health (roadmap #47): freshness per series and data
   issues, read from the tables each pipeline already keeps:
     - australia_watch_observations / _fetch_runs / _revisions
     - source_health (oil, gold, BTC and market price feeds)
     - dividend_signal_runs (AI Dividend sources)
   Cron run history lives in cronRunRepo.ts.
──────────────────────────────────────────────────────────────── */
import { AUSTRALIA_REGISTRY, isAustraliaIndicator, type AustraliaIndicatorDef } from "../australia/registry";
import { estimateFreshness } from "../australia/watch";
import type { Queryable } from "./db";
import { redactErrorMessage } from "./errorLogRepo";

export type SeriesFreshness = "fresh" | "aging" | "stale" | "missing";

export interface SeriesHealth {
  group: string;
  id: string;
  label: string;
  freshness: SeriesFreshness;
  /** What the freshness was judged on, e.g. "2026-10" or a timestamp of the last good fetch. */
  asOf: string | null;
  lastFetchAt: string | null;
  lastFetchOk: boolean | null;
  error: string | null;
  note?: string;
}

export interface DataIssue { kind: "fetch error" | "revision" | "jump" | "source off"; where: string; message: string; at: string | null }

export interface DataHealth { series: SeriesHealth[]; issues: DataIssue[] }

const HOUR = 3_600_000;

/** Fetch-age freshness for feeds polled about once per `expectedHours`. */
export function ageFreshness(lastOkAt: string | null, now = new Date(), expectedHours = 24): SeriesFreshness {
  if (!lastOkAt) return "missing";
  const hours = (now.getTime() - Date.parse(lastOkAt)) / HOUR;
  if (!Number.isFinite(hours)) return "missing";
  if (hours <= expectedHours * 1.5) return "fresh";
  if (hours <= expectedHours * 3) return "aging";
  return "stale";
}

/**
 * Flags the newest change when it is far outside the series' usual moves:
 * more than `factor` times the median absolute change of the previous `window` changes.
 * Values are oldest first. Returns null when there's no jump or too little history.
 * A series that moves in fixed steps (`step`, e.g. the cash rate's 0.25) is flat between decisions, so its median
 * move is near zero and every decision would be flagged; it is flagged only for a move of more than two steps.
 */
export function suddenJump(
  values: number[],
  { window = 24, factor = 4, step }: { window?: number; factor?: number; step?: number } = {},
): { change: number; typical: number; step?: number } | null {
  if (step !== undefined && step > 0) {
    if (values.length < 2) return null;
    const last = values[values.length - 1] - values[values.length - 2];
    // Small tolerance so a stored 0.5 made of float noise isn't read as more than two 0.25 steps.
    return Math.abs(last) > 2 * step + 1e-9 ? { change: last, typical: step, step } : null;
  }
  if (values.length < 8) return null;
  const changes = values.slice(1).map((v, i) => v - values[i]);
  const last = changes[changes.length - 1];
  const prior = changes.slice(-window - 1, -1).map(Math.abs).sort((a, b) => a - b);
  if (prior.length < 6) return null;
  const mid = Math.floor(prior.length / 2);
  const typical = prior.length % 2 ? prior[mid] : (prior[mid - 1] + prior[mid]) / 2;
  if (!(typical > 0) || Math.abs(last) <= typical * factor) return null;
  return { change: last, typical };
}

export interface RevisionRow { indicator: string; period: string; from: number; to: number; at: string }

/** One entry per indicator per detection day: a re-benchmark revises many periods at once and should read as one issue. */
export function groupRevisions(rows: RevisionRow[]) {
  const groups = new Map<string, { indicator: string; at: string; count: number; earliest: string; latest: string; largest: RevisionRow }>();
  for (const r of rows) {
    const key = `${r.indicator}|${r.at.slice(0, 10)}`;
    const g = groups.get(key);
    if (!g) { groups.set(key, { indicator: r.indicator, at: r.at, count: 1, earliest: r.period, latest: r.period, largest: r }); continue; }
    g.count++;
    if (r.at > g.at) g.at = r.at;
    if (r.period < g.earliest) g.earliest = r.period;
    if (r.period > g.latest) g.latest = r.period;
    if (Math.abs(r.to - r.from) > Math.abs(g.largest.to - g.largest.from)) g.largest = r;
  }
  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at));
}

const iso = (v: unknown) => v == null ? null : new Date(String(v)).toISOString();
const clean = (v: unknown) => v == null || v === "" ? null : redactErrorMessage(String(v));
const empty = { rows: [] as Record<string, unknown>[] };

async function australiaHealth(db: Queryable, now: Date): Promise<{ series: SeriesHealth[]; issues: DataIssue[] }> {
  const [obs, runs, revisions] = await Promise.all([
    db.query(`select indicator, reference_period, value from (
        select indicator, reference_period, value, row_number() over (partition by indicator order by reference_period desc) as rn
        from australia_watch_observations) x where rn <= 26 order by indicator, reference_period asc`).catch(() => empty),
    db.query(`select distinct on (indicator) indicator, health, finished_at, error from australia_watch_fetch_runs order by indicator, finished_at desc`).catch(() => empty),
    db.query(`select indicator, reference_period, previous_value, next_value, detected_at from australia_watch_revisions
      where detected_at > now() - interval '30 days' order by detected_at desc limit 1000`).catch(() => empty),
  ]);
  const byIndicator = new Map<string, { periods: string[]; values: number[] }>();
  for (const r of obs.rows) {
    const k = String(r.indicator);
    const e = byIndicator.get(k) ?? { periods: [], values: [] };
    e.periods.push(String(r.reference_period)); e.values.push(Number(r.value));
    byIndicator.set(k, e);
  }
  const runBy = new Map(runs.rows.map((r) => [String(r.indicator), r]));
  const series: SeriesHealth[] = [];
  const issues: DataIssue[] = [];
  for (const [id, def] of Object.entries(AUSTRALIA_REGISTRY)) {
    const o = byIndicator.get(id);
    const latest = o?.periods[o.periods.length - 1] ?? null;
    const run = runBy.get(id);
    const f = estimateFreshness(def.frequency, latest, now, null, def.releaseLagDays);
    series.push({
      group: "Australia Watch", id, label: def.label,
      freshness: f === "unavailable" ? "missing" : f, asOf: latest,
      lastFetchAt: iso(run?.finished_at), lastFetchOk: run ? String(run.health) === "healthy" : null, error: clean(run?.error),
      note: `${def.frequency}, judged against an estimated ${def.releaseLagDays}-day release lag`,
    });
    const jump = o ? suddenJump(o.values, { step: (def as AustraliaIndicatorDef).stepSize }) : null;
    const moved = jump ? `${latest} moved ${jump.change > 0 ? "+" : ""}${round(jump.change)}` : "";
    if (jump && latest) issues.push({ kind: "jump", where: `Australia Watch · ${def.label}`, at: null,
      message: `${jump.step !== undefined
        ? `${moved}, more than two ${round(jump.step)} steps in one ${def.frequency === "quarterly" ? "quarter" : "month"}`
        : `${moved} vs a typical move of ${round(jump.typical)}`}. Check it's real before it feeds the Pulse.` });
  }
  for (const g of groupRevisions(revisions.rows.map((r) => ({
    indicator: String(r.indicator), period: String(r.reference_period), from: Number(r.previous_value), to: Number(r.next_value), at: iso(r.detected_at) ?? "",
  })))) {
    const label = isAustraliaIndicator(g.indicator) ? AUSTRALIA_REGISTRY[g.indicator].label : g.indicator;
    const big = g.largest;
    issues.push({ kind: "revision", where: `Australia Watch · ${label}`, at: g.at,
      message: g.count === 1 ? `${big.period} revised from ${round(big.from)} to ${round(big.to)}`
        : `${g.count} periods revised (${g.earliest} to ${g.latest}); largest ${big.period}: ${round(big.from)} to ${round(big.to)}` });
  }
  return { series, issues };
}

const round = (n: number) => Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toPrecision(2);

async function sourceFeedHealth(db: Queryable, now: Date): Promise<{ series: SeriesHealth[]; issues: DataIssue[] }> {
  const res = await db.query(`select s.id, s.name, s.enabled, h.last_success_at, h.last_error_at, h.last_error_message,
      h.consecutive_failures, h.cooldown_until, h.disabled
    from sources s left join source_health h on h.source_id = s.id order by s.priority, s.id`).catch(() => empty);
  const series: SeriesHealth[] = [];
  const issues: DataIssue[] = [];
  for (const r of res.rows) {
    const id = String(r.id);
    const off = r.enabled === false || r.disabled === true;
    const lastOk = iso(r.last_success_at);
    const lastErr = iso(r.last_error_at);
    const failing = Number(r.consecutive_failures ?? 0) > 0;
    const cooling = r.cooldown_until && Date.parse(String(r.cooldown_until)) > now.getTime();
    series.push({
      group: "Price and flow feeds", id, label: String(r.name ?? id),
      freshness: ageFreshness(lastOk, now), asOf: lastOk,
      lastFetchAt: [lastOk, lastErr].filter(Boolean).sort().pop() ?? null,
      lastFetchOk: lastOk || lastErr ? !failing : null,
      error: failing ? clean(r.last_error_message) : null,
      note: off ? "turned off" : cooling ? `cooling down until ${iso(r.cooldown_until)}` : failing ? `${r.consecutive_failures} failures in a row` : undefined,
    });
    if (r.disabled === true) issues.push({ kind: "source off", where: String(r.name ?? id), at: lastErr, message: "Disabled after an auth failure; re-enable by hand once the key is fixed." });
  }
  return { series, issues };
}

async function dividendHealth(db: Queryable, now: Date): Promise<SeriesHealth[]> {
  const [latest, healthy] = await Promise.all([
    db.query(`select distinct on (source_key) source_key, checked_at, health, error from dividend_signal_runs order by source_key, checked_at desc, id desc`).catch(() => empty),
    db.query(`select source_key, max(checked_at) as t from dividend_signal_runs where health = 'healthy' group by source_key`).catch(() => empty),
  ]);
  const okBy = new Map(healthy.rows.map((r) => [String(r.source_key), iso(r.t)]));
  return latest.rows.map((r) => {
    const id = String(r.source_key);
    const lastOk = okBy.get(id) ?? null;
    return {
      group: "AI Dividend sources", id, label: id,
      freshness: ageFreshness(lastOk, now), asOf: lastOk,
      lastFetchAt: iso(r.checked_at), lastFetchOk: String(r.health) === "healthy", error: clean(r.error),
    };
  });
}

/** All series with a freshness verdict, plus data issues (revisions, jumps, disabled sources). Missing tables are skipped. */
export async function getDataHealth(db: Queryable, now = new Date()): Promise<DataHealth> {
  const [au, feeds, dividend] = await Promise.all([australiaHealth(db, now), sourceFeedHealth(db, now), dividendHealth(db, now)]);
  const issues = [...feeds.issues, ...au.issues].sort((a, b) => (b.at ?? "9").localeCompare(a.at ?? "9"));
  return { series: [...au.series, ...feeds.series, ...dividend], issues };
}

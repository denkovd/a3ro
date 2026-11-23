/* ────────────────────────────────────────────────────────────────
   Cron run log (roadmap #47). Each scheduled run is stored with its
   timing, overall status and a compact per-series result list pulled
   out of the route's JSON report. The report shapes differ by job
   (provider lists, per-indicator maps, nested cycle reports), so
   summarizeCronReport reads them generically.
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "./db";
import { redactErrorMessage } from "./errorLogRepo";

export type CronRunStatus = "ok" | "degraded" | "failed";
export type CronResultState = "ok" | "failed" | "skipped";
export interface CronSeriesResult { name: string; state: CronResultState; detail?: string }
export interface CronRunSummary { status: CronRunStatus; results: CronSeriesResult[]; error: string | null }
export interface CronRunInput extends CronRunSummary { job: string; startedAt: string; durationMs: number; httpStatus: number }
export interface CronRunRow extends CronRunInput { id: number }

const MAX_RESULTS = 80;
const MAX_DETAIL = 200;
const RETENTION_DAYS = 90;
/** Keys that name a series inside a list item. `id` is left out on purpose: too many data rows carry one. */
const NAME_KEYS = ["sourceId", "source", "indicator", "symbol", "seriesId", "series", "metric"] as const;
/** A list item counts as a result only if it carries one of these outcome keys. */
const OUTCOME_KEYS = ["ok", "archived", "error", "skipped"] as const;
/** Duplicates of data reported elsewhere in the same body, or internal plumbing. */
const SKIP_KEYS = new Set(["summary", "panel"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const detail = (v: unknown) => typeof v === "string" && v ? redactErrorMessage(v).slice(0, MAX_DETAIL) : undefined;

function itemState(item: Record<string, unknown>): CronResultState {
  if (item.skipped) return "skipped";
  if (typeof item.error === "string" && item.error) return "failed";
  if (item.ok === false || item.archived === false) return "failed";
  return "ok";
}

function itemName(item: Record<string, unknown>): string | null {
  for (const k of NAME_KEYS) if (typeof item[k] === "string" && item[k]) return item[k] as string;
  return null;
}

function collect(value: unknown, prefix: string, depth: number, out: CronSeriesResult[]) {
  const join = (name: string) => prefix ? `${prefix}/${name}` : name;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isObject(item) || !OUTCOME_KEYS.some((k) => k in item)) continue;
      const name = itemName(item);
      if (!name) continue;
      const state = itemState(item);
      out.push({ name: join(name), state, ...(state === "failed" ? { detail: detail(item.error) } : state === "skipped" ? { detail: detail(item.skipped) } : {}) });
    }
    return;
  }
  if (!isObject(value) || depth > 2) return;
  for (const [key, child] of Object.entries(value)) {
    if (SKIP_KEYS.has(key)) continue;
    if (key === "results" && isObject(child)) {
      // Per-series map, e.g. Australia Watch: { indicator: { written, error? } }.
      for (const [name, r] of Object.entries(child)) {
        if (!isObject(r)) continue;
        const state = itemState(r);
        out.push({ name: join(name), state, ...(state === "failed" ? { detail: detail(r.error) } : {}) });
      }
      continue;
    }
    if (Array.isArray(child)) { collect(child, prefix, depth + 1, out); continue; }
    if (!isObject(child)) continue;
    // A sub-cycle that failed outright reports just { error }.
    if (typeof child.error === "string" && child.error) { out.push({ name: join(key), state: "failed", detail: detail(child.error) }); continue; }
    collect(child, join(key), depth + 1, out);
  }
}

/** Reads a cron route's JSON body (or null when it wasn't JSON) into an overall status and per-series results. */
export function summarizeCronReport(body: unknown, httpStatus: number): CronRunSummary {
  const results: CronSeriesResult[] = [];
  collect(body, "", 0, results);
  const root = isObject(body) ? body : {};
  const rootError = typeof root.error === "string" ? root.error
    : isObject(root.error) && typeof root.error.message === "string" ? root.error.message : null;
  const failed = results.filter((r) => r.state === "failed");
  const flaggedDegraded = (Array.isArray(root.degraded) && root.degraded.length > 0) || root.status === "degraded";
  const status: CronRunStatus = httpStatus >= 500 ? "failed"
    : rootError || failed.length || flaggedDegraded ? "degraded" : "ok";
  const error = rootError ? detail(rootError) ?? null
    : failed.length ? `${failed.length} of ${results.length} series failed${failed[0].detail ? `; first: ${failed[0].name}: ${failed[0].detail}` : `: ${failed.slice(0, 5).map((f) => f.name).join(", ")}`}`
    : httpStatus >= 500 ? `HTTP ${httpStatus}` : null;
  // Keep every failure; fill the rest of the cap with the others.
  const kept = [...failed, ...results.filter((r) => r.state !== "failed")].slice(0, MAX_RESULTS);
  return { status, results: kept, error: error ? error.slice(0, MAX_DETAIL * 2) : null };
}

export async function recordCronRun(db: Queryable, run: CronRunInput): Promise<void> {
  await db.query(
    `insert into cron_runs (job, started_at, duration_ms, status, http_status, results, error) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [run.job.slice(0, 120), run.startedAt, Math.max(0, Math.round(run.durationMs)), run.status, run.httpStatus, JSON.stringify(run.results), run.error],
  );
  // Ten-ish rows a day; trimming on insert keeps the table small without its own job.
  await db.query(`delete from cron_runs where started_at < now() - make_interval(days => $1)`, [RETENTION_DAYS]);
}

function mapRun(r: Record<string, unknown>): CronRunRow {
  return {
    id: Number(r.id), job: String(r.job), startedAt: new Date(String(r.started_at)).toISOString(),
    durationMs: Number(r.duration_ms), status: String(r.status) as CronRunStatus, httpStatus: Number(r.http_status),
    results: Array.isArray(r.results) ? r.results as CronSeriesResult[] : [], error: r.error == null ? null : String(r.error),
  };
}

/** Latest run per job, and the most recent runs overall. */
export async function getCronRuns(db: Queryable, recentLimit = 40): Promise<{ latest: CronRunRow[]; recent: CronRunRow[] }> {
  const [latest, recent] = await Promise.all([
    db.query(`select distinct on (job) * from cron_runs order by job, started_at desc`),
    db.query(`select * from cron_runs order by started_at desc limit $1`, [recentLimit]),
  ]);
  return { latest: latest.rows.map(mapRun), recent: recent.rows.map(mapRun) };
}

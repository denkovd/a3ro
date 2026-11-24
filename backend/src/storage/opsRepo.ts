/* ────────────────────────────────────────────────────────────────
   Owner Ops queries (roadmap #50 usage, #51 growth, #52 controls,
   #53 scorecard). Read-mostly; the only writes are owner settings.
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "./db";

/* ── #50 usage ── */

/** Supabase free plan database limit (500 MB, taken as decimal megabytes to stay on the safe side). */
export const DB_FREE_LIMIT_BYTES = 500_000_000;

export interface DbUsage {
  totalBytes: number;
  limitBytes: number;
  tables: { name: string; bytes: number; rows: number }[];
  /** Estimated growth per day from the tables that get new dated rows every day. */
  growthBytesPerDay: number;
  growth: { name: string; rowsPerDay: number; bytesPerDay: number }[];
}

/** Tables that gain dated rows daily, with the column that dates them. */
const GROWING_TABLES: { name: string; dateColumn: string }[] = [
  { name: "market_bars", dateColumn: "date" },
  { name: "bull_snapshots", dateColumn: "run_date" },
  { name: "bull_source_health", dateColumn: "run_date" },
];

export async function getDbUsage(db: Queryable): Promise<DbUsage> {
  const [size, tables] = await Promise.all([
    db.query(`select pg_database_size(current_database())::bigint as b`),
    db.query(`select c.relname as name, pg_total_relation_size(c.oid)::bigint as bytes, greatest(c.reltuples, 0)::bigint as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 2 desc limit 12`),
  ]);
  const tableRows = tables.rows.map((r) => ({ name: String(r.name), bytes: Number(r.bytes), rows: Number(r.rows) }));
  const growth = [];
  for (const t of GROWING_TABLES) {
    const info = tableRows.find((x) => x.name === t.name);
    if (!info || info.rows === 0) continue;
    try {
      // Identifiers come from the constant list above, never from input.
      const recent = await db.query(`select count(*)::int as n from ${t.name} where ${t.dateColumn} > current_date - 14`);
      const rowsPerDay = Number(recent.rows[0]?.n ?? 0) / 14;
      growth.push({ name: t.name, rowsPerDay: Math.round(rowsPerDay), bytesPerDay: Math.round(rowsPerDay * (info.bytes / info.rows)) });
    } catch {
      // A missing table just isn't counted.
    }
  }
  return {
    totalBytes: Number(size.rows[0]?.b ?? 0),
    limitBytes: DB_FREE_LIMIT_BYTES,
    tables: tableRows,
    growthBytesPerDay: growth.reduce((s, g) => s + g.bytesPerDay, 0),
    growth,
  };
}

/* ── #51 growth ── */

export interface GrowthSummary {
  leads: { total: number; last30: number; byContext: { context: string; count: number }[]; recent: { email: string; context: string | null; createdAt: string }[] };
  signups30: number;
  pageViews30: number;
  outbound30: number;
}

export async function getGrowthSummary(db: Queryable): Promise<GrowthSummary> {
  const [totals, byContext, recent, events] = await Promise.all([
    db.query(`select count(*)::int as total, count(*) filter (where created_at > now() - interval '30 days')::int as last30 from leads`),
    db.query(`select coalesce(context, 'contact form') as context, count(*)::int as count from leads group by 1 order by 2 desc limit 12`),
    db.query(`select email, context, created_at from leads order by created_at desc limit 20`),
    db.query(`select count(*) filter (where type = 'signup')::int as signups, count(*) filter (where type = 'page_view')::int as views,
      count(*) filter (where type = 'outbound')::int as outbound from site_events where occurred_at > now() - interval '30 days'`).catch(() => ({ rows: [] as Record<string, unknown>[] })),
  ]);
  return {
    leads: {
      total: Number(totals.rows[0]?.total ?? 0),
      last30: Number(totals.rows[0]?.last30 ?? 0),
      byContext: byContext.rows.map((r) => ({ context: String(r.context), count: Number(r.count) })),
      recent: recent.rows.map((r) => ({ email: String(r.email), context: r.context == null ? null : String(r.context), createdAt: new Date(String(r.created_at)).toISOString() })),
    },
    signups30: Number(events.rows[0]?.signups ?? 0),
    pageViews30: Number(events.rows[0]?.views ?? 0),
    outbound30: Number(events.rows[0]?.outbound ?? 0),
  };
}

/* ── #52 controls: per-module owner settings ── */

export type AccessLevelSetting = "public" | "premium";
export interface ModuleSetting { moduleId: string; level: AccessLevelSetting | null; fitRating: number | null; updatedAt: string | null }

export async function getModuleSettings(db: Queryable): Promise<ModuleSetting[]> {
  const res = await db.query(`select module_id, level, fit_rating, updated_at from module_settings`);
  return res.rows.map((r) => ({
    moduleId: String(r.module_id),
    level: r.level == null ? null : (String(r.level) as AccessLevelSetting),
    fitRating: r.fit_rating == null ? null : Number(r.fit_rating),
    updatedAt: r.updated_at == null ? null : new Date(String(r.updated_at)).toISOString(),
  }));
}

export async function saveModuleSetting(db: Queryable, moduleId: string, patch: { level?: AccessLevelSetting | null; fitRating?: number | null }): Promise<void> {
  const level = patch.level === undefined ? null : patch.level;
  const fit = patch.fitRating === undefined ? null : patch.fitRating;
  await db.query(
    `insert into module_settings (module_id, level, fit_rating, updated_at) values ($1, $2, $3, now())
     on conflict (module_id) do update set
       level = case when $4 then excluded.level else module_settings.level end,
       fit_rating = case when $5 then excluded.fit_rating else module_settings.fit_rating end,
       updated_at = now()`,
    [moduleId, level, fit, patch.level !== undefined, patch.fitRating !== undefined],
  );
}

/* ── manual jobs ── */

export interface ManualJobRun { jobId: string; doneAt: string; note: string | null }

/** Latest run per job, plus the last few runs overall for the history list. */
export async function getManualJobRuns(db: Queryable): Promise<{ latest: Record<string, string>; recent: ManualJobRun[] }> {
  const [latest, recent] = await Promise.all([
    db.query(`select distinct on (job_id) job_id, done_at from manual_job_runs order by job_id, done_at desc`),
    db.query(`select job_id, done_at, note from manual_job_runs order by done_at desc limit 20`),
  ]);
  return {
    latest: Object.fromEntries(latest.rows.map((r) => [String(r.job_id), new Date(String(r.done_at)).toISOString()])),
    recent: recent.rows.map((r) => ({ jobId: String(r.job_id), doneAt: new Date(String(r.done_at)).toISOString(), note: r.note == null ? null : String(r.note) })),
  };
}

export async function recordManualJobRun(db: Queryable, jobId: string, note: string | null): Promise<void> {
  await db.query(`insert into manual_job_runs (job_id, note) values ($1, $2)`, [jobId, note]);
}

/* ── #53 scorecard inputs ── */

export interface ModuleSignals {
  /** Hours since each module's data last refreshed (null when unknown). */
  lastRefreshHours: Record<string, number | null>;
  /** Share of Australia Watch series healthy in their latest run (0..1). */
  australiaHealthyShare: number | null;
  /** Page views + outbound clicks + sign-ups in the last 7 days, by path. */
  usageByPath: { path: string; count: number }[];
  /** Distinct errors seen in the last 7 days, by error-log source. */
  errorsBySource: { source: string; distinct: number }[];
}

/** Latest refresh time per module, from each module's own run or snapshot table. */
const FRESHNESS_SQL: Record<string, string> = {
  australia: `select max(finished_at) as t from australia_watch_fetch_runs`,
  commodity: `select max(updated_at) as t from source_health`,
  macro: `select max(computed_at) as t from macro_snapshots`,
  trend: `select max(updated_at) as t from bull_snapshots where run_date = (select max(run_date) from bull_snapshots)`,
  earnings: `select max(finished_at) as t from pipeline_runs where status = 'success'`,
  regime: `select max(computed_at) as t from macro_snapshots`,
  gold: `select max(computed_at) as t from gold_snapshots`,
  btc: `select max(computed_at) as t from btc_snapshots`,
  dividend: `select max(checked_at) as t from dividend_signal_runs where health = 'healthy'`,
};

export async function getModuleSignals(db: Queryable): Promise<ModuleSignals> {
  const lastRefreshHours: Record<string, number | null> = {};
  await Promise.all(Object.entries(FRESHNESS_SQL).map(async ([id, sql]) => {
    try {
      const r = await db.query(sql);
      const t = r.rows[0]?.t;
      lastRefreshHours[id] = t ? Math.round(((Date.now() - new Date(String(t)).getTime()) / 3_600_000) * 10) / 10 : null;
    } catch {
      lastRefreshHours[id] = null;
    }
  }));
  const [au, usage, errors] = await Promise.all([
    db.query(`select avg(case when health = 'healthy' then 1.0 else 0.0 end)::float as share from (
      select distinct on (indicator) health from australia_watch_fetch_runs order by indicator, finished_at desc) latest`).catch(() => ({ rows: [{ share: null }] })),
    db.query(`select path, count(*)::int as count from site_events where occurred_at > now() - interval '7 days' and type in ('page_view', 'outbound', 'signup') group by path`).catch(() => ({ rows: [] })),
    db.query(`select source, count(*)::int as distinct from app_errors where last_seen > now() - interval '7 days' group by source`).catch(() => ({ rows: [] })),
  ]);
  return {
    lastRefreshHours,
    australiaHealthyShare: au.rows[0]?.share == null ? null : Number(au.rows[0].share),
    usageByPath: usage.rows.map((r) => ({ path: String(r.path), count: Number(r.count) })),
    errorsBySource: errors.rows.map((r) => ({ source: String(r.source), distinct: Number(r.distinct) })),
  };
}

import type { Queryable } from "./db";

export const SITE_EVENT_TYPES = ["page_view", "outbound", "search", "asset_view", "signup", "watch"] as const;
export type SiteEventType = (typeof SITE_EVENT_TYPES)[number];
export interface SiteEvent { type: SiteEventType; path: string; target: string | null; resultCount: number | null }

/**
 * Validates and cleans an event from the browser. Returns null for anything malformed. Paths lose
 * their query string; search terms that look personal (an email, a long number) are dropped.
 */
export function cleanSiteEvent(input: unknown): SiteEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const e = input as Record<string, unknown>;
  if (!SITE_EVENT_TYPES.includes(e.type as SiteEventType)) return null;
  if (typeof e.path !== "string" || !e.path.startsWith("/")) return null;
  const path = e.path.split(/[?#]/)[0].slice(0, 200);
  let target = typeof e.target === "string" ? e.target.trim().slice(0, 120) : null;
  if (e.type === "search" && target) {
    target = target.toLowerCase().slice(0, 40);
    if (target.includes("@") || /\d{6,}/.test(target)) target = "[redacted]";
  }
  if (e.type === "outbound" && target) {
    try { target = new URL(target).hostname.replace(/^www\./, ""); } catch { return null; }
  }
  const resultCount = typeof e.resultCount === "number" && Number.isInteger(e.resultCount) && e.resultCount >= 0 && e.resultCount < 100_000 ? e.resultCount : null;
  return { type: e.type as SiteEventType, path, target: target || null, resultCount };
}

export async function insertSiteEvent(db: Queryable, event: SiteEvent): Promise<void> {
  await db.query(`insert into site_events (type, path, target, result_count) values ($1, $2, $3, $4)`, [event.type, event.path, event.target, event.resultCount]);
}

export interface SiteStats {
  days: number;
  totals: { type: string; count: number }[];
  topPages: { path: string; count: number }[];
  outbound: { target: string; count: number }[];
  searches: { target: string; count: number; noResults: number }[];
  assets: { target: string; count: number }[];
  signups: { path: string; target: string | null; count: number }[];
  daily: { day: string; pageViews: number }[];
}

export async function getSiteStats(db: Queryable, days = 30): Promise<SiteStats> {
  const since = `now() - make_interval(days => $1)`;
  const q = (sql: string) => db.query(sql, [days]).then((r) => r.rows);
  const [totals, topPages, outbound, searches, assets, signups, daily] = await Promise.all([
    q(`select type, count(*)::int as count from site_events where occurred_at > ${since} group by type order by count desc`),
    q(`select path, count(*)::int as count from site_events where type = 'page_view' and occurred_at > ${since} group by path order by count desc limit 15`),
    q(`select target, count(*)::int as count from site_events where type = 'outbound' and occurred_at > ${since} group by target order by count desc limit 15`),
    q(`select target, count(*)::int as count, count(*) filter (where result_count = 0)::int as no_results from site_events where type = 'search' and target is not null and occurred_at > ${since} group by target order by count desc limit 20`),
    q(`select target, count(*)::int as count from site_events where type = 'asset_view' and occurred_at > ${since} group by target order by count desc limit 15`),
    q(`select path, target, count(*)::int as count from site_events where type = 'signup' and occurred_at > ${since} group by path, target order by count desc limit 15`),
    q(`select to_char(date_trunc('day', occurred_at at time zone 'Australia/Sydney'), 'YYYY-MM-DD') as day, count(*)::int as count from site_events where type = 'page_view' and occurred_at > ${since} group by 1 order by 1`),
  ]);
  return {
    days,
    totals: totals.map((r) => ({ type: String(r.type), count: Number(r.count) })),
    topPages: topPages.map((r) => ({ path: String(r.path), count: Number(r.count) })),
    outbound: outbound.map((r) => ({ target: String(r.target), count: Number(r.count) })),
    searches: searches.map((r) => ({ target: String(r.target), count: Number(r.count), noResults: Number(r.no_results) })),
    assets: assets.map((r) => ({ target: String(r.target), count: Number(r.count) })),
    signups: signups.map((r) => ({ path: String(r.path), target: r.target == null ? null : String(r.target), count: Number(r.count) })),
    daily: daily.map((r) => ({ day: String(r.day), pageViews: Number(r.count) })),
  };
}

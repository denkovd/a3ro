/* ────────────────────────────────────────────────────────────────
   Module scorecard (roadmap #53). Weekly 0–100 per module:
     Health 30  data refreshed on schedule (Australia Watch also by series success)
     Usage  30  page views + outbound clicks + sign-ups, last 7 days (log scale vs the busiest module)
     Cost   15  data/API spend; free scores full
     Upkeep 15  distinct errors in the last 7 days (−3 each)
     Fit    10  owner's 1–5 rating (default 3)
   ≥70 invest / upgrade to our own · 40–69 keep · <40 park.
──────────────────────────────────────────────────────────────── */
import { MODULE_ACCESS, type ModuleAccess } from "./access";

export const WEIGHTS = { health: 30, usage: 30, cost: 15, upkeep: 15, fit: 10 } as const;

/** Expected hours between refreshes; "late" is up to twice this. */
export const REFRESH_CADENCE_HOURS: Record<string, number> = {
  australia: 26, dividend: 26, commodity: 26, macro: 26, trend: 30, earnings: 8 * 24, regime: 26, gold: 26, btc: 26,
};

/** Monthly data/API spend per module (A$). Everything is on free tiers today. */
export const MONTHLY_COST_AUD: Record<string, number> = {};

/** Cron jobs that feed each module, matched against the error log's "cron:<name>" sources. */
export const MODULE_CRONS: Record<string, string[]> = {
  australia: ["australia-watch"], dividend: ["dividend-signals", "dividend-constraints", "value-chain"],
  commodity: ["ingest", "oil", "scores", "refineries"], macro: ["macro"], regime: ["macro"],
  trend: [], earnings: ["earnings"], gold: ["ingest"], btc: ["btc"],
};

export interface ScorecardInput {
  lastRefreshHours: Record<string, number | null>;
  australiaHealthyShare: number | null;
  usageByPath: { path: string; count: number }[];
  errorsBySource: { source: string; distinct: number }[];
  fitRatings: Record<string, number | null>;
}

export interface ScoreRow {
  id: string; label: string;
  health: number; usage: number | null; cost: number; upkeep: number; fit: number;
  total: number; verdict: "invest" | "keep" | "park";
  notes: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function moduleUsage(module: ModuleAccess, usageByPath: { path: string; count: number }[]): number {
  return usageByPath.filter((u) => module.pages.some((p) => matches(u.path, p))).reduce((s, u) => s + u.count, 0);
}

export function moduleErrors(module: ModuleAccess, errorsBySource: { source: string; distinct: number }[]): number {
  const sources = new Set([
    ...(MODULE_CRONS[module.id] ?? []).map((c) => `cron:${c}`),
  ]);
  return errorsBySource.filter((e) => sources.has(e.source) || module.apis.some((a) => e.source === `api:${a.slice(5)}` || e.source.startsWith(`api:${a.slice(5)}/`)))
    .reduce((s, e) => s + e.distinct, 0);
}

export function computeScorecard(input: ScorecardInput): ScoreRow[] {
  const verdictFor = (total: number): ScoreRow["verdict"] => total >= 70 ? "invest" : total >= 40 ? "keep" : "park";
  const modules = MODULE_ACCESS.filter((m) => !m.hidden && m.id in REFRESH_CADENCE_HOURS);
  const usage = Object.fromEntries(modules.map((m) => [m.id, moduleUsage(m, input.usageByPath)]));
  const maxUsage = Math.max(0, ...Object.values(usage));

  return modules.map((m): ScoreRow => {
    const notes: string[] = [];
    const age = input.lastRefreshHours[m.id];
    const cadence = REFRESH_CADENCE_HOURS[m.id];
    let fresh = age == null ? 0 : age <= cadence ? 1 : age <= cadence * 2 ? 0.5 : 0;
    if (age == null) notes.push("no refresh record");
    else if (fresh < 1) notes.push(`last refreshed ${Math.round(age)}h ago`);
    if (m.id === "australia" && input.australiaHealthyShare != null) {
      fresh *= input.australiaHealthyShare;
      if (input.australiaHealthyShare < 1) notes.push(`${Math.round(input.australiaHealthyShare * 100)}% of series healthy`);
    }
    const health = round1(WEIGHTS.health * fresh);

    // With no usage data at all yet, usage is left out and the rest is scaled up to 100.
    const usageScore = maxUsage === 0 ? null : round1(WEIGHTS.usage * Math.log1p(usage[m.id]) / Math.log1p(maxUsage));

    const monthly = MONTHLY_COST_AUD[m.id] ?? 0;
    const cost = monthly <= 0 ? WEIGHTS.cost : round1(Math.max(0, WEIGHTS.cost * (1 - monthly / 500)));

    const errors = moduleErrors(m, input.errorsBySource);
    const upkeep = Math.max(0, WEIGHTS.upkeep - 3 * errors);
    if (errors) notes.push(`${errors} distinct error${errors === 1 ? "" : "s"} this week`);

    const rating = input.fitRatings[m.id] ?? 3;
    const fit = round1(WEIGHTS.fit * rating / 5);

    const raw = health + (usageScore ?? 0) + cost + upkeep + fit;
    const total = Math.round(usageScore === null ? raw * 100 / (100 - WEIGHTS.usage) : raw);
    return { id: m.id, label: m.label, health, usage: usageScore, cost, upkeep, fit, total, verdict: verdictFor(total), notes };
  }).sort((a, b) => b.total - a.total);
}

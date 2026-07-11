/* ────────────────────────────────────────────────────────────────
   Timestamp handling: market-close instants, business-day math,
   staleness classification. Dependency-free (uses Intl for tz).

   Conventions
   - Everything stored/emitted is ISO-8601 UTC.
   - Settlement records carry periodDate (market day) AND observedAt
     (the market-close instant of that day, DST-correct).
   - Staleness is computed relative to a source's expected cadence,
     never hard-coded per call site.
──────────────────────────────────────────────────────────────── */

import type { PriceKind, SourceDescriptor, Staleness } from "./types";

export const nowIso = (): string => new Date().toISOString();

/* ── timezone-correct wall-time → UTC ─────────────────────────── */

function tzOffsetMs(atUtc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(atUtc)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - atUtc.getTime();
}

/**
 * Convert a wall-clock time in a timezone to a UTC Date.
 * Correct across DST for times not inside the (2–3am) transition window —
 * market closes never are.
 */
export function zonedTimeToUtc(
  dateYMD: string, // "YYYY-MM-DD"
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const [y, m, d] = dateYMD.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`invalid date "${dateYMD}" (want YYYY-MM-DD)`);
  const naiveUtc = Date.UTC(y, m - 1, d, hour, minute, 0);
  const offset = tzOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset);
}

/* ── market close conventions ─────────────────────────────────── */

export interface MarketCloseSpec {
  timeZone: string;
  hour: number;
  minute: number;
}

/** Close conventions per benchmark's reference market. */
export const MARKET_CLOSE: Record<string, MarketCloseSpec> = {
  // NYMEX energy settlement window ends 14:30 ET
  WTI: { timeZone: "America/New_York", hour: 14, minute: 30 },
  // ICE Brent / European spot assessment, 16:30 London
  BRENT: { timeZone: "Europe/London", hour: 16, minute: 30 },
};

/** The UTC instant a settlement price for `periodDate` became true. */
export function marketCloseUtc(benchmark: string, periodDate: string): Date {
  const spec = MARKET_CLOSE[benchmark];
  if (!spec) throw new Error(`no market-close convention for benchmark "${benchmark}"`);
  return zonedTimeToUtc(periodDate, spec.hour, spec.minute, spec.timeZone);
}

/* ── business-day math (weekends only; holidays are absorbed by
      the staleness tier widths — see docs/RULES.md §1) ──────────── */

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** Whole business days (UTC calendar) strictly between from → to. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (!isWeekend(cur)) count++;
  }
  return count;
}

/* ── staleness classification ─────────────────────────────────── */

/** Tier multipliers over the allowed age. See docs/RULES.md §1. */
export const STALENESS_TIERS = { fresh: 1, aging: 2, stale: 5 } as const;

/**
 * Classify how old a record is, relative to what its source promises.
 *
 * Live/delayed sources: age measured in wall-clock ms vs expectedCadenceMs
 * (weekends widen tolerance ×3 — markets are closed, data SHOULD be old).
 *
 * Settlement sources: age measured in business days between the record's
 * periodDate and today, vs the source's allowed publication lag.
 */
export function classifyStaleness(
  record: { kind: PriceKind; observedAt: string; periodDate?: string },
  source: Pick<SourceDescriptor, "expectedCadenceMs" | "publicationLagBusinessDays">,
  now: Date = new Date(),
): Staleness {
  if (record.kind === "settlement" || record.kind === "historical") {
    const period = record.periodDate
      ? new Date(`${record.periodDate}T00:00:00Z`)
      : new Date(record.observedAt);
    const lag = businessDaysBetween(period, now);
    const allowed = Math.max(1, source.publicationLagBusinessDays);
    if (lag <= allowed * STALENESS_TIERS.fresh) return "fresh";
    if (lag <= allowed * STALENESS_TIERS.aging) return "aging";
    if (lag <= allowed * STALENESS_TIERS.stale) return "stale";
    return "dead";
  }

  const ageMs = now.getTime() - new Date(record.observedAt).getTime();
  const weekendFactor = isWeekend(now) ? 3 : 1;
  const allowedMs = source.expectedCadenceMs * weekendFactor;
  if (ageMs <= allowedMs * STALENESS_TIERS.fresh) return "fresh";
  if (ageMs <= allowedMs * STALENESS_TIERS.aging) return "aging";
  if (ageMs <= allowedMs * STALENESS_TIERS.stale) return "stale";
  return "dead";
}

/** Usable = allowed to appear as "the price" in resolution. */
export function isUsable(s: Staleness): boolean {
  return s === "fresh" || s === "aging" || s === "stale";
}

/** Alert-grade = allowed to trigger threshold alerts (stricter). */
export function isAlertGrade(s: Staleness): boolean {
  return s === "fresh" || s === "aging";
}

/**
 * ISO-8601 week number (1..53) of a YYYY-MM-DD calendar date, computed
 * in UTC. Backs the week-of-year seasonal baselines (the "5-year
 * seasonal range" in docs/scores-plan.md): a week is assigned to the
 * year containing its Thursday, per ISO 8601.
 */
export function isoWeekOf(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

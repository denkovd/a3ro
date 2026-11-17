/* ────────────────────────────────────────────────────────────────
   Gate history — week-on-week change and chart geometry from a gate's
   daily tanker-transit series. Pure and import-free so the rail, the
   globe labels, the detail chart and the tests share one answer.

   Everything here works on CALENDAR days. A day with no stored row is
   missing, not zero: windows with too few days report "insufficient",
   and holes in the series are returned as gaps to be drawn as gaps.
──────────────────────────────────────────────────────────────── */

export type DailyPoint = { date: string; value: number };

const DAY = 86_400_000;
const dayMs = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A 7-day window needs at least this many reported days to be compared. */
export const WEEK_MIN_DAYS = 5;
/** When both weeks average fewer tankers a day than this, a percent change is noise. */
export const LOW_COUNT_PER_DAY = 5;

/** Valid points, one per calendar day, ascending. */
export function cleanDaily(points: DailyPoint[]): DailyPoint[] {
  const byDay = new Map<string, number>();
  for (const p of points) {
    if (!p || typeof p.date !== "string" || !Number.isFinite(p.value) || !Number.isFinite(dayMs(p.date))) continue;
    byDay.set(p.date.slice(0, 10), p.value);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

export type WeekWindow = { from: string; to: string; days: number; mean: number | null };

/** Mean over the 7 calendar days ending on `end`; null when fewer than `minDays` are reported. */
export function weekWindow(points: DailyPoint[], end: string, minDays = WEEK_MIN_DAYS): WeekWindow {
  const to = dayMs(end), from = to - 6 * DAY;
  const inside = points.filter(p => { const t = dayMs(p.date); return t >= from && t <= to; });
  const mean = inside.length >= minDays ? inside.reduce((a, p) => a + p.value, 0) / inside.length : null;
  return { from: isoDay(from), to: isoDay(to), days: inside.length, mean };
}

export type WeeklyChange = {
  /** ok = percent is meaningful; low-counts = both weeks too small for a percent; insufficient = a week lacks data. */
  status: "ok" | "low-counts" | "insufficient";
  current: WeekWindow;
  prior: WeekWindow;
  /** (current − prior) ÷ prior × 100. Set only when status is "ok". */
  pct: number | null;
  /** current − prior, tankers a day. Set whenever both weeks have a mean. */
  delta: number | null;
};

/**
 * This week against the week before: the 7 calendar days ending on `end`
 * against the 7 before them. `end` is the period date of the gate's
 * current reading, so the change describes the same week the rail shows.
 */
export function weeklyChange(points: DailyPoint[], end: string): WeeklyChange {
  const clean = cleanDaily(points);
  const current = weekWindow(clean, end);
  const prior = weekWindow(clean, isoDay(dayMs(end) - 7 * DAY));
  if (current.mean === null || prior.mean === null) return { status: "insufficient", current, prior, pct: null, delta: null };
  const delta = current.mean - prior.mean;
  if ((current.mean < LOW_COUNT_PER_DAY && prior.mean < LOW_COUNT_PER_DAY) || prior.mean <= 0) {
    return { status: "low-counts", current, prior, pct: null, delta };
  }
  return { status: "ok", current, prior, pct: (delta / prior.mean) * 100, delta };
}

const signed = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

/** e.g. "+18% on last week" · "1.0/d vs 1.4/d last week — too few tankers for a % change" · "" */
export function weeklyChangeText(c: WeeklyChange | null): string {
  if (!c || c.status === "insufficient" || c.current.mean === null || c.prior.mean === null) return "";
  if (c.status === "low-counts") return `${c.current.mean.toFixed(1)}/d vs ${c.prior.mean.toFixed(1)}/d last week · too few tankers for a % change`;
  return `${signed(c.pct as number)}% on last week (${c.prior.mean.toFixed(1)}/d)`;
}

/** Compact form for globe labels, e.g. "WK +18%" · "WK 1.0 VS 1.4/D" · "" */
export function weeklyChangeShort(c: WeeklyChange | null): string {
  if (!c || c.status === "insufficient" || c.current.mean === null || c.prior.mean === null) return "";
  if (c.status === "low-counts") return `WK ${c.current.mean.toFixed(1)} VS ${c.prior.mean.toFixed(1)}/D`;
  return `WK ${signed(c.pct as number)}%`;
}

/** Trailing 7-calendar-day mean at each reported day that has enough days behind it. */
export function rollingMean(points: DailyPoint[], minDays = WEEK_MIN_DAYS): DailyPoint[] {
  const clean = cleanDaily(points);
  const out: DailyPoint[] = [];
  for (const p of clean) {
    const w = weekWindow(clean, p.date, minDays);
    if (w.mean !== null) out.push({ date: p.date, value: w.mean });
  }
  return out;
}

export type SeriesGap = { from: string; to: string; days: number };

/** Runs of missing calendar days between consecutive points, `minDays` or longer. */
export function seriesGaps(points: DailyPoint[], minDays = 4): SeriesGap[] {
  const clean = cleanDaily(points);
  const gaps: SeriesGap[] = [];
  for (let i = 1; i < clean.length; i++) {
    const missing = Math.round((dayMs(clean[i].date) - dayMs(clean[i - 1].date)) / DAY) - 1;
    if (missing >= minDays) gaps.push({ from: isoDay(dayMs(clean[i - 1].date) + DAY), to: isoDay(dayMs(clean[i].date) - DAY), days: missing });
  }
  return gaps;
}

/** Split a series into runs with no step longer than `maxStepDays`, so a line is never drawn across a hole. */
export function lineSegments(points: DailyPoint[], maxStepDays = 3): DailyPoint[][] {
  const segments: DailyPoint[][] = [];
  let run: DailyPoint[] = [];
  for (const p of points) {
    if (run.length > 0 && (dayMs(p.date) - dayMs(run[run.length - 1].date)) / DAY > maxStepDays) { segments.push(run); run = []; }
    run.push(p);
  }
  if (run.length > 0) segments.push(run);
  return segments;
}

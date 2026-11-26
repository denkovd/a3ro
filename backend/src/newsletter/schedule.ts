/* ────────────────────────────────────────────────────────────────
   Newsletter timing (roadmap #36): issues go out Monday 6pm Sydney.
   Vercel cron runs in UTC and Sydney moves between UTC+10 and +11,
   so two crons fire (07:xx and 08:xx UTC Monday) and each one sends
   only once it is 6pm or later on Monday in Sydney.
──────────────────────────────────────────────────────────────── */

export const SEND_HOUR_SYDNEY = 18;
const TZ = "Australia/Sydney";

/** Sydney calendar date (YYYY-MM-DD), weekday (0 = Sunday) and hour for an instant. */
export function sydneyParts(now: Date): { date: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, hour: Number(parts.hour) };
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The Monday an issue generated now is for: today when it is Monday in
 * Sydney before the send time, otherwise the next Monday.
 */
export function upcomingIssueDate(now: Date): string {
  const { date, weekday, hour } = sydneyParts(now);
  if (weekday === 1 && hour < SEND_HOUR_SYDNEY) return date;
  const days = (8 - weekday) % 7 || 7;
  return addDays(date, days);
}

/** True from Monday 6pm Sydney until the end of that Monday: the cron's send window. */
export function inSendWindow(now: Date): { open: boolean; issueDate: string } {
  const { date, weekday, hour } = sydneyParts(now);
  return { open: weekday === 1 && hour >= SEND_HOUR_SYDNEY, issueDate: date };
}

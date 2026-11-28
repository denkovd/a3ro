/* ────────────────────────────────────────────────────────────────
   "What's coming" for the weekly newsletter: the next 7 days from the
   send time. Open data calendars only: ABS release calendars (via the
   Australia Watch schedules) and the Fed/BLS dates in execute_events
   (FOMC decisions, US CPI). One line per release, Sydney time.
   Pure.
──────────────────────────────────────────────────────────────── */
import type { AustraliaReleaseSchedule } from "../australia/types";

export interface ComingEvent { at: string; label: string; region: "AU" | "US"; key: boolean }

const FAMILY_LABEL: Record<string, string> = {
  cpi: "Monthly CPI", labour: "Labour force", approvals: "Building approvals", dwelling_values: "Dwelling values",
  household_spending: "Household spending", import_prices: "Import prices", job_vacancies: "Job vacancies",
  lending: "Lending indicators", national_accounts: "GDP (national accounts)", ppi: "Producer prices", trade: "International trade", wpi: "Wage price index",
};
const KEY_FAMILIES = new Set(["cpi", "labour", "national_accounts", "wpi"]);

export interface ScheduleEntry { indicator: string; family: string; schedule: AustraliaReleaseSchedule | null | undefined }

export function comingEvents(
  schedules: ScheduleEntry[],
  usEvents: { kind: string; eventTime: string }[],
  from: Date, days = 7,
): ComingEvent[] {
  const to = from.getTime() + days * 86_400_000;
  const inWindow = (iso: string) => { const t = Date.parse(iso); return t > from.getTime() && t <= to; };
  const seen = new Map<string, ComingEvent>();
  for (const s of schedules) {
    const next = s.schedule?.nextPublication ?? s.schedule?.next;
    if (!next?.releaseAt || !inWindow(next.releaseAt) || s.family === "rba" || s.family === "oecd") continue;
    const k = `${s.family}|${next.releaseAt}`;
    if (!seen.has(k)) seen.set(k, { at: next.releaseAt, label: `🇦🇺 ${FAMILY_LABEL[s.family] ?? s.family} (${next.referencePeriod})`, region: "AU", key: KEY_FAMILIES.has(s.family) });
  }
  for (const e of usEvents) {
    if (!inWindow(e.eventTime)) continue;
    const label = e.kind === "FOMC" ? "🇺🇸 FOMC decision" : e.kind === "CPI" ? "🇺🇸 US CPI" : `🇺🇸 ${e.kind}`;
    seen.set(`US|${e.kind}|${e.eventTime}`, { at: e.eventTime, label, region: "US", key: true });
  }
  return [...seen.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function sydneyWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

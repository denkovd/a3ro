import type { AustraliaFrequency, AustraliaIndicator, AustraliaRelease, AustraliaReleaseSchedule } from "../australia/types";
import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, type AustraliaReleaseFamily } from "../australia/registry";

export const ABS_RELEASE_PAGES: Record<AustraliaReleaseFamily, string> = {
  cpi: "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/latest-release",
  labour: "https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia/latest-release",
};
const MONTHS = "January February March April May June July August September October November December".split(" ");

function monthlyPeriod(text: string): string {
  const match = text.match(new RegExp(`\\b(${MONTHS.join("|")}) (\\d{4})\\b`));
  if (!match) throw new Error("ABS release reference period unavailable");
  return `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}`;
}

/** ABS releases at 11:30 Canberra/Sydney time, including daylight saving. */
function releaseInstant(date: string): string {
  const [day, month, year] = date.split("/").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 11, 30));
  if (base.getUTCFullYear() !== year || base.getUTCMonth() !== month - 1 || base.getUTCDate() !== day) throw new Error("Invalid ABS release date");
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(base));
  return new Date(base.getTime() - (hour - 11) * 3_600_000).toISOString();
}

function quarter(period: string): string {
  const year = Number(period.slice(0, 4));
  const q = Math.floor(Number(period.slice(5)) / 3);
  return q ? `${year}-Q${q}` : `${year - 1}-Q4`;
}

export function parseAbsReleasePage(html: string, frequency: AustraliaFrequency, sourceUrl: string, now = new Date()): AustraliaReleaseSchedule {
  const reference = html.match(/Reference period<\/div>\s*<div[^>]*>([^<]+)<\/div>/i)?.[1];
  const date = html.match(/Release date and time<\/div>\s*<div[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  if (!reference || !date) throw new Error("ABS latest release metadata unavailable");
  const period = monthlyPeriod(reference);
  const list = html.match(/<ul[^>]*class="[^"]*future-releases-list[^\"]*"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "";
  const upcoming: AustraliaRelease[] = Array.from(list.matchAll(/Next Release\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*<br\s*\/?>\s*<span[^>]*>([^<]+)<\/span>/gi), (m) => ({ referencePeriod: monthlyPeriod(m[2]), releaseAt: releaseInstant(m[1]) }))
    .filter(r => r.releaseAt > now.toISOString()).sort((a, b) => a.releaseAt.localeCompare(b.releaseAt));
  const next = upcoming.find(r => frequency === "monthly" || Number(r.referencePeriod.slice(5)) % 3 === 0) ?? null;
  return {
    sourceUrl, verifiedAt: now.toISOString(), health: "healthy",
    latestReferencePeriod: frequency === "quarterly" ? quarter(period) : period,
    // Quarterly tables are updated only with March/June/September/December CPI.
    // During other months the page's publication date does not date those tables.
    latest: frequency === "quarterly" && Number(period.slice(5)) % 3 !== 0 ? null
      : { referencePeriod: frequency === "quarterly" ? quarter(period) : period, releaseAt: releaseInstant(date) },
    next: next ? { ...next, referencePeriod: frequency === "quarterly" ? quarter(next.referencePeriod) : next.referencePeriod } : null,
    nextPublication: upcoming[0] ?? null,
  };
}

const unavailable = (sourceUrl: string): AustraliaReleaseSchedule => ({ sourceUrl, verifiedAt: null, latestReferencePeriod: null, latest: null, next: null, nextPublication: null, health: "unavailable" });

/**
 * One request per ABS release page (family), parsed once per frequency used by that family's
 * indicators. Series in the same family and frequency share one schedule object.
 */
export async function fetchAustraliaReleaseSchedules(opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<Record<AustraliaIndicator, AustraliaReleaseSchedule>> {
  const now = opts.now ?? new Date();
  const families = [...new Set(AUSTRALIA_INDICATORS.map((i) => AUSTRALIA_REGISTRY[i].releaseFamily))];
  const pages = new Map<AustraliaReleaseFamily, string | null>(await Promise.all(families.map(async (family): Promise<[AustraliaReleaseFamily, string | null]> => {
    try {
      const requestOptions = {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store" as const,
      };
      const response = await (opts.fetchImpl ?? fetch)(ABS_RELEASE_PAGES[family], requestOptions);
      if (!response.ok) throw new Error(`ABS HTTP ${response.status}`);
      return [family, await response.text()];
    } catch {
      return [family, null];
    }
  })));
  const parsed = new Map<string, AustraliaReleaseSchedule>();
  const scheduleFor = (family: AustraliaReleaseFamily, frequency: AustraliaFrequency): AustraliaReleaseSchedule => {
    const cacheKey = `${family}:${frequency}`;
    const cached = parsed.get(cacheKey);
    if (cached) return cached;
    const html = pages.get(family);
    let schedule: AustraliaReleaseSchedule;
    try { schedule = html == null ? unavailable(ABS_RELEASE_PAGES[family]) : parseAbsReleasePage(html, frequency, ABS_RELEASE_PAGES[family], now); }
    catch { schedule = unavailable(ABS_RELEASE_PAGES[family]); }
    parsed.set(cacheKey, schedule);
    return schedule;
  };
  return Object.fromEntries(AUSTRALIA_INDICATORS.map((i) => [i, scheduleFor(AUSTRALIA_REGISTRY[i].releaseFamily, AUSTRALIA_REGISTRY[i].frequency)])) as Record<AustraliaIndicator, AustraliaReleaseSchedule>;
}

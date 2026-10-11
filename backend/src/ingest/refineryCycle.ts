import { REFINERIES } from "../../../lib/oil/refineries";
import type { Queryable } from "../storage/db";
import { upsertRefineryEvents, recordRefineryCheck, type StoredRefineryEvent } from "../storage/refineryRepo";
import { extractOfficialEvent, officialArticleLinks, type SourceRule } from "../refineries/sourceRules";

const CHECKS: SourceRule[] = REFINERIES.flatMap(r => r.events.map(e => ({
  id: e.id ?? `${r.id}:${e.kind}:${e.date}`, refineryId: r.id, url: e.sourceUrl, event: e,
  required: r.id === "grangemouth" ? [/April 2025/i, /operations ceased/i]
    : r.id === "benicia" ? [/full idling/i, /April 2026/i]
    : r.id === "los-angeles-p66" ? [/Ceased fuel production/i, /Los Angeles Refinery/i]
    : e.kind === "disruption" ? [/09 Mar 2026/i, /Force Majeure/i, /attack on its Refinery complex/i]
    : [/07 Oct 2026/i, /normalization of operations/i],
})));

async function fetchPage(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "A3RO refinery evidence monitor", "Accept": "text/html" }, redirect: "manual" });
      if (res.status >= 300 && res.status < 400) throw new Error("Official source redirected to a verification page; evidence retained without renewal");
      if (!res.ok) throw new Error(`Official source HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > 3_000_000) throw new Error("Official source payload too large");
      return text;
    } catch (error) {
      if (error instanceof Error && /verification page|HTTP 4\d\d|payload too large/.test(error.message)) throw error;
      if (attempt === 1) throw error;
    }
  }
  throw new Error("Official source unavailable");
}

export async function runRefineryCycle(db: Queryable, opts: { fetchPage?: (url: string) => Promise<string>; now?: () => Date } = {}) {
  const get = opts.fetchPage ?? fetchPage;
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const report: { startedAt: string; polled: { sourceId: string; ok: boolean; records: number; error?: string }[] } = { startedAt: now, polled: [] };
  for (const rule of CHECKS) {
    try {
      const event = extractOfficialEvent(rule, await get(rule.url), now);
      const records = await upsertRefineryEvents(db, [event]);
      await recordRefineryCheck(db, rule.id, true, null, now);
      report.polled.push({ sourceId: rule.id, ok: true, records });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0,180) : "Official source unavailable";
      await recordRefineryCheck(db, rule.id, false, message, now);
      report.polled.push({ sourceId: rule.id, ok: false, records: 0, error: message });
    }
  }
  // Discover official updates without converting headlines into operating-status claims.
  const index = "https://www.bapcoenergies.com/media-centre/press-releases";
  try {
    const discovered = officialArticleLinks(await get(index), index);
    if (!discovered.length) throw new Error("Official source index has no recognizable refinery update links");
    const links = discovered.filter(link => !CHECKS.some(rule => rule.url === link.url));
    const results = await Promise.allSettled(links.map(async link => {
      const html = await get(link.url);
      const text = html.replace(/<[^>]*>/g," ").replace(/\s+/g," ");
      const m = text.match(/Bapco Energies\s+(\d{2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})/i);
      if (!m) return null;
      const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[2].toLowerCase()) + 1;
      const date = `${m[3]}-${String(month).padStart(2,"0")}-${m[1]}`;
      if (Date.parse(date) > Date.parse(now)) return null;
      return { id: `bapco-notice:${new URL(link.url).pathname}`, refineryId: "bapco", incidentId: new URL(link.url).pathname, date, publishedAt: `${date}T00:00:00Z`, verifiedAt: now, scope: "group", kind: "notice", confidence: "operator", title: link.title, detail: "Official operator update. Read the source for scope; this notice does not establish facility throughput or unavailable capacity.", sourceUrl: link.url } satisfies StoredRefineryEvent;
    }));
    const notices = results.flatMap(r => r.status === "fulfilled" && r.value ? [r.value] : []);
    const records = await upsertRefineryEvents(db, notices);
    if (results.some(r => r.status === "rejected")) throw new Error("Some discovered official articles could not be checked");
    await recordRefineryCheck(db, "bapco-updates", true, null, now);
    report.polled.push({ sourceId: "bapco-updates", ok: true, records });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0,180) : "Official update discovery unavailable";
    await recordRefineryCheck(db, "bapco-updates", false, message, now);
    report.polled.push({ sourceId: "bapco-updates", ok: false, records: 0, error: message });
  }
  return report;
}

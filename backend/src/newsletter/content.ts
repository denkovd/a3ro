/* ────────────────────────────────────────────────────────────────
   Weekly newsletter issue (roadmap #36, v2). Two editions:

     free     open data only (#18): big news, macro weather (US and
              Australia), commodity brief and red flags, Execute dates
              when an event is due, what's coming, A3RO updates
     premium  everything in free, plus market-data sections (Yahoo):
              What's flipped (Trend Finder, Double Confirmed) led by the
              week's pattern, the YTD leaderboard, Execute leans

   gatherIssueData reads the database (and syncs auto red flags);
   renderIssue is pure (tested) and leaves an {{UNSUBSCRIBE_URL}}
   placeholder that each send fills per recipient.
──────────────────────────────────────────────────────────────── */
import { computePulse } from "../australia/pulse";
import { AUSTRALIA_REGISTRY, isAustraliaIndicator } from "../australia/registry";
import type { AustraliaReleaseSchedule } from "../australia/types";
import { buildExecuteNewsletter } from "../execute/format";
import { computeMacroWeather } from "../macro/weather";
import { getLatestBullSnapshots, getRecentTransitions } from "../storage/bullRepo";
import type { Queryable } from "../storage/db";
import { getAustraliaObservations } from "../storage/australiaWatchRepo";
import { getExecuteRecord, listExecuteEvents, listExecuteUpcoming } from "../storage/executeRepo";
import { getLatestMacroSnapshot } from "../storage/macroRepo";
import { activeRedFlags, getSetting, syncAutoRedFlags } from "../storage/newsletterRepo";
import { computeAustraliaWeather, pulseQuadrant, QUADRANT_LABEL, twiChange, type AuWeather, type Quadrant } from "./auWeather";
import { comingEvents, sydneyWhen, type ComingEvent, type ScheduleEntry } from "./coming";
import { autoRedFlags, commodityBrief, median, type BriefItem, type ChokepointRead, type CopperStocksRead, type ExportRead } from "./commodity";
import { SLOT_LABEL, type Editorial, type EditorialSlot } from "./editorial";
import { BENCHMARK, buildFlipRows, classLabel, flipPattern, statusLabel, trackRecord, type FlipRow, type FlipsSection, type SnapshotLite, type TrackRecord } from "./flips";
import { buildLeaderboard, CORE_10, type BoardRow, type Leaderboard, type UniverseAsset } from "./leaderboard";
import { firstBarDates, loadCloses, loadRolls, minusDays } from "./marketData";

export const UNSUBSCRIBE_PLACEHOLDER = "{{UNSUBSCRIBE_URL}}";
export type Edition = "free" | "premium";

export interface Consensus { quadrant: Quadrant; source: string; asOf: string; note?: string }

export interface IssueData {
  issueDate: string;
  generatedAt: string;
  pulse: {
    label: string;
    growth: { state: string | null; up: number; down: number };
    inflation: { state: string | null; up: number; down: number };
    moved: { label: string; period: string; zChange: number }[];
  } | null;
  macro: {
    quadrant: string;
    headline: string;
    weather: { emoji: string; label: string; reasons: string[] };
    liquidity: string | null;
    runDate: string;
    marketRegime?: string | null;
    marketShare?: number | null;
    riskOn?: number | null;
    consensus?: Consensus | null;
  } | null;
  au?: { weather: AuWeather; economy: Quadrant | null; consensus: Consensus | null; twi: { pct: number; from: string; to: string } | null } | null;
  oil: {
    chokepoints: { name: string; last7: number; prior7: number; changePct: number; through: string }[];
    crudeStocks: { value: number; change: number | null; date: string } | null;
    wti: { value: number; change: number | null; date: string } | null;
  } | null;
  commodity?: { brief: BriefItem[]; redFlags: { commodity: string; title: string; detail: string; since: string }[]; exportPeriods: Record<string, string> } | null;
  coming?: ComingEvent[];
  execute?: { free: string; premium: string } | null;
  sinceLast?: SinceLast | null;
  premium?: { flips: FlipsSection | null; leaderboard: Leaderboard | null } | null;
  editorial?: Editorial;
}

/** Inputs the admin route fetches outside the database (lib/ readers, release calendars). */
export interface IssueExtras {
  copperStocks?: CopperStocksRead | null;
  exports?: ExportRead[];
  schedules?: ScheduleEntry[];
  previousExportPeriods?: Record<string, string>;
  /** Weather in the previous issue, for the "since last issue" line. */
  previousWeather?: SinceLast | null;
}

export interface SinceLast { issueDate: string; us: { emoji: string; label: string } | null; au: { emoji: string; label: string } | null }

/** The previous issue's weather, read from its stored data. */
export function previousWeather(prev: { issueDate: string; data?: unknown } | undefined | null): SinceLast | null {
  const d = prev?.data as Partial<IssueData> | undefined;
  if (!prev || !d) return null;
  const pick = (w?: { emoji: string; label: string } | null) => (w ? { emoji: w.emoji, label: w.label } : null);
  return { issueDate: prev.issueDate, us: pick(d.macro?.weather), au: pick(d.au?.weather) };
}



const CHOKEPOINTS: { id: string; name: string }[] = [
  { id: "hormuz", name: "Strait of Hormuz" },
  { id: "bab_el_mandeb", name: "Bab el-Mandeb" },
  { id: "suez", name: "Suez Canal" },
  { id: "cape", name: "Cape of Good Hope" },
  { id: "singapore", name: "Singapore Strait" },
  { id: "panama", name: "Panama Canal" },
];

const dateStr = (v: unknown) => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
  : String(v).slice(0, 10));

/** Average of the latest 7 daily values against the 7 before them. Values are newest first. */
export function weekOnWeek(newestFirst: number[]): { last7: number; prior7: number; changePct: number } | null {
  if (newestFirst.length < 14) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const last7 = avg(newestFirst.slice(0, 7)), prior7 = avg(newestFirst.slice(7, 14));
  if (!(prior7 > 0)) return null;
  return { last7, prior7, changePct: (last7 / prior7 - 1) * 100 };
}

/** The instant an issue goes out: Monday 6pm Sydney on its issue date (07:00 or 08:00 UTC). */
export function sendInstant(issueDate: string): Date {
  for (const h of [7, 8]) {
    const d = new Date(`${issueDate}T0${h}:00:00Z`);
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", hourCycle: "h23" }).format(d));
    if (hour === 18) return d;
  }
  return new Date(`${issueDate}T07:00:00Z`);
}

async function gatherOil(db: Queryable): Promise<{ oil: IssueData["oil"]; chokepoints: ChokepointRead[] }> {
  const res = await db.query(
    `select corridor, metric, period_date, value from (
       select corridor, metric, period_date, value,
              row_number() over (partition by corridor, metric order by period_date desc) as rn
         from corridor_metrics
        where (metric = 'tanker_transits' and corridor = any($1)) or (corridor = 'usgulf' and metric in ('us_crude_stocks', 'wti_spot'))
     ) x where rn <= 380 order by corridor, metric, period_date desc`,
    [CHOKEPOINTS.map((c) => c.id)],
  );
  const series = new Map<string, { date: string; value: number }[]>();
  for (const r of res.rows) {
    const k = `${r.corridor}|${r.metric}`;
    const list = series.get(k) ?? [];
    list.push({ date: dateStr(r.period_date), value: Number(r.value) });
    series.set(k, list);
  }
  const chokepoints: ChokepointRead[] = CHOKEPOINTS.flatMap((c) => {
    const s = series.get(`${c.id}|tanker_transits`) ?? [];
    const w = weekOnWeek(s.slice(0, 14).map((p) => p.value));
    if (!w) return [];
    const year = s.slice(7, 372).map((p) => p.value);
    return [{ id: c.id, name: c.name, ...w, through: s[0].date, normal: year.length >= 90 ? median(year) : null }];
  });
  const latestPair = (key: string, back: number) => {
    const s = series.get(key) ?? [];
    if (!s.length) return null;
    const prev = s[back];
    return { value: s[0].value, change: prev ? s[0].value - prev.value : null, date: s[0].date };
  };
  const crudeStocks = latestPair("usgulf|us_crude_stocks", 1); // weekly series: change on the week
  const wti = latestPair("usgulf|wti_spot", 5); // daily trading series: change over five sessions
  const oil = !chokepoints.length && !crudeStocks && !wti ? null
    : { chokepoints: chokepoints.map(({ name, last7, prior7, changePct, through }) => ({ name, last7, prior7, changePct, through })), crudeStocks, wti };
  return { oil, chokepoints };
}

async function gatherPremium(db: Queryable): Promise<IssueData["premium"]> {
  const [snapshots, transitions] = await Promise.all([getLatestBullSnapshots(db), getRecentTransitions(db, 90)]);
  if (!snapshots.length) return null;
  const snap = new Map<string, SnapshotLite & { alignedSince: string | null; adjusted: boolean }>();
  for (const s of snapshots) if (!snap.has(s.symbol)) snap.set(s.symbol, { symbol: s.symbol, displayName: s.displayName, tier: s.tier, assetClass: s.assetClass, verdict: s.verdict, alignedSince: s.alignedSince, adjusted: s.adjusted });
  const asOf = snapshots.map((s) => s.lastCloseDate).filter((d): d is string => !!d).sort().pop() ?? null;
  const runDate = snapshots[0].runDate;
  const since = `${Number((asOf ?? runDate).slice(0, 4)) - 1}-12-20`;
  const adjustedSymbols = [...snap.values()].filter((s) => s.adjusted).map((s) => s.symbol);
  const [closes, firsts, rolls] = await Promise.all([loadCloses(db, null, minusDays(since, 100)), firstBarDates(db), loadRolls(db, adjustedSymbols)]);

  const newSince = minusDays(runDate, 6);
  const flips: FlipsSection = {
    pattern: flipPattern(transitions, snap, runDate),
    bullish: buildFlipRows(transitions, "BULLISH", snap, closes, rolls, { newSince }),
    bearish: buildFlipRows(transitions, "BEARISH", snap, closes, rolls, { newSince }),
    asOf,
  };
  const all = [...buildFlipRows(transitions, "BULLISH", snap, closes, rolls, { newSince, size: 500 }), ...buildFlipRows(transitions, "BEARISH", snap, closes, rolls, { newSince, size: 500 })];
  flips.track = trackRecord(all, runDate, asOf);
  const universe: UniverseAsset[] = [...snap.values()].map((s) => ({
    symbol: s.symbol, name: s.displayName, verdict: s.verdict, alignedSince: s.alignedSince, assetClass: s.assetClass,
    firstBar: firsts.get(s.symbol) ?? null, closes: closes.get(s.symbol) ?? [], rolls: rolls.get(s.symbol),
  }));
  const leaderboard = asOf ? buildLeaderboard(universe, asOf) : null;
  return { flips, leaderboard };
}

export async function gatherIssueData(db: Queryable, issueDate: string, now = new Date(), extras: IssueExtras = {}): Promise<IssueData> {
  const sendAt = sendInstant(issueDate);
  const [obs, macro, oilRead, usConsensus, auConsensus, premium, usEvents, upcoming, paper] = await Promise.all([
    getAustraliaObservations(db).catch(() => null),
    getLatestMacroSnapshot(db).catch(() => null),
    gatherOil(db).catch(() => ({ oil: null, chokepoints: [] as ChokepointRead[] })),
    getSetting<Consensus>(db, "us_consensus").catch(() => null),
    getSetting<Consensus>(db, "au_consensus").catch(() => null),
    gatherPremium(db).catch(() => null),
    listExecuteEvents(db, sendAt, 8).catch(() => []),
    listExecuteUpcoming(db, sendAt).catch(() => []),
    getExecuteRecord(db, "paper").catch(() => ({ stats: null, trades: [] })),
  ]);

  let pulse: IssueData["pulse"] = null;
  let au: IssueData["au"] = null;
  if (obs) {
    const p = computePulse(obs, { now, leads: false });
    pulse = {
      label: p.quadrant.label,
      growth: { state: p.quadrant.growth, up: p.growth.up, down: p.growth.down },
      inflation: { state: p.quadrant.inflation, up: p.inflation.up, down: p.inflation.down },
      moved: p.moved.slice(0, 3).map((m) => ({
        label: isAustraliaIndicator(m.indicator) ? AUSTRALIA_REGISTRY[m.indicator].label : m.indicator,
        period: m.period, zChange: m.zChange,
      })),
    };
    const economy = pulseQuadrant(p.quadrant.growth, p.quadrant.inflation);
    const twi = twiChange(obs.filter((o) => o.indicator === "aud_twi").map((o) => ({ period: o.referencePeriod, value: o.value })));
    au = { weather: computeAustraliaWeather({ economy, consensus: auConsensus?.quadrant ?? null, twi }), economy, consensus: auConsensus, twi };
  }

  let macroOut: IssueData["macro"] = null;
  if (macro && macro.quadrant !== "PENDING") {
    const w = computeMacroWeather({
      economicRegime: macro.quadrant, marketRegime: macro.marketRegime, riskOnShare: macro.marketRiskOn,
      liquidityScore: macro.liquidityScore, liquidityLegs: macro.liquidityLegs,
    });
    const shares = (macro.marketShares ?? {}) as Record<string, number>;
    macroOut = {
      quadrant: macro.quadrant, headline: macro.regimeHeadline, runDate: macro.runDate,
      weather: { emoji: w.emoji, label: w.label, reasons: w.reasons.slice(0, 3) },
      liquidity: macro.liquidityHeadline || null,
      marketRegime: macro.marketRegime ?? null,
      marketShare: macro.marketRegime ? shares[macro.marketRegime] ?? null : null,
      riskOn: macro.marketRiskOn ?? null,
      consensus: usConsensus,
    };
  }

  // Commodity brief and red flags (auto flags follow the data; manual ones are kept).
  const exportsRead = extras.exports ?? [];
  const brief = commodityBrief({
    chokepoints: oilRead.chokepoints, crudeStocks: oilRead.oil?.crudeStocks ?? null, wti: oilRead.oil?.wti ?? null,
    copperStocks: extras.copperStocks ?? null, exports: exportsRead, previousExportPeriods: extras.previousExportPeriods ?? {},
  });
  await syncAutoRedFlags(db, autoRedFlags(oilRead.chokepoints)).catch(() => undefined);
  const redFlags = await activeRedFlags(db).catch(() => []);
  const commodity = { brief, redFlags: redFlags.map((f) => ({ commodity: f.commodity, title: f.title, detail: f.detail, since: f.since })),
    exportPeriods: Object.fromEntries(exportsRead.map((e) => [e.id, e.latestPeriod])) };

  const block = buildExecuteNewsletter(upcoming, paper.trades, sendAt);
  const coming = comingEvents(extras.schedules ?? [], usEvents.map((e) => ({ kind: e.kind, eventTime: e.eventTime })), sendAt);

  return { issueDate, generatedAt: now.toISOString(), pulse, macro: macroOut, au, oil: oilRead.oil, commodity, coming, execute: block, premium, sinceLast: extras.previousWeather ?? null };
}

/** Plain-text summary of an issue's data for the editorial draft (what Claude may tie the news to). */
export function editorialContext(d: IssueData): string {
  const lines: string[] = [];
  if (d.macro) lines.push(`US weather: ${d.macro.weather.label}. Economy ${d.macro.quadrant}; market ${d.macro.marketRegime ?? "?"}; consensus ${d.macro.consensus?.quadrant ?? "?"}. ${d.macro.weather.reasons.join(" ")}`);
  if (d.au) lines.push(`Australia weather: ${d.au.weather.label}. ${d.au.weather.reasons.join(" ")}`);
  if (d.pulse) lines.push(`Australia Pulse: ${d.pulse.label}.`);
  const fl = d.premium?.flips;
  if (fl) {
    lines.push(`Trend Finder flips (Double Confirmed), ${fl.pattern.fromDate} to ${fl.pattern.toDate}: ${fl.pattern.summary}`);
    lines.push(`By asset class: ${fl.pattern.byClass.map((c) => `${classLabel(c.assetClass)} ${c.bullish} up / ${c.bearish} down`).join("; ") || "none"}.`);
    if (fl.pattern.bullishNames.length) lines.push(`Flipped bullish: ${fl.pattern.bullishNames.slice(0, 25).join(", ")}.`);
    if (fl.pattern.bearishNames.length) lines.push(`Flipped bearish: ${fl.pattern.bearishNames.slice(0, 25).join(", ")}.`);
  }
  for (const b of d.commodity?.brief ?? []) lines.push(`Commodity: ${b.commodity}: ${b.text}`);
  for (const f of d.commodity?.redFlags ?? []) lines.push(`Red flag: ${f.commodity}: ${f.title}.`);
  for (const e of d.coming ?? []) lines.push(`Coming: ${e.label} at ${e.at}.`);
  return lines.join("\n") || "(no data)";
}

/** Everything a Claude chat needs to draft the editorial by hand: the issue's data and the reply format the Admin form takes. */
export function editorialBrief(d: IssueData): string {
  return [
    `A3RO weekly newsletter — editorial brief for the issue of ${d.issueDate} (sent Monday 6pm Sydney; covers the 7 days before).`,
    "",
    "Please draft the five editorial pieces. Search the web for the week's news and next week's earnings; use only numbers from your searches or the data below; paraphrase, no quotes; general information only, not advice.",
    "",
    "THIS WEEK'S A3RO DATA",
    editorialContext(d),
    "",
    "REPLY FORMAT (one block per Admin box)",
    "1. This week in one line — one sentence, at most 30 words.",
    "2. Big news this week — headline; 2–3 sentence story; one 'why it matters' sentence tied to the A3RO data; up to 3 one-sentence briefs.",
    d.premium?.flips ? "3. Pattern of the week (Premium) — 2–3 sentences on what the flips above say together." : "3. Pattern of the week — not needed this week (no Premium data).",
    "4. Earnings next week — one line per reporting day in the 7 days after the send, Sydney date first, e.g. 'Thu 4 Dec · US after close: Salesforce (CRM), CrowdStrike (CRWD)'; large US and ASX 200 names; confirmed dates only; at most 7 lines.",
    "5. A3RO updates — Shipped (≤4), Fixed (≤3), Next (≤2), from the commits at github.com/denkovd/a3ro over the last 7 days; what a user would notice, ≤20 words each.",
  ].join("\n");
}

/* ── rendering ─────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sign = (n: number, dp = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}`;
const pctCell = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${sign(n, dp)}%`);
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");
const price = (n: number | null) => (n == null ? "—" : n >= 1000 ? n.toLocaleString("en-AU", { maximumFractionDigits: 0 }) : n >= 10 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toPrecision(3));
const QUADRANT_WORDS: Record<string, string> = {
  GOLDILOCKS: "Goldilocks (growth up, inflation down)", REFLATION: "Reflation (growth up, inflation up)",
  INFLATION: "Stagflation risk (growth down, inflation up)", DEFLATION: "Slowdown (growth down, inflation down)",
};
const qLabel = (q: string | null | undefined) => (q ? QUADRANT_LABEL[q as Quadrant] ?? q : "—");
const axisWords = (state: string | null, up: number, down: number, upWord: string, downWord: string) =>
  state === null ? "not enough current readings" : `${state === "up" ? upWord : state === "down" ? downWord : "mixed"} (${up} up, ${down} down)`;

export const GENERAL_ADVICE_WARNING =
  "General information only. A3RO does not know your objectives, financial situation or needs, and nothing here is a recommendation to buy or sell anything. Signals and regime readings come from mechanical models that can be wrong; past performance is not a reliable indicator of future performance. Consider whether it suits you and seek independent advice before acting.";

export interface RenderedIssue { subject: string; html: string; text: string }

type Table = { head: string[]; rows: string[][] };
type QuadMarks = { economy?: string | null; market?: string | null; consensus?: string | null };
type Part = { kind: "quadrant"; label: string; marks: QuadMarks } | { kind: "bars"; title: string; rows: { label: string; bullish: number; bearish: number }[] } | { kind: "ph"; text: string } | { kind: "p"; text: string; strong?: boolean } | { kind: "box"; title: string; lines: string[] } | { kind: "table"; table: Table } | { kind: "h3"; text: string } | { kind: "list"; items: string[] };
interface Section { title: string; parts: Part[]; link?: { href: string; text: string } }

const flipTable = (rows: FlipRow[]): Table => ({
  head: ["Asset", "Flip date", "Price at flip", "Days", "% since", "vs S&P 500", "Status"],
  rows: rows.map((r) => [
    `${r.name}${r.isNew ? " · new" : ""}`, shortDate(r.flipDate), price(r.priceAtFlip), r.days == null ? "—" : String(r.days),
    pctCell(r.sincePct), r.vsBenchmark == null ? "—" : `${sign(r.vsBenchmark)} pts`, statusLabel(r.status),
  ]),
});

const boardTable = (rows: BoardRow[], withType: boolean): Table => ({
  head: ["#", "Asset", ...(withType ? ["Type"] : []), "Price", "1D", "1W", "YTD", "13 weeks", "Trend Finder", "Flip date", "% since flip"],
  rows: rows.map((r) => [
    String(r.rank ?? "—"), r.label, ...(withType ? [r.type] : []), price(r.price), pctCell(r.d1), pctCell(r.w1), pctCell(r.ytd), r.spark ?? "—",
    r.status ? statusLabel(r.status) : r.note ? "Not in universe yet" : "—", shortDate(r.flipDate), pctCell(r.sinceFlip),
  ]),
});

/** Marks an editorial slot still to be written. Shows in the Admin preview; an issue can't be approved while one remains. */
export const PLACEHOLDER_MARK = "✍️ Claude to comment here";
const ph = (what: string): Part => ({ kind: "ph", text: `${PLACEHOLDER_MARK}: ${what}` });

/** Editorial slots that would show a placeholder in this issue (Premium-only slots only when there is a Premium edition). */
export function missingEditorial(data: IssueData): EditorialSlot[] {
  const ed = data.editorial ?? {};
  const skip = new Set(ed.skip ?? []);
  const out: EditorialSlot[] = [];
  if (!skip.has("summary") && !ed.summary) out.push("summary");
  if (!skip.has("bigNews") && !ed.bigNews?.headline) out.push("bigNews");
  if (!skip.has("pattern") && data.premium?.flips && !ed.pattern) out.push("pattern");
  if (!skip.has("earnings") && !(ed.earnings ?? []).length) out.push("earnings");
  const up = ed.updates;
  if (!skip.has("updates") && !(up && (up.shipped.length || up.fixed.length || up.next.length))) out.push("updates");
  return out;
}
export const missingLabels = (data: IssueData) => missingEditorial(data).map((s) => SLOT_LABEL[s]);

/* ── email-safe charts: plain tables with inline styles (no SVG, no images), so Gmail and Outlook show them ── */

const QUAD_GRID: { q: string; growth: string; infl: string; bg: string; ink: string }[][] = [
  [{ q: "REFLATION", growth: "Growth ↑", infl: "Inflation ↑", bg: "#fdf1dc", ink: "#8a5300" }, { q: "GOLDILOCKS", growth: "Growth ↑", infl: "Inflation ↓", bg: "#e3f3ea", ink: "#0b6e4f" }],
  [{ q: "INFLATION", growth: "Growth ↓", infl: "Inflation ↑", bg: "#fbe5e3", ink: "#a3261b" }, { q: "DEFLATION", growth: "Growth ↓", infl: "Inflation ↓", bg: "#e4ebf5", ink: "#23466e" }],
];
const MARK: Record<keyof QuadMarks, { label: string; style: string }> = {
  economy: { label: "Economy", style: "background:#111;color:#fff" },
  market: { label: "Market", style: "background:#fff;color:#111;border:1px solid #111" },
  consensus: { label: "Consensus", style: "background:#fff;color:#555;border:1px dashed #777" },
};

function quadrantHtml(label: string, marks: QuadMarks): string {
  const chip = (k: keyof QuadMarks) => `<span style="display:inline-block;margin:4px 4px 0 0;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${MARK[k].style}">${MARK[k].label}</span>`;
  const cell = (c: (typeof QUAD_GRID)[0][0]) => {
    const here = (Object.keys(MARK) as (keyof QuadMarks)[]).filter((k) => marks[k] === c.q);
    const isEconomy = marks.economy === c.q;
    return `<td width="50%" valign="top" style="padding:10px 12px;background:${c.bg};border:${isEconomy ? `2px solid ${c.ink}` : "1px solid #fff"};height:64px">
      <p style="margin:0;font-size:14px;font-weight:700;color:${c.ink}">${esc(qLabel(c.q))}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#555">${c.growth} · ${c.infl}</p>
      ${here.length ? `<div>${here.map(chip).join("")}</div>` : ""}</td>`;
  };
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:460px;border-collapse:separate;border-spacing:3px;margin:4px 0 6px">
    ${QUAD_GRID.map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("")}</table>
    <p style="margin:0 0 10px;font-size:11px;color:#6b746f">${esc(label)} regime map. Black = where the economy is; outlined = what markets price; dashed = forecasters' consensus.</p>`;
}

function barsHtml(title: string, rows: { label: string; bullish: number; bearish: number }[]): string {
  const max = Math.max(1, ...rows.flatMap((r) => [r.bullish, r.bearish]));
  const w = (n: number) => Math.max(n ? 4 : 0, Math.round((n / max) * 100));
  const bar = (n: number, color: string, align: "left" | "right") => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>${align === "right" ? `<td></td>` : ""}<td width="${w(n)}%" style="background:${color};height:14px;font-size:0;line-height:0">&nbsp;</td>${align === "left" ? `<td></td>` : ""}</tr></table>`;
  return `<p style="margin:10px 0 4px;font-size:13px;font-weight:700;color:#111">${esc(title)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 10px">
    <tr><td style="font-size:11px;color:#a3261b;text-align:right;padding:0 6px 4px">◀ Bearish</td><td></td><td style="font-size:11px;color:#0b6e4f;padding:0 6px 4px">Bullish ▶</td></tr>
    ${rows.map((r) => `<tr>
      <td width="40%" style="padding:3px 0">${bar(r.bearish, "#d9534a", "right")}</td>
      <td style="padding:3px 8px;font-size:12px;color:#222;white-space:nowrap;text-align:center">${esc(r.label)} <span style="color:#6b746f">${r.bearish}·${r.bullish}</span></td>
      <td width="40%" style="padding:3px 0">${bar(r.bullish, "#1f9d6b", "left")}</td></tr>`).join("")}
  </table>`;
}

function trackBox(t: TrackRecord): Part {
  const sign = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  const line = (dir: string, x: TrackRecord["bullish"], goodWord: string) => !x.count ? `${dir}: no flips in the window.`
    : `${dir}: ${x.hits} of ${x.count} ${goodWord} (${Math.round((x.hits / x.count) * 100)}%), average ${sign(x.avg)} since the flip, ${sign(x.avgVsBench)} vs the S&P 500.${x.best ? ` Best ${x.best.name} ${sign(x.best.pct)}` : ""}${x.worst && x.worst.name !== x.best?.name ? `, worst ${x.worst.name} ${sign(x.worst.pct)}.` : x.best ? "." : ""}`;
  return { kind: "box", title: `Track record · flips from ${shortDate(t.fromDate)} to ${shortDate(t.toDate)}`, lines: [
    line("Bullish", t.bullish, "are up"), line("Bearish", t.bearish, "are down"),
    "Every flip in the window is counted, winners and losers. Past signals don't predict future ones.",
  ] };
}

const worstTable = (rows: BoardRow[]): Table => {
  const t = boardTable(rows, false);
  return { head: [t.head[0], "Sector", ...t.head.slice(1)], rows: t.rows.map((r, i) => [r[0], sectorLabel(rows[i].sector), ...r.slice(1)]) };
};
const sectorLabel = (s?: string) => { const l = classLabel(s ?? "other"); return l.charAt(0).toUpperCase() + l.slice(1); };

export function renderIssue(data: IssueData, siteUrl = "https://a3ro.com.au", edition: Edition = "free"): RenderedIssue {
  const site = siteUrl.replace(/\/$/, "");
  const premium = edition === "premium";
  const ed = data.editorial ?? {};
  const skip = new Set(ed.skip ?? []);
  const sections: Section[] = [];

  // 0. This week in one line (above everything, for skimmers)
  if (ed.summary) sections.push({ title: "This week in one line", parts: [{ kind: "p", text: ed.summary, strong: true }] });
  else if (!skip.has("summary")) sections.push({ title: "This week in one line", parts: [ph("one sentence a reader can stop at: the week's main story and what it means for the signals")] });

  // 1. Big news this week
  if (!ed.bigNews?.headline && !skip.has("bigNews")) {
    sections.push({ title: "Big news this week", parts: [ph("the week's most market-moving story, why it matters for A3RO readers, and two or three briefs")] });
  }
  if (ed.bigNews?.headline) {
    const b = ed.bigNews;
    sections.push({ title: "Big news this week", parts: [
      { kind: "p", text: b.headline, strong: true },
      ...(b.body ? [{ kind: "p" as const, text: b.body }] : []),
      ...(b.why ? [{ kind: "p" as const, text: `Why it matters: ${b.why}` }] : []),
      ...(b.briefs.length ? [{ kind: "list" as const, items: b.briefs }] : []),
    ] });
  }

  // 2. What's flipped (Premium); a one-line teaser in free
  const fl = data.premium?.flips;
  if (fl) {
    if (premium) {
      sections.push({ title: "What's flipped · Trend Finder, Double Confirmed", link: { href: `${site}/Projects/Bull-Market-Finder`, text: "Open Trend Finder" }, parts: [
        ...(!ed.pattern && !skip.has("pattern") ? [ph("2–3 sentences on what this week's flips say together")] : []),
        { kind: "box", title: "Pattern of the week", lines: [...(ed.pattern ? [ed.pattern] : []), fl.pattern.summary] },
        ...(fl.pattern.byClass.length ? [{ kind: "bars" as const, title: "Flips this week by asset class", rows: fl.pattern.byClass.slice(0, 8).map((c) => ({ label: sectorLabel(c.assetClass), bullish: c.bullish, bearish: c.bearish })) }] : []),
        { kind: "h3", text: "Last 10 bullish flips" }, { kind: "table", table: flipTable(fl.bullish) },
        { kind: "h3", text: "Last 10 bearish flips" }, { kind: "table", table: flipTable(fl.bearish) },
        { kind: "p", text: `For bearish flips, a negative "% since" means the signal is working. "vs S&P 500" compares with ${BENCHMARK} over the same days.${fl.asOf ? ` Prices to the US close on ${shortDate(fl.asOf)}.` : ""}` },
        ...(fl.track && (fl.track.bullish.count || fl.track.bearish.count) ? [trackBox(fl.track)] : []),
      ] });
    } else {
      sections.push({ title: "What's flipped", link: { href: `${site}/Projects/Bull-Market-Finder`, text: "See Trend Finder in Premium" }, parts: [
        { kind: "p", text: `${fl.pattern.bullish} assets flipped Double Confirmed bullish and ${fl.pattern.bearish} bearish this week. The pattern, the flip tables and the YTD leaderboard are in A3RO Premium.` },
      ] });
    }
  }

  // 3. Macro weather — US and Australia
  const weatherParts: Part[] = [];
  const sl = data.sinceLast;
  if (sl && (sl.us || sl.au)) {
    const move = (flag: string, was: SinceLast["us"], now: { emoji: string; label: string } | null | undefined) =>
      !was || !now ? null : was.label === now.label ? `${flag} unchanged at ${now.emoji} ${now.label}` : `${flag} ${was.emoji} ${was.label} → ${now.emoji} ${now.label}`;
    const bits = [move("🇺🇸", sl.us, data.macro?.weather), move("🇦🇺", sl.au, data.au?.weather)].filter(Boolean);
    if (bits.length) weatherParts.push({ kind: "p", text: `Since last issue (${shortDate(sl.issueDate)}): ${bits.join(" · ")}.`, strong: true });
  }
  if (data.macro) {
    const m = data.macro;
    weatherParts.push({ kind: "h3", text: `🇺🇸 US: ${m.weather.emoji} ${m.weather.label}` });
    weatherParts.push({ kind: "quadrant", label: "US", marks: { economy: m.quadrant, market: m.marketRegime ?? null, consensus: m.consensus?.quadrant ?? null } });
    if (m.marketRegime !== undefined || m.consensus) {
      weatherParts.push({ kind: "table", table: { head: ["View", "Quadrant", "Evidence"], rows: [
        ["Economy", qLabel(m.quadrant), m.headline || "—"],
        ["Market", qLabel(m.marketRegime), m.marketShare != null ? `${Math.round(m.marketShare * 100)}% of the 30-market confirmations${m.riskOn != null ? `; risk-on ${Math.round(m.riskOn * 100)}%` : ""}` : "—"],
        ["Consensus", qLabel(m.consensus?.quadrant), m.consensus ? `${m.consensus.source} (${shortDate(m.consensus.asOf)})${m.consensus.note ? `: ${m.consensus.note}` : ""}` : "Not set"],
      ] } });
    } else {
      weatherParts.push({ kind: "p", text: `Economic regime: ${QUADRANT_WORDS[m.quadrant] ?? m.quadrant}.${m.headline ? ` ${m.headline}` : ""}` });
    }
    for (const r of m.weather.reasons) weatherParts.push({ kind: "p", text: r.endsWith(".") ? r : `${r}.` });
    if (m.liquidity) weatherParts.push({ kind: "p", text: m.liquidity.endsWith(".") ? m.liquidity : `${m.liquidity}.` });
  }
  if (data.au || data.pulse) {
    const a = data.au, p = data.pulse;
    weatherParts.push({ kind: "h3", text: a ? `🇦🇺 Australia: ${a.weather.emoji} ${a.weather.label}` : "🇦🇺 Australia Pulse" });
    if (a) {
      weatherParts.push({ kind: "quadrant", label: "Australia", marks: { economy: a.economy, consensus: a.consensus?.quadrant ?? null } });
      weatherParts.push({ kind: "table", table: { head: ["View", "Quadrant", "Evidence"], rows: [
        ["Economy", qLabel(a.economy), p ? `Australia Pulse: ${p.label.toLowerCase()}` : "—"],
        ["Market", a.weather.market ? a.weather.market.replace(/^./, (c) => c.toUpperCase()) : "—", a.twi ? `AUD trade-weighted index ${sign(a.twi.pct)}% over three months (RBA)` : "—"],
        ["Consensus", qLabel(a.consensus?.quadrant), a.consensus ? `${a.consensus.source} (${shortDate(a.consensus.asOf)})${a.consensus.note ? `: ${a.consensus.note}` : ""}` : "Not set"],
      ] } });
      for (const r of a.weather.reasons.slice(0, 1)) weatherParts.push({ kind: "p", text: r });
      if (a.weather.stormWatch) weatherParts.push({ kind: "p", text: a.weather.reasons[a.weather.reasons.length - 1] });
    }
    if (p) {
      weatherParts.push({ kind: "p", text: `Leading growth indicators: ${axisWords(p.growth.state, p.growth.up, p.growth.down, "improving", "weakening")}. Price pressure: ${axisWords(p.inflation.state, p.inflation.up, p.inflation.down, "building", "easing")}.` });
      if (p.moved.length) weatherParts.push({ kind: "p", text: `Biggest moves: ${p.moved.map((mv) => `${mv.label} (${mv.period}, ${sign(mv.zChange, 1)}σ)`).join("; ")}.` });
    }
  }
  if (weatherParts.length) sections.push({ title: "Macro weather", link: { href: `${site}/Projects/Australia-Watch`, text: "Open Australia Watch" }, parts: weatherParts });

  // 4. YTD leaderboard (Premium)
  const lb = data.premium?.leaderboard;
  if (premium && lb) {
    sections.push({ title: "YTD leaderboard · Core 10 + Universe Leaders", parts: [
      { kind: "table", table: boardTable(lb.top, true) },
      { kind: "h3", text: "Worst in each sector (universe)" }, { kind: "table", table: worstTable(lb.worst) },
      { kind: "p", text: `YTD from the close on ${shortDate(lb.ytdBase)}; prices in each asset's own currency${lb.asOf ? `, to ${shortDate(lb.asOf)}` : ""}. ${CORE_10.filter((c) => c.note).map((c) => c.note).join(" ")}` },
    ] });
  }

  // 5. Commodities: significant changes, then ongoing red flags
  const c = data.commodity;
  if (c || data.oil) {
    const parts: Part[] = [];
    const brief = c?.brief ?? [];
    parts.push(brief.length ? { kind: "list", items: brief.map((b) => `${b.commodity}: ${b.text}`) } : { kind: "p", text: "No significant moves in the tracked commodities this week." });
    if (c?.redFlags.length) parts.push({ kind: "box", title: "🚩 Red flags · ongoing disturbances", lines: c.redFlags.map((f) => `${f.commodity}: ${f.title} (since ${shortDate(f.since)}). ${f.detail}`.trim()) });
    sections.push({ title: "Commodities", link: { href: `${site}/Projects/Oil-Tracker`, text: "Open Commodity Watch" }, parts });
  }

  // 6. Execute — only when an FOMC/CPI event falls in the next 7 days
  if (data.execute) {
    const lines = (premium ? data.execute.premium : data.execute.free).split("\n").filter(Boolean);
    sections.push({ title: "Execute this week · BTC event pivots", link: { href: `${site}/Projects/Execute`, text: premium ? "Open Execute" : "Execute is in A3RO Premium" }, parts: [{ kind: "list", items: lines.slice(1) }] });
  }

  // 7. What's coming: release calendars, then earnings (drafted from public report dates, approved by the owner)
  const earnings = ed.earnings ?? [];
  const earningsPh = !earnings.length && !skip.has("earnings");
  if (data.coming?.length || earnings.length || earningsPh) {
    const parts: Part[] = [];
    if (data.coming?.length) parts.push({ kind: "table", table: { head: ["When", "Event"], rows: data.coming.map((e) => [sydneyWhen(e.at), `${e.key ? "⚠️ " : ""}${e.label}`]) } });
    if (earnings.length) parts.push({ kind: "h3", text: "Earnings next week" }, { kind: "list", items: earnings });
    if (earningsPh) parts.push({ kind: "h3", text: "Earnings next week" }, ph("notable US large-cap and ASX 200 companies reporting in the 7 days after the send"));
    sections.push({ title: "What's coming · next 7 days (Sydney time)", link: { href: `${site}/calendar`, text: "Open the calendar" }, parts });
  }

  // 8. A3RO updates
  const up = ed.updates;
  if (up && (up.shipped.length || up.fixed.length || up.next.length)) {
    const parts: Part[] = [];
    if (up.shipped.length) parts.push({ kind: "h3", text: "Shipped" }, { kind: "list", items: up.shipped });
    if (up.fixed.length) parts.push({ kind: "h3", text: "Fixed" }, { kind: "list", items: up.fixed });
    if (up.next.length) parts.push({ kind: "h3", text: "Next" }, { kind: "list", items: up.next });
    sections.push({ title: "A3RO updates", link: { href: site, text: "Open A3RO" }, parts });
  } else if (!skip.has("updates")) {
    sections.push({ title: "A3RO updates", link: { href: site, text: "Open A3RO" }, parts: [ph("what shipped, what was fixed and what's next, from this week's commits")] });
  }

  const heading = `A3RO weekly${premium ? " Premium" : ""} · ${longDate(data.issueDate)}`;
  const tag = [data.macro ? `🇺🇸 ${data.macro.weather.emoji} ${data.macro.weather.label}` : null, data.au && data.au.weather.reading !== "PENDING" ? `🇦🇺 ${data.au.weather.emoji} ${data.au.weather.label}` : null].filter(Boolean).join(" · ");
  const subject = tag ? `${heading} · ${tag}` : heading;
  const sources = `Sources: ABS, RBA, OECD, FRED, EIA, IMF PortWatch, CME, Federal Reserve${premium && data.premium ? "; market data from Yahoo Finance (Premium only)" : ""}.`;

  /* text */
  const textPart = (p: Part): string[] => {
    if (p.kind === "quadrant") return [`[${p.label} quadrant: ${(["economy", "market", "consensus"] as const).filter((k) => p.marks[k]).map((k) => `${k} ${qLabel(p.marks[k])}`).join(" · ")}]`];
    if (p.kind === "bars") return ["", p.title, ...p.rows.map((r) => `${r.label}: ${r.bullish} bullish / ${r.bearish} bearish`)];
    if (p.kind === "p" || p.kind === "ph") return [p.kind === "ph" ? `[${p.text}]` : p.text];
    if (p.kind === "h3") return ["", p.text];
    if (p.kind === "list") return p.items.map((i) => `• ${i}`);
    if (p.kind === "box") return [`[${p.title}]`, ...p.lines];
    return [p.table.head.join(" | "), ...p.table.rows.map((r) => r.join(" | "))];
  };
  const text = [
    heading, "",
    ...sections.flatMap((s) => [s.title.toUpperCase(), ...s.parts.flatMap(textPart), ...(s.link ? [`${s.link.text}: ${s.link.href}`] : []), ""]),
    ...(sections.length ? [] : ["No fresh readings this week.", ""]),
    sources, GENERAL_ADVICE_WARNING, "",
    `You're getting this because you signed up at a3ro.com.au. Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`,
  ].join("\n");

  /* html */
  const P = "margin:0 0 6px;font-size:15px;line-height:1.55;color:#333";
  const htmlPart = (p: Part): string => {
    if (p.kind === "quadrant") return quadrantHtml(p.label, p.marks);
    if (p.kind === "bars") return barsHtml(p.title, p.rows);
    if (p.kind === "ph") return `<p style="margin:4px 0 10px;padding:12px 14px;border:2px dashed #c8a400;background:#fffbea;font-size:14px;line-height:1.5;color:#6b5a00">${esc(p.text)}</p>`;
    if (p.kind === "p") return `<p style="${P}${p.strong ? ";font-weight:600;color:#111" : ""}">${esc(p.text)}</p>`;
    if (p.kind === "h3") return `<h3 style="margin:16px 0 6px;font-size:15px;color:#111">${esc(p.text)}</h3>`;
    if (p.kind === "list") return `<ul style="margin:0 0 8px;padding-left:20px">${p.items.map((i) => `<li style="${P}">${esc(i)}</li>`).join("")}</ul>`;
    if (p.kind === "box") return `<div style="margin:4px 0 12px;padding:12px 14px;border-left:4px solid #0b6e4f;background:#eef6f2">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;color:#0b6e4f">${esc(p.title)}</p>
      ${p.lines.map((l) => `<p style="margin:0 0 6px;font-size:16px;line-height:1.5;color:#111">${esc(l)}</p>`).join("")}</div>`;
    const th = "padding:6px 8px;border-bottom:1px solid #d7dcd8;text-align:left;font-size:12px;color:#6b746f;white-space:nowrap";
    const td = "padding:6px 8px;border-bottom:1px solid #eef0ee;font-size:13px;color:#222;vertical-align:top";
    return `<div style="overflow-x:auto;margin:0 0 10px"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr>${p.table.head.map((h) => `<th style="${th}">${esc(h)}</th>`).join("")}</tr>
      ${p.table.rows.map((r) => `<tr>${r.map((cell) => `<td style="${td}">${esc(cell)}</td>`).join("")}</tr>`).join("")}</table></div>`;
  };
  const block = (s: Section) => `
    <tr><td style="padding:24px 0 0">
      <h2 style="margin:0 0 8px;font-size:17px;line-height:1.3;color:#111">${esc(s.title)}</h2>
      ${s.parts.map(htmlPart).join("")}
      ${s.link ? `<p style="margin:10px 0 0"><a href="${esc(s.link.href)}" style="font-size:14px;color:#0b6e4f">${esc(s.link.text)} →</a></p>` : ""}
    </td></tr>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #e3e6e3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<tr><td style="padding:28px 28px 8px">
  <p style="margin:0;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6b746f">A3RO Intelligence${premium ? " · Premium" : ""}</p>
  <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#111">${esc(heading)}</h1>
  ${tag ? `<p style="margin:6px 0 0;font-size:14px;color:#333">${esc(tag)}</p>` : ""}
</td></tr>
<tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${sections.length ? sections.map(block).join("") : `<tr><td style="padding:24px 0 0;font-size:15px;color:#333">No fresh readings this week.</td></tr>`}
</table></td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e3e6e3">
  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b746f">${esc(sources)}</p>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b746f">${esc(GENERAL_ADVICE_WARNING)}</p>
  <p style="margin:0;font-size:12px;line-height:1.5;color:#6b746f">You're getting this because you signed up at <a href="${esc(site)}" style="color:#6b746f">a3ro.com.au</a>. <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#6b746f">Unsubscribe</a></p>
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text };
}

export { classLabel };
export type { ScheduleEntry, AustraliaReleaseSchedule };

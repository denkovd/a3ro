"use client";
/* Trend Finder card on an asset page (#38). The page is built at deploy time, so it can't know who
   is viewing: this asks the Premium API itself. Premium (admins included) sees the current Money Line
   state on daily and weekly closes; anyone else gets 401/403 and the locked teaser. */
import { useEffect, useState } from "react";
import { LockIcon } from "../../components/LockIcon";

interface Lens {
  strategy: string; verdict: string; runDate: string;
  dailyTrend: number | null; weeklyTrend: number | null;
  dailyFlipDate: string | null; weeklyFlipDate: string | null;
  dailyFlipPrice: number | null; weeklyFlipPrice: number | null;
  dailyLine: number | null; weeklyLine: number | null;
  dailyCushionPct: number | null; weeklyCushionPct: number | null;
  alignedSince: string | null; daysSinceAligned: number | null;
  newlyBullish: boolean; strength: number | null; rs63: number | null;
  lastClose: number | null; lastCloseDate: string | null;
}

interface Details {
  provider: string; marketCap: number | null; marketCapAsOf: string | null; week52High: number | null; week52Low: number | null;
  peTtm: number | null; beta: number | null; dividendYieldPct: number | null; industry: string | null; exchange: string | null;
  circulatingSupply: number | null; maxSupply: number | null; ath: number | null; athDate: string | null; athChangePct: number | null; marketCapRank: number | null;
  nextEarningsDate: string | null; nextEarningsHour: string | null;
}
interface Quarter { year: number; quarter: number; reportDate: string | null; epsActual: number | null; epsEstimate: number | null; epsSurprisePct: number | null; revenueSurprisePct: number | null }
interface Transition { runDate: string; strategy: string; fromVerdict: string | null; toVerdict: string }
interface Payload { lenses?: Lens[]; details?: Details | null; earnings?: { nextDate: string | null; quarters: Quarter[] } | null; transitions?: Transition[] }
export interface RegimeFit { bullish: readonly string[]; bearish: readonly string[]; via: string | null }

type State = { kind: "loading" } | { kind: "locked" } | { kind: "none" } | { kind: "error" } | { kind: "ok"; lens: Lens; data: Payload };

const DAY = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (d: string | null) => (d ? DAY.format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "—");
const price = (v: number | null) => (v === null ? "—" : v >= 1000 ? v.toLocaleString("en-AU", { maximumFractionDigits: 0 }) : v.toPrecision(4).replace(/\.?0+$/, ""));
const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

function headline(l: Lens, ticker: string) {
  const d = l.dailyTrend, w = l.weeklyTrend;
  if (d === 1 && w === 1) return { text: `${ticker} is bullish on daily and weekly closes`, sub: "Double confirmed", tone: "up" as const };
  if (d === 1 && w === -1) return { text: `${ticker} has turned up on daily closes; weekly is still down`, sub: "Early: waiting for weekly confirmation", tone: "mixed" as const };
  if (d === -1 && w === 1) return { text: `${ticker} has slipped on daily closes; weekly is still up`, sub: "Lagging: the weekly trend hasn't turned", tone: "mixed" as const };
  if (d === -1 && w === -1) return { text: `${ticker} is bearish on daily and weekly closes`, sub: "Not in an uptrend", tone: "down" as const };
  return { text: `${ticker} doesn't have enough history for a trend reading yet`, sub: "Warming up", tone: "mixed" as const };
}
const TONE = { up: "#5fc9a4", mixed: "#d4a157", down: "#e07a5f" };

function Leg({ label, trend, flipDate, flipPrice, line, cushion }: { label: string; trend: number | null; flipDate: string | null; flipPrice: number | null; line: number | null; cushion: number | null }) {
  const dir = trend === 1 ? "Up" : trend === -1 ? "Down" : "Warming up";
  return <div className="flex flex-col gap-1 rounded-sm border border-[var(--line)] p-3">
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{label}</p>
    <p className="text-base font-medium" style={{ color: trend === 1 ? TONE.up : trend === -1 ? TONE.down : TONE.mixed }}>{dir}{flipDate && trend !== 0 ? <span className="text-sm font-normal text-[var(--ink-2)]"> since {day(flipDate)}</span> : null}</p>
    <p className="text-xs text-[var(--ink-3)]">Turned at {price(flipPrice)} · Money Line {price(line)}</p>
    {cushion !== null ? <p className="text-xs text-[var(--ink-3)]">Close is {Math.abs(cushion).toFixed(1)}% {cushion < 0 ? "below" : "above"} the line</p> : null}
  </div>;
}

const big = (v: number | null) => v === null ? "—" : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}tn` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}bn` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}m` : `$${Math.round(v).toLocaleString("en-AU")}`;
const count = (v: number | null) => v === null ? "—" : v >= 1e9 ? `${(v / 1e9).toFixed(2)}bn` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : Math.round(v).toLocaleString("en-AU");
const REGIME: Record<string, string> = { GOLDILOCKS: "Goldilocks", REFLATION: "Reflation", INFLATION: "Inflation", DEFLATION: "Deflation" };
const LENS: Record<string, string> = { "ml-daily": "Daily trend", "ml-weekly": "Weekly trend", "ml-dw": "Daily and weekly together" };
const VERDICT: Record<string, string> = { BULLISH: "turned bullish", BEARISH: "turned bearish", CONFLICT_DAILY: "went early bullish (daily up, weekly not yet)", CONFLICT_WEEKLY: "slipped to lagging (weekly up, daily down)", WARMUP: "is warming up" };

function Fact({ label, value }: { label: string; value: string }) {
  return value === "—" ? null : <div><dt className="text-xs text-[var(--ink-3)]">{label}</dt><dd className="mt-0.5 font-mono text-sm text-[var(--ink)]">{value}</dd></div>;
}

function DetailsBlock({ d, quarters, nextDate }: { d: Details; quarters: Quarter[]; nextDate: string | null }) {
  const coin = d.provider !== "finnhub";
  const scored = quarters.filter((q) => q.epsSurprisePct !== null).slice(0, 8);
  const beats = scored.filter((q) => (q.epsSurprisePct ?? 0) > 0).length;
  return <>
    <div>
      <h3 className="landing-kicker">{coin ? "Coin details" : "Company details"}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label={`Market cap${d.marketCapAsOf ? `, ${day(d.marketCapAsOf)}` : ""}`} value={big(d.marketCap)} />
        {coin ? <>
          <Fact label="Rank by market cap" value={d.marketCapRank ? `#${d.marketCapRank}` : "—"} />
          <Fact label="Circulating supply" value={count(d.circulatingSupply)} />
          <Fact label="Maximum supply" value={count(d.maxSupply)} />
          <Fact label={`All-time high${d.athDate ? `, ${day(d.athDate)}` : ""}`} value={d.ath === null ? "—" : `$${price(d.ath)}`} />
          <Fact label="Below all-time high" value={d.athChangePct === null ? "—" : `${Math.abs(d.athChangePct).toFixed(1)}%`} />
        </> : <>
          <Fact label="52-week range" value={d.week52Low !== null && d.week52High !== null ? `${price(d.week52Low)}–${price(d.week52High)}` : "—"} />
          <Fact label="P/E (trailing)" value={d.peTtm === null ? "—" : d.peTtm.toFixed(1)} />
          <Fact label="Beta" value={d.beta === null ? "—" : d.beta.toFixed(2)} />
          <Fact label="Dividend yield" value={d.dividendYieldPct === null ? "—" : `${d.dividendYieldPct.toFixed(2)}%`} />
          <Fact label="Industry" value={d.industry ?? "—"} />
        </>}
      </dl>
    </div>
    {!coin && (scored.length > 0 || nextDate) ? <div>
      <h3 className="landing-kicker">Earnings</h3>
      <p className="mt-2 text-sm text-[var(--ink-2)]">
        {scored.length ? `Beat analysts\u2019 earnings forecasts in ${beats} of the last ${scored.length} quarters. ` : ""}
        {nextDate ? `Next report ${day(nextDate)}${d.nextEarningsHour === "bmo" ? ", before the open" : d.nextEarningsHour === "amc" ? ", after the close" : ""}.` : ""}
      </p>
      {scored.length ? <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Earnings surprise by quarter, newest first">
        {scored.map((q) => <span key={`${q.year}-${q.quarter}`} title={`Q${q.quarter} ${q.year}: EPS ${q.epsActual ?? "—"} vs ${q.epsEstimate ?? "—"} forecast`}
          className="rounded-sm border border-[var(--line)] px-2 py-1 font-mono text-[11px]" style={{ color: (q.epsSurprisePct ?? 0) > 0 ? TONE.up : TONE.down }}>
          Q{q.quarter} {String(q.year).slice(2)} {pct(q.epsSurprisePct)}
        </span>)}
      </div> : null}
    </div> : null}
  </>;
}

function History({ transitions }: { transitions: Transition[] }) {
  const rows = transitions.filter((t) => t.strategy === "ml-daily" || t.strategy === "ml-weekly").slice(0, 8);
  if (!rows.length) return null;
  return <div>
    <h3 className="landing-kicker">Trend changes, last 12 months</h3>
    <ul className="mt-2 divide-y divide-[var(--line)] text-sm">
      {rows.map((t) => <li key={`${t.runDate}-${t.strategy}`} className="flex justify-between gap-3 py-1.5">
        <span className="text-[var(--ink-2)]">{LENS[t.strategy] ?? t.strategy} {VERDICT[t.toVerdict] ?? t.toVerdict.toLowerCase()}</span>
        <span className="shrink-0 font-mono text-xs text-[var(--ink-3)]">{day(t.runDate)}</span>
      </li>)}
    </ul>
  </div>;
}

function Fit({ fit, regime, ticker }: { fit: RegimeFit; regime: string | null; ticker: string }) {
  const list = (r: readonly string[]) => r.map((q) => REGIME[q] ?? q).join(" and ");
  const who = fit.via ?? ticker;
  const now = regime ? REGIME[regime] : null;
  const lean = !regime ? null : fit.bullish.includes(regime) ? `a regime ${who} has tended to trend up in` : fit.bearish.includes(regime) ? `a regime ${who} has tended to trend down in` : `no clear lean either way for ${who}`;
  const parts: string[] = [];
  if (fit.bullish.length) parts.push(`in an uptrend during ${list(fit.bullish)}`);
  if (fit.bearish.length) parts.push(`in a downtrend during ${list(fit.bearish)}`);
  return <div>
    <h3 className="landing-kicker">US regime fit</h3>
    <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
      {who} has tended to be {parts.join(", and ")}.{now ? ` The US economy reads ${now} now: ${lean}.` : ""}
    </p>
    <a href="/Projects/Regime-Shift" className="mt-1 inline-block text-xs text-[var(--ink-3)] underline">See the US regime</a>
  </div>;
}

export function AssetTrend({ ticker, name, trendSymbol, universe, fit = null }: { ticker: string; name: string; trendSymbol: string; universe: number; fit?: RegimeFit | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [regime, setRegime] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/bull/asset?symbol=${encodeURIComponent(trendSymbol)}&days=365`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401 || r.status === 403) return setState({ kind: "locked" });
        if (r.status === 400 || r.status === 404) return setState({ kind: "none" });
        if (!r.ok) return setState({ kind: "error" });
        const body = await r.json() as Payload;
        const lens = body.lenses?.find((l) => l.strategy === "ml-dw") ?? body.lenses?.[0];
        setState(lens ? { kind: "ok", lens, data: body } : { kind: "none" });
        // Only Premium gets this far, so only Premium asks for the current regime.
        if (lens && fit) fetch("/api/macro/latest", { cache: "no-store" }).then((m) => (m.ok ? m.json() : null))
          .then((m) => { const q = m?.macro?.quadrant; if (live && typeof q === "string" && q !== "PENDING") setRegime(q); }).catch(() => {});
      })
      .catch(() => { if (live) setState({ kind: "error" }); });
    return () => { live = false; };
  }, [trendSymbol, fit]);

  const finderHref = `/Projects/Bull-Market-Finder?asset=${encodeURIComponent(trendSymbol)}`;

  if (state.kind === "ok") {
    const l = state.lens, h = headline(l, ticker);
    return <section aria-labelledby="asset-trend" className="flex max-w-3xl flex-col gap-4 rounded-sm border border-[var(--line)] p-5">
      <p className="landing-kicker">Trend Finder · Money Line · scan {day(l.runDate)}</p>
      <div>
        <h2 id="asset-trend" className="text-lg font-medium">{h.text}</h2>
        <p className="mt-1 text-sm" style={{ color: TONE[h.tone] }}>{h.sub}{l.newlyBullish ? " · newly bullish" : ""}{l.dailyTrend === 1 && l.weeklyTrend === 1 && l.alignedSince ? ` · aligned since ${day(l.alignedSince)}` : ""}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Leg label="Daily closes" trend={l.dailyTrend} flipDate={l.dailyFlipDate} flipPrice={l.dailyFlipPrice} line={l.dailyLine} cushion={l.dailyCushionPct} />
        <Leg label="Weekly closes" trend={l.weeklyTrend} flipDate={l.weeklyFlipDate} flipPrice={l.weeklyFlipPrice} line={l.weeklyLine} cushion={l.weeklyCushionPct} />
      </div>
      <p className="text-xs text-[var(--ink-3)]">
        Last close {price(l.lastClose)} on {day(l.lastCloseDate)}
        {l.rs63 !== null ? ` · ${pct(l.rs63)} vs its benchmark over 3 months` : ""}.
        {" "}The trend turns when a close breaks the Money Line; it describes the trend, it doesn&rsquo;t forecast it.
      </p>
      {state.data.details ? <DetailsBlock d={state.data.details} quarters={state.data.earnings?.quarters ?? []} nextDate={state.data.earnings?.nextDate ?? state.data.details.nextEarningsDate} /> : null}
      <History transitions={state.data.transitions ?? []} />
      {fit && (fit.bullish.length > 0 || fit.bearish.length > 0) ? <Fit fit={fit} regime={regime} ticker={ticker} /> : null}
      <a href={finderHref} className="text-sm text-[var(--acid)]">Open {ticker} in Trend Finder →</a>
    </section>;
  }

  if (state.kind === "none") return null;

  // Locked teaser (also shown while checking, so free visitors see no flash; Premium swaps in once loaded).
  return <a href={state.kind === "locked" ? "/Projects/Bull-Market-Finder" : finderHref} aria-busy={state.kind === "loading"}
    className="flex max-w-3xl flex-col gap-2 rounded-sm border border-[var(--line)] p-5 hover:border-[var(--line-2)]">
    <span className="landing-kicker"><LockIcon /> Premium · Trend Finder</span>
    <span className="text-lg font-medium">Has {ticker} turned bullish?</span>
    <span className="text-sm leading-relaxed text-[var(--ink-2)]">
      Trend Finder tracks {name} on daily and weekly closes: whether it has turned, when it flipped and how strong the turn is, ranked against {universe}+ other assets.
    </span>
    <span className="text-sm text-[var(--acid)]">{state.kind === "error" ? "Trend reading unavailable right now · open Trend Finder →" : "Unlock with Premium →"}</span>
  </a>;
}

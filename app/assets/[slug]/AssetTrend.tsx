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

type State = { kind: "loading" } | { kind: "locked" } | { kind: "none" } | { kind: "error" } | { kind: "ok"; lens: Lens };

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

export function AssetTrend({ ticker, name, trendSymbol, universe }: { ticker: string; name: string; trendSymbol: string; universe: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    fetch(`/api/bull/asset?symbol=${encodeURIComponent(trendSymbol)}&days=30`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401 || r.status === 403) return setState({ kind: "locked" });
        if (r.status === 400 || r.status === 404) return setState({ kind: "none" });
        if (!r.ok) return setState({ kind: "error" });
        const body = await r.json() as { lenses?: Lens[] };
        const lens = body.lenses?.find((l) => l.strategy === "ml-dw") ?? body.lenses?.[0];
        setState(lens ? { kind: "ok", lens } : { kind: "none" });
      })
      .catch(() => { if (live) setState({ kind: "error" }); });
    return () => { live = false; };
  }, [trendSymbol]);

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

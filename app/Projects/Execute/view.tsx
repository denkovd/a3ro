"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SiteFooter from "../../components/SiteFooter";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import { useViewer } from "../../components/useViewer";
import { ago, countdown, formatPct, formatZ, leanWord, sydneyLabel } from "../../../backend/src/execute/format";
import { EXECUTE_Z_THRESHOLD, type ExecuteChecklist, type ExecuteEvent, type ExecutePayload, type ExecutePeekPayload, type ExecuteRecord, type ExecuteTrade, type ExecuteUpcoming } from "../../../backend/src/execute/types";

const ACCENT = "#d4a157";
const SHORT = "#ef5350";
const LONG = "#66bb6a";
const leanColor = (lean: string) => (lean === "short" ? SHORT : lean === "long" ? LONG : "var(--ink-2)");
const money = (x: number | undefined | null) => (x == null ? "—" : `$${Math.round(x).toLocaleString("en-US")}`);

type Gate = "loading" | "open" | "signin" | "premium" | "error";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--ink-2)]">{children}</p>;
}

function Locked({ gate, what }: { gate: Gate; what: string }) {
  return <div className="flex flex-col items-start gap-3 border border-dashed border-[var(--line-2)] p-6 text-sm text-[var(--ink-2)]">
    <span className="font-mono text-[10px] uppercase tracking-[.15em]" style={{ color: ACCENT }}>Premium</span>
    <p>{what}</p>
    {gate === "signin"
      ? <Link href="/login?next=/Projects/Execute" className="underline">Sign in</Link>
      : <Link href="/private?module=execute&next=/Projects/Execute" className="underline">What Premium includes</Link>}
  </div>;
}

/* ── Next pivot (public) ─────────────────────────────────────────── */
function NextPivot({ events, now }: { events: ExecuteEvent[]; now: Date }) {
  const next = events.find(e => Date.parse(e.eventTime) > now.getTime());
  if (!next) return <p className="text-sm text-[var(--ink-2)]">No FOMC or CPI release is scheduled in the next 45 days.</p>;
  const armed = Date.parse(next.armTime) <= now.getTime();
  return <div className="grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">
    <div className="bg-[var(--depth-1)] p-6"><Label>Next pivot</Label><p className="mt-3 text-3xl">{next.kind}</p><p className="mt-2 text-sm text-[var(--ink-2)]">{sydneyLabel(next.eventTime)}</p></div>
    <div className="bg-[var(--depth-1)] p-6"><Label>Event in</Label><p className="mt-3 font-mono text-3xl tabular-nums">{countdown(next.eventTime, now)}</p></div>
    <div className="bg-[var(--depth-1)] p-6"><Label>{armed ? "Armed" : "Arms in"}</Label><p className="mt-3 font-mono text-3xl tabular-nums">{armed ? "now" : countdown(next.armTime, now)}</p><p className="mt-2 text-xs text-[var(--ink-2)]">24 hours before the release</p></div>
  </div>;
}

function Timeline({ events, now }: { events: ExecuteEvent[]; now: Date }) {
  const future = events.filter(e => Date.parse(e.eventTime) > now.getTime()).slice(0, 8);
  if (future.length < 2) return null;
  return <ol className="mt-4 divide-y divide-[var(--line)] border border-[var(--line)]">{future.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><span><span className="inline-block w-14 font-mono text-xs" style={{ color: ACCENT }}>{e.kind}</span>{sydneyLabel(e.eventTime)}</span><span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">in {countdown(e.eventTime, now)}</span></li>)}</ol>;
}

/* ── Signal (Premium) ────────────────────────────────────────────── */
function ZGauge({ z }: { z: number | null }) {
  const span = 3;
  const pos = (v: number) => `${((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * 100}%`;
  return <div className="relative mt-4 h-2 bg-[var(--depth-3)]" aria-hidden>
    <div className="absolute inset-y-0 bg-[rgba(102,187,106,.18)]" style={{ left: 0, width: pos(-EXECUTE_Z_THRESHOLD) }} />
    <div className="absolute inset-y-0 right-0 bg-[rgba(239,83,80,.18)]" style={{ left: pos(EXECUTE_Z_THRESHOLD) }} />
    {z != null && <div className="absolute -top-1 h-4 w-1" style={{ left: pos(z), background: "var(--ink)" }} />}
  </div>;
}

const CHECKS: [Exclude<keyof ExecuteChecklist, "score" | "rsi4">, string][] = [
  ["q1_htf_trend", "Daily trend agrees (EMA 50)"], ["q2_bull_bear", "Bull/bear line agrees (SMA 200)"], ["q3_liquidity_swept", "Run-in swept the prior 30-day range"],
  ["q4_strong_push", "Push of 6% or more"], ["q5_exhausted", "4H RSI stretched"], ["month_confluence", "Month-open confluence"],
];

function SignalCard({ item, now }: { item: ExecuteUpcoming; now: Date }) {
  const s = item.signal;
  const armed = s?.state === "armed";
  return <article className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg">{item.kind} · <span className="text-[var(--ink-2)]">{sydneyLabel(item.eventTime)}</span></h3><span className="font-mono text-[10px] uppercase tracking-[.15em]" style={{ color: armed ? ACCENT : "var(--ink-2)" }}>{armed ? "Armed · values frozen" : Date.parse(item.armTime) > now.getTime() ? `Arms in ${countdown(item.armTime, now)}` : "Arming…"}</span></div>
    {!s ? <p className="mt-4 text-sm text-[var(--ink-2)]">No reading yet. The engine runs daily, and hourly around events.</p> : <>
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div><Label>BTC</Label><p className="mt-2 font-mono tabular-nums">{money(s.btcPrice)}</p></div>
        <div><Label>7-day move</Label><p className="mt-2 font-mono tabular-nums">{formatPct(s.move7dPct)}</p></div>
        <div><Label>z (need ±{EXECUTE_Z_THRESHOLD})</Label><p className="mt-2 font-mono tabular-nums">{formatZ(s.z)}</p></div>
        <div><Label>Lean</Label><p className="mt-2 text-sm" style={{ color: leanColor(s.lean) }}>{leanWord(s.lean)}</p></div>
      </div>
      <ZGauge z={s.z} />
      <p className="mt-2 flex justify-between font-mono text-[10px] text-[var(--ink-3)]"><span>−3 · long zone</span><span>0</span><span>short zone · +3</span></p>
      {s.checklist && <details className="mt-5 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-2)]"><summary className="cursor-pointer">Context checklist · {s.checklist.score}/5 (shown for context, does not change the trade)</summary>
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">{CHECKS.map(([k, label]) => { const ok = s.checklist?.[k] === true; return <li key={k}><span style={{ color: ok ? LONG : "var(--ink-3)" }}>{ok ? "✓" : "✗"}</span> {label}</li>; })}</ul></details>}
      <p className="mt-4 text-[11px] text-[var(--ink-3)]">Reading as of the {new Date(s.asOfBar).toISOString().slice(11, 16)} UTC hourly bar, {new Date(s.asOfBar).toISOString().slice(0, 10)}.</p>
    </>}
  </article>;
}

function OpenPosition({ trade }: { trade: ExecuteTrade | null }) {
  if (!trade) return <p className="text-sm text-[var(--ink-2)]">Flat. No paper position is open.</p>;
  const filled = trade.entries.reduce((a, e) => a + e.qty, 0);
  const avg = filled ? trade.entries.reduce((a, e) => a + e.price * e.qty, 0) / filled : null;
  const partial = trade.exits.some(e => e.tag.startsWith("TP1"));
  return <article className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg" style={{ color: leanColor(trade.side) }}>{trade.side.toUpperCase()} · {trade.eventKind} {new Date(trade.eventTime).toISOString().slice(0, 10)}</h3><span className="font-mono text-xs text-[var(--ink-2)]">{trade.status === "pending" ? "E1 fills at the next hourly open" : partial ? "TP1 taken · runner open, stop at breakeven" : "Open"}</span></div>
    <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5 text-sm">
      {(["e1", "e2", "e3"] as const).map(k => { const fill = trade.entries.find(e => e.tag.toLowerCase() === k); return <div key={k}><Label>{k.toUpperCase()}{fill ? " · filled" : ""}</Label><p className="mt-2 font-mono tabular-nums">{money(fill?.price ?? trade.levels?.[k])}</p></div>; })}
      <div><Label>{partial ? "Stop (breakeven)" : "Stop"}</Label><p className="mt-2 font-mono tabular-nums" style={{ color: SHORT }}>{money(partial ? avg : trade.stop)}</p></div>
      <div><Label>TP1 (+2%)</Label><p className="mt-2 font-mono tabular-nums" style={{ color: LONG }}>{money(avg ? avg * (1 + (trade.side === "short" ? -1 : 1) * 0.02) : trade.levels?.tp1)}</p></div>
    </div>
    <p className="mt-4 text-xs text-[var(--ink-2)]">Risk {trade.riskPct}% of paper equity · z {formatZ(trade.z)} · unfilled limits cancel 12h after the event · time stop 96h after it.</p>
  </article>;
}

/* ── Track record (Premium) ──────────────────────────────────────── */
function EquityChart({ points }: { points: { t: string; pct: number }[] }) {
  if (points.length < 2) return <p className="py-10 text-center text-sm text-[var(--ink-2)]">Not enough closed trades to chart yet.</p>;
  const W = 640, H = 180, P = 8;
  const series = [{ pct: 0 }, ...points];
  const lo = Math.min(0, ...series.map(p => p.pct)), hi = Math.max(0, ...series.map(p => p.pct));
  const x = (i: number) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`Equity after each closed trade, ending at ${formatPct(points[points.length - 1].pct)}`}>
    <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--line-2)" strokeDasharray="3 4" />
    <path d={path} fill="none" stroke={ACCENT} strokeWidth="2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function Record({ record, kind }: { record: ExecuteRecord; kind: "paper" | "backtest" }) {
  const s = record.stats;
  const closed = record.trades.filter(t => t.status !== "pending" && t.status !== "open");
  return <div>
    {kind === "backtest"
      ? <p className="mb-5 border border-amber-300/30 p-4 text-xs leading-6 text-amber-200">Hypothetical. Simulated on Binance BTCUSDT hourly data from Jan 2022 with 0.05% fees. The settings were chosen on data before Mar 2025 and checked on the data after it. The sample is small (under 30 trades), and no real money was traded.</p>
      : <p className="mb-5 text-xs leading-6 text-[var(--ink-2)]">Forward paper record for v1.1. It started on 27 Nov 2026 with fresh paper capital and uses only data available at the time. Finished trades are never edited. Paper fills are simulated, not executed.</p>}
    <div className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-5">
      {[["Trades", s ? String(s.trades) : "0"], ["Net", formatPct(s?.netPct ?? null)], ["Profit factor", s?.profitFactor != null ? s.profitFactor.toFixed(2) : "—"], ["Win rate", s?.winRate != null ? `${s.winRate.toFixed(0)}%` : "—"], ["Max drawdown", formatPct(s?.maxDdPct ?? null)]].map(([k, v]) =>
        <div key={k} className="bg-[var(--depth-1)] p-4"><Label>{k}</Label><p className="mt-2 font-mono text-xl tabular-nums">{v}</p></div>)}
    </div>
    <div className="mt-5 border border-[var(--line)] bg-[var(--depth-1)] p-4"><Label>Equity, % of starting capital, after each closed trade</Label><EquityChart points={s?.equity ?? []} /></div>
    {s && Object.keys(s.byYear).length > 0 && <table className="mt-5 w-full text-left text-sm"><caption className="sr-only">Results by year</caption><thead><tr className="text-xs text-[var(--ink-2)]"><th className="py-2 font-normal">Year</th><th className="text-right font-normal">Trades</th><th className="text-right font-normal">Net</th><th className="text-right font-normal">Win rate</th></tr></thead>
      <tbody>{Object.entries(s.byYear).map(([y, r]) => <tr key={y} className="border-t border-[var(--line)]"><td className="py-2">{y}</td><td className="text-right font-mono tabular-nums">{r.trades}</td><td className="text-right font-mono tabular-nums" style={{ color: r.net_pct >= 0 ? LONG : SHORT }}>{formatPct(r.net_pct)}</td><td className="text-right font-mono tabular-nums">{r.win_rate.toFixed(0)}%</td></tr>)}</tbody></table>}
    <details className="mt-5" open={kind === "paper"}><summary className="cursor-pointer text-sm">Trade list ({closed.length})</summary>
      {closed.length === 0 ? <p className="mt-3 text-sm text-[var(--ink-2)]">No trades yet.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="text-[var(--ink-2)]"><th className="py-2 font-normal">Event</th><th className="font-normal">Side</th><th className="text-right font-normal">z</th><th className="font-normal">Exits</th><th className="text-right font-normal">Result</th></tr></thead>
        <tbody>{closed.map(t => <tr key={`${t.eventKind}-${t.eventTime}`} className="border-t border-[var(--line)]"><td className="py-2">{t.eventKind} {t.eventTime.slice(0, 10)}</td><td style={{ color: leanColor(t.side) }}>{t.side}</td><td className="text-right font-mono tabular-nums">{formatZ(t.z)}</td><td className="text-[var(--ink-2)]">{t.status === "skipped" ? `Skipped: ${t.skipReason}` : t.exits.map(e => e.tag).join(" → ")}</td><td className="text-right font-mono tabular-nums" style={{ color: t.pnlPct == null ? undefined : t.pnlPct >= 0 ? LONG : SHORT }}>{t.status === "skipped" ? "—" : formatPct(t.pnlPct, 2)}</td></tr>)}</tbody></table></div>}
    </details>
  </div>;
}

function NewsletterPanel({ block }: { block: ExecutePayload["newsletter"] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); }).catch(() => {}); };
  return <section className="mt-14 border-t border-[var(--line)] pt-8" aria-label="Newsletter block">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl">Newsletter · Execute this week</h2><span className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--ink-2)]">Admin only</span></div>
    {!block ? <p className="mt-3 text-sm text-[var(--ink-2)]">No FOMC or CPI release in the next 7 days. Leave the block out this week.</p> :
      <div className="mt-5 grid gap-4 md:grid-cols-2">{(["free", "premium"] as const).map(k => <div key={k} className="border border-[var(--line)] p-4"><div className="flex items-center justify-between"><Label>{k} edition</Label><button type="button" className="min-h-9 text-xs underline" onClick={() => copy(k, block[k])}>{copied === k ? "Copied" : "Copy"}</button></div><pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-6 text-[var(--ink-2)]">{block[k]}</pre></div>)}</div>}
  </section>;
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function ExecuteView() {
  const viewer = useViewer();
  const now = useNow();
  const [peek, setPeek] = useState<ExecutePeekPayload | null>(null);
  const [data, setData] = useState<ExecutePayload | null>(null);
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<"paper" | "backtest">("paper");

  const load = useCallback(() => {
    fetch("/api/execute-peek", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(setPeek).catch(() => setPeek(null));
    fetch("/api/execute", { cache: "no-store" }).then(async r => {
      if (r.status === 401) return setGate("signin");
      if (r.status === 403) return setGate("premium");
      if (!r.ok) return setGate("error");
      setData(await r.json()); setGate("open");
    }).catch(() => setGate("error"));
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 5 * 60_000); return () => clearInterval(id); }, [load]);

  const events: ExecuteEvent[] = data?.upcoming ?? peek?.upcoming ?? [];
  const signals = (data?.upcoming ?? []).filter(e => Date.parse(e.eventTime) > now.getTime() - 12 * 3_600_000 && Date.parse(e.eventTime) <= now.getTime() + 14 * 86_400_000);
  const locked = gate === "signin" || gate === "premium";

  return <main className="grain min-h-screen bg-[var(--depth-0)] text-[var(--ink)]">
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[rgba(6,7,7,.94)] backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-10"><div className="flex items-center gap-4"><Link href="/#modules" className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--ink-2)]">← Index</Link><span className="text-[var(--ink-3)]">/</span><span className="font-mono text-[10px] uppercase tracking-[.15em]">Execute</span></div><ModuleSwitcher current="execute" /></div>
    </header>
    <div className="mx-auto max-w-7xl px-5 py-9 md:px-10 md:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4"><Label>Research tracker · BTC event pivots · {data?.version ?? peek?.version ?? "v1.1"}</Label>{data?.engine.lastRunAt && <span className="font-mono text-[10px] text-[var(--ink-2)]">Engine {data.engine.ok ? "updated" : "failed"} {ago(data.engine.lastRunAt, now)}</span>}</div>
      <h1 className="mt-5 text-4xl font-medium tracking-tight md:text-6xl">Fading the move into the Fed and CPI.</h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--ink-2)]">Before each FOMC decision and CPI release, BTC often runs hard one way. When the 7-day run-in is large for BTC's recent volatility (|z| ≥ {EXECUTE_Z_THRESHOLD}), this strategy fades it 24 hours before the release. The rules are fixed, and every trade is recorded. Expect 1–3 trades a month and some months with none. Losing streaks of 2–3 trades are normal.</p>
      <p className="mt-4 max-w-3xl border-l-2 border-amber-300/50 pl-4 text-xs leading-6 text-[var(--ink-2)]">Educational research and general information only, not financial advice. It doesn't consider your objectives, finances or needs. Backtests are hypothetical, and paper trades are simulated. Past results don't predict future ones, and leveraged crypto trading can lose more than you expect.</p>

      <section className="mt-12" aria-label="Upcoming pivots"><h2 className="mb-5 text-2xl">Upcoming pivots</h2>
        {events.length === 0 && gate === "loading" ? <p className="text-sm text-[var(--ink-2)]">Loading calendar…</p> : <><NextPivot events={events} now={now} /><Timeline events={events} now={now} /></>}
        <p className="mt-3 text-xs text-[var(--ink-3)]">Times in Sydney. FOMC decisions are at 2:00pm and CPI releases at 8:30am New York time.</p>
      </section>

      {gate === "error" && <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-amber-300/30 p-4 text-sm text-amber-200" role="alert"><p>Signals and the track record couldn't be loaded.</p><button type="button" onClick={load} className="min-h-10 underline">Try again</button></div>}

      <section className="mt-14" aria-label="Signal"><h2 className="mb-5 text-2xl">Signal</h2>
        {locked ? <Locked gate={gate} what="The live z-reading and lean for each upcoming event, when it arms, and the context checklist." />
          : signals.length ? <div className="grid gap-4 lg:grid-cols-2">{signals.map(item => <SignalCard key={item.id} item={item} now={now} />)}</div>
          : gate === "open" ? <p className="text-sm text-[var(--ink-2)]">No event in the next 14 days.</p> : null}
      </section>

      <section className="mt-14" aria-label="Paper position"><h2 className="mb-5 text-2xl">Paper position</h2>
        {locked ? <Locked gate={gate} what="The open paper trade: entries, stop and first target." /> : gate === "open" && <OpenPosition trade={data?.openTrade ?? null} />}
      </section>

      <section className="mt-14" aria-label="Track record"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl">Track record</h2>
        {!locked && <div className="flex gap-1">{([["paper", "Forward paper"], ["backtest", "Backtest (hypothetical)"]] as const).map(([k, label]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`min-h-10 px-3 text-xs ${tab === k ? "bg-[var(--depth-3)]" : "text-[var(--ink-2)]"}`}>{label}</button>)}</div>}</div>
        {locked ? <Locked gate={gate} what="The forward paper record and the hypothetical backtest: equity curve, stats, results by year and every trade." /> : data && <Record record={data[tab]} kind={tab} />}
      </section>

      {viewer.admin && gate === "open" && <NewsletterPanel block={data?.newsletter ?? null} />}

      <section className="mt-14 border-t border-[var(--line)] pt-8 text-xs leading-6 text-[var(--ink-2)]" aria-label="Rules">
        <h2 className="text-base text-[var(--ink)]">The rules (v1.1, fixed)</h2>
        <ul className="mt-3 max-w-3xl space-y-1">
          <li>— Events: FOMC decisions and CPI releases. A setup arms on the hourly bar that closes 24h before the release.</li>
          <li>— Narrative: BTC's 7-day log move divided by its normal 7-day swing, measured over the 30 days before the run-in. At +{EXECUTE_Z_THRESHOLD} or more, short. At −{EXECUTE_Z_THRESHOLD} or less, long.</li>
          <li>— Entries: one third at market, then limits 0.75% and 1.5% further into the move. Unfilled limits cancel 12h after the event.</li>
          <li>— Stop: past the 3-day swing plus a 0.5% buffer. The trade is skipped if the stop is more than 3% from the first entry.</li>
          <li>— Size: 3% of equity at risk, with notional capped at 3× equity. One trade at a time.</li>
          <li>— Exits: at +2%, close half and move the stop to breakeven. The runner trails 1.5% once it's 4% in profit. All positions close 96h after the event.</li>
          <li>— Any rule change gets a new version, and its forward record starts again from zero.</li>
        </ul>
      </section>
    </div>
    <SiteFooter />
  </main>;
}

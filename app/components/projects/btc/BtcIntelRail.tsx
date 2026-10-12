"use client";
import { useEffect, useRef, useState } from "react";
import type { BtcSnapshot } from "./btcData";
import { formatBtcPrice, formatPct } from "./btcData";
import { findMetric, formatUsdMn, type BtcFlowData } from "./useBtcFlowData";
import { freshness, formatTimestamp, sumSessions, venueInMode, type GlobeMode, type BtcMarket, type BtcMarketResponse } from "./marketData";
import { VENUES, MINING_REGIONS, MINING_SOURCE, type Venue, type MiningRegion } from "./nodes";
import { FLOW_ROUTES } from "./flowRoutes";
import { ORANGE_CSS } from "../btcTrackerShared";

type Markets = BtcMarketResponse & { loading: boolean; now: number };
const kicker = "font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]";
const rowButton = "w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-[var(--depth-2)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#e0873a]";
const money = (n: number | null, quote = "USD") => n === null ? "—" : `${(n / (n >= 1e9 ? 1e9 : 1e6)).toFixed(2)}${n >= 1e9 ? "B" : "M"} ${quote}`;
const number = (n: number | null, digits = 2) => n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

export function venueStatus(v: Venue, markets: Markets, flows: BtcFlowData): string {
  const market = markets.markets.find((m) => m.locus === v.id);
  if (market) return markets.errors[market.locus] ? "delayed" : freshness(market.asOf, markets.now);
  if (v.id === "coinbase" || v.id === "bybit") return markets.loading ? "loading" : "unavailable";
  if (v.id === "etf_us") {
    const flow = findMetric(flows.metrics, v.id, "etf_flow_usd_mn");
    return flow ? flows.error ? "delayed" : freshness(`${flow.periodDate}T00:00:00Z`, markets.now, 4 * 86_400_000) === "live" ? "daily" : "delayed"
      : flows.status === "loading" ? "loading" : "unavailable";
  }
  return "watchlist";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-sm border border-[var(--line)] p-2.5"><p className={kicker}>{label}</p><p className="mt-1 break-words font-mono text-sm tabular-nums text-[var(--ink)]">{value}</p></div>;
}

function MarketDetail({ market, error, now }: { market: BtcMarket; error?: string; now: number }) {
  return <div className="mt-3 space-y-3">
    <p className="font-mono text-xl tabular-nums">{formatBtcPrice(market.price)} <span className="text-xs text-[var(--ink-3)]">{market.quote}</span></p>
    <div className="grid grid-cols-2 gap-2">
      <Metric label="24h change" value={market.change24h === null ? "—" : formatPct(market.change24h)} />
      <Metric label="Bid/ask spread" value={market.spreadBps === null ? "—" : market.spreadBps > 0 && market.spreadBps < 0.01 ? "<0.01 bps" : `${market.spreadBps.toFixed(2)} bps`} />
      <Metric label="24h volume" value={`${number(market.volumeBtc, 0)} BTC`} />
      {market.locus === "bybit" ? <>
        <Metric label="Open interest" value={money(market.openInterest, market.quote)} />
        <Metric label="Funding / interval" value={market.fundingPct === null ? "—" : `${market.fundingPct > 0 ? "+" : ""}${market.fundingPct.toFixed(4)}%`} />
        <Metric label="24h turnover" value={money(market.turnover, market.quote)} />
      </> : <Metric label="Instrument" value="BTC-USD spot" />}
    </div>
    {market.nextFundingAt && <p className="text-[10px] text-[var(--ink-3)]">Next funding · {formatTimestamp(market.nextFundingAt)}</p>}
    {market.locus === "bybit" && <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">Positive funding: longs pay shorts. Negative funding: shorts pay longs. Rate is per funding interval, not annualised. USDT is the quote currency.</p>}
    <p className="text-[10px] text-[var(--ink-3)]">{market.source} · {error ? "delayed" : freshness(market.asOf, now)}<br />{formatTimestamp(market.asOf)}</p>
    {error && <p role="status" className="text-[11px] text-[var(--ink-2)]">{error} Showing the last observation.</p>}
  </div>;
}

function EtfDetail({ flows }: { flows: BtcFlowData }) {
  const flow = findMetric(flows.metrics, "etf_us", "etf_flow_usd_mn");
  const assets = findMetric(flows.metrics, "etf_us", "etf_holdings_usd_mn");
  const rows = flows.series.filter((r) => Number.isFinite(r.value)).slice().sort((a, b) => a.periodDate.localeCompare(b.periodDate)).slice(-30);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const five = sumSessions(flows.series, 5), twenty = sumSessions(flows.series, 20);
  return <div className="mt-3 space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <Metric label="Latest daily flow" value={flow ? formatUsdMn(flow.value) : "—"} />
      <Metric label="Fund assets · USD" value={assets ? money(assets.value * 1e6) : "—"} />
      <Metric label="5 reported sessions" value={five === null ? "—" : formatUsdMn(five)} />
      <Metric label="20 reported sessions" value={twenty === null ? "—" : formatUsdMn(twenty)} />
    </div>
    {rows.length ? <figure>
      <figcaption className={kicker}>Daily net flows · last {rows.length} reports</figcaption>
      <svg viewBox="0 0 300 100" className="mt-2 h-24 w-full" role="img" aria-label="ETF daily net flow chart. Bars above zero are inflows; bars below zero are outflows.">
        <line x1="0" x2="300" y1="50" y2="50" stroke="var(--line)" />
        {rows.map((r, i) => { const height = Math.abs(r.value) / max * 44; return <rect key={r.periodDate} x={i * 300 / rows.length + 1} y={r.value >= 0 ? 50 - height : 50} width={Math.max(1, 300 / rows.length - 2)} height={Math.max(1, height)} fill={r.value >= 0 ? ORANGE_CSS : "#bd7182"}><title>{r.periodDate}: {formatUsdMn(r.value)}</title></rect>; })}
      </svg>
      <div className="flex justify-between text-[9px] text-[var(--ink-3)]"><span>{rows[0].periodDate}</span><span>{rows[rows.length - 1].periodDate}</span></div>
      <details className="mt-2 text-[10px] text-[var(--ink-3)]"><summary className="cursor-pointer">View flow values</summary><ul className="mt-2 max-h-32 overflow-y-auto">{rows.slice().reverse().map((r) => <li key={r.periodDate} className="flex justify-between py-1"><span>{r.periodDate}</span><span>{formatUsdMn(r.value)}</span></li>)}</ul></details>
    </figure> : <p role="status" className="text-[11px] text-[var(--ink-3)]">{flows.status === "loading" ? "Loading ETF history…" : flows.seriesError ?? "No reported flow history available."}</p>}
    {flow && <p className="text-[10px] text-[var(--ink-3)]">{flow.source} · daily report {flow.periodDate}<br />Observed {formatTimestamp(flow.observedAt)}</p>}
    {assets && <p className="text-[10px] text-[var(--ink-3)]">Assets report · {assets.periodDate}</p>}
    {(flows.error || flows.seriesError) && <p role="status" className="text-[11px] text-[var(--ink-2)]">{flows.error ?? flows.seriesError}</p>}
    <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">Fund assets are measured in USD, not a count of Bitcoin. Rolling totals use reported sessions; missing reports are not filled with zero.</p>
  </div>;
}

export default function BtcIntelRail({ narrow, mode, selected, onVenue, onMining, onRoute, onClose, snapshot, flows, markets }: {
  narrow: boolean; mode: GlobeMode; selected: string | null; onVenue: (v: Venue) => void;
  onMining: (m: MiningRegion) => void; onRoute: (id: string) => void; onClose: () => void; snapshot: BtcSnapshot; flows: BtcFlowData; markets: Markets;
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [selected, mode]);
  const venue = VENUES.find((v) => v.id === selected);
  const mine = MINING_REGIONS.find((m) => `mine:${m.id}` === selected);
  const route = FLOW_ROUTES.find((r) => `route:${r.id}` === selected);
  const flow = findMetric(flows.metrics, "etf_us", "etf_flow_usd_mn");
  const coinbase = markets.markets.find((m) => m.locus === "coinbase");
  const bybit = markets.markets.find((m) => m.locus === "bybit");
  const selectedMarket = markets.markets.find((m) => m.locus === venue?.id);
  const price = coinbase?.price ?? (snapshot.source === "live" ? snapshot.price.value : null);
  const asOf = coinbase?.asOf ?? snapshot.asOf;
  const priceState = coinbase && markets.errors.coinbase ? "delayed" : price === null ? "unavailable" : freshness(asOf, markets.now);
  const expanded = !narrow || mobileExpanded || !!selected;
  const filtered = VENUES.filter((v) => venueInMode(v.kind, v.id, mode) && `${v.name} ${v.kind}`.toLowerCase().includes(query.toLowerCase()));
  const updates: { id: string; text: string; detail: string }[] = [];
  if (flow) updates.push({ id: "etf_us", text: `US ETFs · ${flow.value > 0 ? "inflow" : flow.value < 0 ? "outflow" : "flat"} ${formatUsdMn(flow.value)}`, detail: `${flow.periodDate} · ${venueStatus(VENUES.find((v) => v.id === "etf_us")!, markets, flows)}` });
  if (coinbase?.change24h !== null && coinbase?.change24h !== undefined) updates.push({ id: "coinbase", text: `US spot · ${formatPct(coinbase.change24h)} in 24h`, detail: `Coinbase · ${venueStatus(VENUES.find((v) => v.id === "coinbase")!, markets, flows)}` });
  if (bybit?.fundingPct !== null && bybit?.fundingPct !== undefined) updates.push({ id: "bybit", text: `Perpetual funding · ${bybit.fundingPct.toFixed(4)}%`, detail: `Bybit · ${venueStatus(VENUES.find((v) => v.id === "bybit")!, markets, flows)}` });
  const modeUpdates = updates.filter((item) => {
    const v = VENUES.find((v) => v.id === item.id)!;
    return venueInMode(v.kind, v.id, mode);
  });
  return <aside aria-label="Bitcoin intelligence" className={`absolute z-20 flex flex-col rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.94)] backdrop-blur-md ${narrow ? `inset-x-3 bottom-16 ${expanded ? "max-h-[46vh]" : ""}` : "bottom-6 right-6 top-4 w-[340px]"}`}>
    <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
      <div className="flex items-center justify-between"><p className={kicker}>BTC · Market intelligence</p>{narrow && <button type="button" aria-expanded={expanded} onClick={() => { if (selected) onClose(); setMobileExpanded(!expanded); }} className="px-2 py-1 text-xs text-[var(--ink-2)]">{expanded ? "Collapse ▾" : "Explore ▴"}</button>}</div>
      <div className="mt-2 flex items-baseline justify-between gap-2"><p className="font-mono text-xl tabular-nums">{price === null ? "Price unavailable" : `$${formatBtcPrice(price)}`}</p><span className={kicker}>{priceState}</span></div>
      <p className="mt-1 text-[10px] text-[var(--ink-3)]">{price === null ? "Waiting for an observed market price" : `${coinbase ? "Coinbase spot" : "Stored BTC price"} · ${formatTimestamp(asOf)}`}</p>
    </div>
    {expanded && <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
      {selected ? <section>
        <div className="flex items-start justify-between gap-3"><div><p className={kicker}>{venue ? `${venue.kind} · ${venueStatus(venue, markets, flows)}` : mine ? `Mining reference · ${mine.asOf}` : "Illustrative relationship"}</p><h3 className="mt-1 text-base font-medium">{venue?.title ?? mine?.name ?? route?.name}</h3></div><button type="button" onClick={onClose} aria-label="Close detail panel" className="px-2 py-1 text-xs text-[var(--ink-2)]">✕</button></div>
        {venue?.id === "etf_us" ? <EtfDetail flows={flows} /> : selectedMarket ?
          <MarketDetail market={selectedMarket} now={markets.now} error={markets.errors[selectedMarket.locus]} /> :
          venue && (venue.id === "coinbase" || venue.id === "bybit") ?
            <p role="status" className="mt-3 text-xs leading-relaxed text-[var(--ink-2)]">{markets.loading ? "Loading public market data…" : markets.errors[venue.id] ?? "Market feed unavailable. Retrying automatically."}</p> :
            venue ? <p className="mt-3 text-xs leading-relaxed text-[var(--ink-2)]">{venue.note}</p> : null}
        {mine && <><p className="mt-3 font-mono text-2xl">~{(mine.hashrateShare * 100).toFixed(0)}%</p><p className="mt-1 text-xs text-[var(--ink-3)]">Illustrative hashrate share · {mine.asOf}</p><p className="mt-3 text-xs leading-relaxed text-[var(--ink-2)]">{MINING_SOURCE}. This layer represents hashpower geography; it does not locate stored coins.</p></>}
        {route && <><p className="mt-3 text-xs leading-relaxed text-[var(--ink-2)]">A conceptual link between liquidity hubs. Direction and width do not measure observed Bitcoin transfers.</p><div className="mt-3 space-y-2">{route.gates.map((id) => { const v = VENUES.find((v) => v.id === id); return v ? <button key={id} type="button" className={rowButton} onClick={() => onVenue(v)}><span className="text-xs">{v.name}</span><span className={`ml-2 ${kicker}`}>{venueStatus(v, markets, flows)} ↗</span></button> : null; })}</div></>}
      </section> : <section aria-label={mode === "mining" ? "Mining geography" : "What changed"}>
        <h3 className={kicker}>{mode === "mining" ? "Mining geography" : "What changed"}</h3>
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">{mode === "mining" ? "Illustrative country shares · 2024 reference" : mode === "etfs" ? "Latest reported daily flow" : mode === "spot" ? "Latest 24h spot move" : mode === "derivatives" ? "Current perpetual funding" : "Latest daily flow, 24h move and current funding"}</p>
        <div className="mt-3 space-y-2">{modeUpdates.map((item) => <button key={item.id} type="button" className={rowButton} onClick={() => onVenue(VENUES.find((v) => v.id === item.id)!)}><p className="font-mono text-[11px]" style={{ color: ORANGE_CSS }}>{item.text}</p><p className={`mt-1 ${kicker}`}>{item.detail} ↗</p></button>)}</div>
        {!modeUpdates.length && <p role="status" className="mt-3 text-xs text-[var(--ink-2)]">{mode === "mining" ? "Select a region to explore the reference geography. Country shares are illustrative, not live telemetry." : markets.loading || flows.status === "loading" ? "Loading market observations…" : "Market feeds are unavailable. Explore the venue directory below; feeds retry automatically."}</p>}
      </section>}
      <section className="mt-5 border-t border-[var(--line)] pt-3" aria-label="Location directory">
        <label className={kicker} htmlFor="btc-venue-search">{mode === "mining" ? "Mining regions" : "Venue directory"}</label>
        <input id="btc-venue-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search locations…" className="mt-2 w-full rounded-sm border border-[var(--line)] bg-transparent px-2 py-2 text-xs outline-none focus:border-[#e0873a]" />
        <div className="mt-2 space-y-1">{mode === "mining" ? MINING_REGIONS.filter((m) => m.id !== "other" && m.name.toLowerCase().includes(query.toLowerCase())).map((m) => <button key={m.id} type="button" className={`${rowButton} flex justify-between gap-2`} onClick={() => onMining(m)}><span className="text-xs">{m.name}</span><span className={kicker}>Reference · {m.asOf}</span></button>) : filtered.map((v) => <button key={v.id} type="button" className={`${rowButton} flex justify-between gap-2`} onClick={() => onVenue(v)} aria-pressed={selected === v.id}><span className="text-xs">{v.name}</span><span className={kicker}>{venueStatus(v, markets, flows)}</span></button>)}</div>
        {mode !== "mining" && !filtered.length && <p className="mt-2 text-xs text-[var(--ink-3)]">No matching venues.</p>}
        {mode === "overview" && <details className="mt-4"><summary className={`cursor-pointer py-2 ${kicker}`}>Illustrative connections</summary><div className="mt-2 space-y-1">{FLOW_ROUTES.map((r) => <button key={r.id} type="button" className={rowButton} onClick={() => onRoute(r.id)}><span className="text-[10px]">{r.name} ↗</span></button>)}</div></details>}
      </section>
    </div>}
    {expanded && <p className="shrink-0 border-t border-[var(--line)] px-4 py-2 text-[9px] leading-relaxed text-[var(--ink-3)]">Pins mark liquidity hubs, not custody locations. Market feeds refresh every minute; ETF reports are daily.</p>}
  </aside>;
}

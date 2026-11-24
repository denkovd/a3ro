import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import TradingViewWidget from "../components/TradingViewWidget";
import { ASX_NAMES, SAVED_SCREENS, marketIndexUrl } from "../../lib/marketLinks";
import { searchIndex } from "../../lib/assets";
import AssetSearch from "../assets/AssetSearch";
import { COFER_URL, WORLD_ASSETS, WORLD_ASSETS_CHECKED, getReserveShares } from "../../lib/globalMarkets";
import { CurrencySharesChart, WorldAssetsChart } from "./ShareCharts";

// Reserve shares are refreshed from the IMF at most once a day.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Markets — A3RO Intelligence",
  description: "The world's assets and reserve currencies, the ASX's largest companies, and saved screens.",
};

/** Widget tabs: every name in ASX_NAMES lands in exactly one tab. */
/** Global overview tabs. CFD/futures symbols: TradingView's free widgets don't show most index feeds directly. */
const GLOBAL_TABS = [
  { title: "Indices", symbols: [{ s: "FOREXCOM:SPXUSD", d: "S&P 500" }, { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" }, { s: "FOREXCOM:DJI", d: "Dow 30" }, { s: "INDEX:NKY", d: "Nikkei 225" }, { s: "INDEX:DEU40", d: "DAX" }, { s: "FOREXCOM:UKXGBP", d: "FTSE 100" }] },
  { title: "Futures", symbols: [{ s: "COMEX:GC1!", d: "Gold" }, { s: "NYMEX:CL1!", d: "WTI crude" }, { s: "COMEX:HG1!", d: "Copper" }, { s: "CBOT:ZN1!", d: "US 10-year note" }] },
  { title: "Currencies", symbols: [{ s: "FX:AUDUSD", d: "AUD/USD" }, { s: "FX:EURUSD", d: "EUR/USD" }, { s: "FX:USDJPY", d: "USD/JPY" }, { s: "FX:GBPUSD", d: "GBP/USD" }, { s: "FX_IDC:AUDCNY", d: "AUD/CNY" }] },
];

const SECTOR_TABS: { title: string; sectors: string[] }[] = [
  { title: "Resources", sectors: ["Resources", "Energy"] },
  { title: "Financials", sectors: ["Banks", "Financials"] },
  { title: "Consumer", sectors: ["Consumer"] },
  { title: "Health, tech & other", sectors: ["Health care", "Technology", "Telecoms", "Property", "Infrastructure"] },
];

export default async function MarketsPage() {
  const reserves = await getReserveShares();
  const tabs = [
    // TradingView's free widgets don't show S&P/ASX index symbols (ASX:XJO etc.), so the index tab
    // uses the ASX-listed ETFs that track each index.
    { title: "Index", symbols: [{ s: "ASX:STW", d: "S&P/ASX 200 (STW ETF)" }, { s: "ASX:VAS", d: "S&P/ASX 300 (VAS ETF)" }, { s: "ASX:ISO", d: "S&P/ASX Small Ordinaries (ISO ETF)" }] },
    ...SECTOR_TABS.map((tab) => ({ title: tab.title, symbols: ASX_NAMES.filter((n) => tab.sectors.includes(n.sector)).map((n) => ({ s: `ASX:${n.code}`, d: n.name })) })),
  ];

  return <main className="relative min-h-screen">
    <Nav />
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-6 pb-20 pt-36 md:px-10">
      <header>
        <p className="landing-kicker">Markets</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Markets at a glance</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">Where the world&rsquo;s money sits, the ASX&rsquo;s largest companies, and the screens we watch. ASX prices and charts come from TradingView; company detail links go to Market Index.</p>
        <div className="mt-6 max-w-xl"><AssetSearch items={searchIndex()} /></div>
      </header>

      <section aria-labelledby="global-markets">
        <h2 id="global-markets" className="text-lg font-medium">Global markets</h2>
        <p className="mt-1 mb-4 max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">Major stock indices, futures and currencies, priced in their own markets. Index and futures prices are from TradingView and may be delayed.</p>
        <TradingViewWidget widget="market-overview" height={480} label="Global market overview" config={{ showChart: true, showSymbolLogo: true, dateRange: "12M", tabs: GLOBAL_TABS }} />
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Currencies: today&rsquo;s moves</h3>
            <p className="mt-1 mb-4 text-xs text-[var(--ink-3)]">Each cell is one currency against another (row against column), including the Australian dollar.</p>
            <TradingViewWidget widget="forex-heat-map" height={420} label="Forex heatmap" config={{ currencies: ["USD", "EUR", "JPY", "GBP", "CNY", "AUD", "CAD", "CHF"] }} />
          </div>
          <div>
            <h3 className="text-sm font-medium">US market breadth</h3>
            <p className="mt-1 mb-4 text-xs text-[var(--ink-3)]">S&amp;P 500 companies sized by market value and coloured by today&rsquo;s move: a quick read of how broad a rally or sell-off is.</p>
            <TradingViewWidget widget="stock-heatmap" height={420} label="S&P 500 heatmap" config={{ dataSource: "SPX500", grouping: "sector", blockSize: "market_cap_basic", blockColor: "change", hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true }} />
          </div>
        </div>
      </section>

      <section aria-labelledby="world-assets">
        <h2 id="world-assets" className="text-lg font-medium">The world&rsquo;s assets</h2>
        <p className="mt-1 mb-6 max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">A rough guide only: the estimated total value of each asset class and its share of the whole. The figures come from the latest published estimates, which cover different dates, and are updated by hand each quarter. Bitcoin is coins in circulation times a recent price.</p>
        <WorldAssetsChart assets={WORLD_ASSETS} checked={WORLD_ASSETS_CHECKED} />
      </section>

      <section aria-labelledby="currencies">
        <h2 id="currencies" className="text-lg font-medium">Reserve currencies</h2>
        <p className="mt-1 mb-6 max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">
          Each currency&rsquo;s share of the world&rsquo;s official foreign-exchange reserves, {reserves.quarter}. Source: <a href={COFER_URL} target="_blank" rel="noreferrer" className="underline">IMF COFER</a>{reserves.live ? "" : " (latest saved figures)"}.
        </p>
        <CurrencySharesChart shares={reserves.shares} />
      </section>

      <section aria-labelledby="asx" className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 id="asx" className="text-lg font-medium">ASX</h2>
          <p className="mt-1 mb-4 text-xs text-[var(--ink-3)]">Delayed prices. Switch tabs for the index and each sector. Indices are shown through the ETFs that track them.</p>
          <TradingViewWidget widget="market-overview" height={520} label="ASX market overview"
            config={{ tabs, showChart: true, showSymbolLogo: true, dateRange: "12M" }} />
        </div>
        <div>
          <h3 className="text-sm font-medium">Company detail</h3>
          <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
            {ASX_NAMES.map((n) => <li key={n.code} className="flex items-center justify-between gap-3 py-2">
              <span><span className="font-mono text-xs text-[var(--ink-2)]">{n.code}</span> {n.name}</span>
              <span className="flex shrink-0 gap-4 font-mono text-[11px] text-[var(--ink-3)]">
                <a href={marketIndexUrl(n.code)} target="_blank" rel="noopener" className="underline hover:text-[var(--ink)]">Market Index ↗</a>
                <a href={`/assets/asx-${n.code.toLowerCase()}`} className="underline hover:text-[var(--ink)]">Chart and notes</a>
              </span>
            </li>)}
          </ul>
        </div>
      </section>

      <section aria-labelledby="screens">
        <h2 id="screens" className="text-lg font-medium">Screens</h2>
        <p className="mt-1 text-xs text-[var(--ink-3)]">Saved screens on other sites. We pick the filters; they keep the numbers current.</p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {SAVED_SCREENS.map((s) => <article key={s.id} className="rounded-sm border border-[var(--line)] p-6">
            <h3 className="text-base font-medium">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{s.summary}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {s.filters.map((f) => <li key={f} className="rounded-sm border border-[var(--line)] px-2 py-1 font-mono text-[10px] text-[var(--ink-3)]">{f}</li>)}
            </ul>
            <a href={s.url} target="_blank" rel="noopener" className="sweep mt-5 inline-block font-mono text-xs uppercase tracking-[0.2em]">Open on {s.source} ↗</a>
          </article>)}
        </div>
      </section>
    </div>
    <SiteFooter />
  </main>;
}

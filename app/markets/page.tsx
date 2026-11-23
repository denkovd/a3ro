import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import TradingViewWidget from "../components/TradingViewWidget";
import { ASX_NAMES, SAVED_SCREENS, marketIndexUrl, tradingViewAsxUrl } from "../../lib/marketLinks";
import { COFER_URL, WORLD_ASSETS, WORLD_ASSETS_CHECKED, getReserveShares } from "../../lib/globalMarkets";
import { CurrencySharesChart, WorldAssetsChart } from "./ShareCharts";

// Reserve shares are refreshed from the IMF at most once a day.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Markets — A3RO Intelligence",
  description: "The world's assets and reserve currencies, the ASX's largest companies, and saved screens.",
};

/** Widget tabs: every name in ASX_NAMES lands in exactly one tab. */
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
      </header>

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
                <a href={tradingViewAsxUrl(n.code)} target="_blank" rel="noopener" className="underline hover:text-[var(--ink)]">Chart ↗</a>
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

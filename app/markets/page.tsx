import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import TradingViewWidget from "../components/TradingViewWidget";
import { ASX_NAMES, SAVED_SCREENS, marketIndexUrl, tradingViewAsxUrl } from "../../lib/marketLinks";

export const metadata: Metadata = {
  title: "Markets — A3RO Intelligence",
  description: "The ASX's largest companies at a glance, plus saved screens such as free cash flow machines in uptrends.",
};

/** Widget tabs: every name in ASX_NAMES lands in exactly one tab. */
const SECTOR_TABS: { title: string; sectors: string[] }[] = [
  { title: "Resources", sectors: ["Resources", "Energy"] },
  { title: "Financials", sectors: ["Banks", "Financials"] },
  { title: "Consumer", sectors: ["Consumer"] },
  { title: "Health, tech & other", sectors: ["Health care", "Technology", "Telecoms", "Property", "Infrastructure"] },
];

export default function MarketsPage() {
  const tabs = [
    { title: "Index", symbols: [{ s: "ASX:XJO", d: "S&P/ASX 200" }, { s: "ASX:XKO", d: "S&P/ASX 300" }, { s: "ASX:XSO", d: "S&P/ASX Small Ordinaries" }] },
    ...SECTOR_TABS.map((tab) => ({ title: tab.title, symbols: ASX_NAMES.filter((n) => tab.sectors.includes(n.sector)).map((n) => ({ s: `ASX:${n.code}`, d: n.name })) })),
  ];

  return <main className="relative min-h-screen">
    <Nav />
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-6 pb-20 pt-36 md:px-10">
      <header>
        <p className="landing-kicker">Markets</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Markets at a glance</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">The ASX&rsquo;s largest companies and the screens we watch. Prices and charts come from TradingView; company detail links go to Market Index.</p>
      </header>

      <section aria-labelledby="asx" className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 id="asx" className="text-lg font-medium">ASX</h2>
          <p className="mt-1 mb-4 text-xs text-[var(--ink-3)]">Delayed prices. Switch tabs for the index and each sector.</p>
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

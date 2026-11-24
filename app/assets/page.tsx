// Asset directory and search (roadmap #38 / #39). Every asset we have a free page for, by kind.
import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import { ASSETS, assetPath, searchIndex, type AssetKind } from "../../lib/assets";
import { ASSET_NOTES } from "../../lib/assetNotes";
import AssetSearch from "./AssetSearch";

export const metadata: Metadata = {
  title: "Assets — charts and notes · A3RO Intelligence",
  description: "Charts and notes for ASX and US stocks, ETFs and crypto. Search by ticker or name.",
  alternates: { canonical: "/assets" },
};

const ORDER: { kind: AssetKind; title: string; open: boolean }[] = [
  { kind: "asx_stock", title: "ASX", open: true },
  { kind: "etf", title: "ETFs", open: true },
  { kind: "crypto", title: "Crypto", open: false },
  { kind: "us_stock", title: "US stocks", open: false },
];

export default function AssetsPage() {
  const withNotes = ASSETS.filter((a) => ASSET_NOTES[a.slug]);
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 pb-20 pt-36 md:px-10">
      <header className="flex flex-col gap-3">
        <p className="landing-kicker">Assets</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Charts and notes, {ASSETS.length} assets</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">
          Each page has a live chart and profile from TradingView and, where we&rsquo;ve written one, our notes on why it matters.
          Our trend reads for each asset are part of Premium.
        </p>
      </header>
      <div className="max-w-xl"><AssetSearch items={searchIndex()} /></div>

      {withNotes.length ? <section className="flex flex-col gap-3">
        <h2 className="landing-kicker">With A3RO notes</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {withNotes.map((a) => <li key={a.slug}><a href={assetPath(a)} className="block rounded-sm border border-[var(--line)] p-3 hover:border-[var(--line-2)]">
            <span className="font-mono text-sm">{a.ticker}</span> <span className="text-sm text-[var(--ink-2)]">{a.name}</span>
            <span className="mt-1 block text-xs text-[var(--ink-3)]">{ASSET_NOTES[a.slug].summary}</span>
          </a></li>)}
        </ul>
      </section> : null}

      {ORDER.map(({ kind, title, open }) => {
        const list = ASSETS.filter((a) => a.kind === kind).slice().sort((x, y) => x.ticker.localeCompare(y.ticker));
        return <details key={kind} open={open} className="group flex flex-col gap-3">
          <summary className="cursor-pointer list-none landing-kicker">{title} · {list.length} <span className="group-open:hidden">(show)</span></summary>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {list.map((a) => <li key={a.slug}><a href={assetPath(a)} className="hover:text-[var(--ink)]">
              <span className="font-mono text-[var(--ink)]">{a.ticker}</span> <span className="text-[var(--ink-3)]">{a.name}</span>
            </a></li>)}
          </ul>
        </details>;
      })}
      <p className="text-xs text-[var(--ink-3)]">Charts and prices by TradingView; stock data is delayed.</p>
    </section>
    <SiteFooter />
  </main>;
}

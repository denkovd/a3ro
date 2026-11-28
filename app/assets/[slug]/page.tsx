// Free asset page (roadmap #38): TradingView chart and profile, our notes, a Premium peek at the
// trend read, and links out. Public and indexable; built at deploy time for every asset in lib/assets.ts.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "../../components/Chrome";
import SiteFooter from "../../components/SiteFooter";
import NewsletterSignup from "../../components/NewsletterSignup";
import { ASSETS, KIND_LABEL, assetBySlug, assetPath, searchIndex, tradingViewUrl, type AssetEntry } from "../../../lib/assets";
import { ASSET_NOTES } from "../../../lib/assetNotes";
import { marketIndexUrl } from "../../../lib/marketLinks";
import AssetSearch from "../AssetSearch";
import { AssetWidgets } from "./AssetView";
import { AssetTrend, type RegimeFit } from "./AssetTrend";
import { CryptoUsage } from "./CryptoUsage";
import { trackerLinks } from "../../../lib/assetTrackers";
import { affinityFor } from "../../../backend/src/macro/vams";
import { CRYPTO_PROJECTS } from "../../../backend/src/crypto/projects";

export const dynamicParams = false;
export function generateStaticParams() {
  return ASSETS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const asset = assetBySlug((await params).slug);
  if (!asset) return {};
  const note = ASSET_NOTES[asset.slug];
  return {
    title: `${asset.name} (${asset.ticker}) chart and notes · A3RO`,
    description: note?.summary ?? `${asset.name} (${asset.ticker}): live chart, profile and links. ${KIND_LABEL[asset.kind]} on A3RO Intelligence.`,
    alternates: { canonical: assetPath(asset) },
  };
}

function outsideLinks(a: AssetEntry): { label: string; href: string; id: string }[] {
  const links = [{ label: "TradingView", href: tradingViewUrl(a.tv), id: "tradingview" }];
  if (a.kind === "asx_stock") links.push({ label: "Market Index", href: marketIndexUrl(a.ticker), id: "marketindex" });
  if (a.kind === "us_stock") links.push({ label: "Stock Analysis", href: `https://stockanalysis.com/stocks/${a.ticker.toLowerCase().replace(/\./g, "-")}/`, id: "stockanalysis" });
  if (a.kind === "etf") links.push({ label: "Stock Analysis", href: `https://stockanalysis.com/etf/${a.ticker.toLowerCase()}/`, id: "stockanalysis" });
  return links;
}

/** Regime fit (#38): the asset's own entry in the regime map, or the market an ETF tracks. */
const FIT_VIA: Record<string, { symbol: string; label: string }> = {
  SPY: { symbol: "^GSPC", label: "The S&P 500" }, VOO: { symbol: "^GSPC", label: "The S&P 500" }, IVV: { symbol: "^GSPC", label: "The S&P 500" },
  QQQ: { symbol: "^NDX", label: "The Nasdaq 100" }, DIA: { symbol: "^DJI", label: "The Dow" }, IWM: { symbol: "^RUT", label: "The Russell 2000" },
  GLD: { symbol: "GC=F", label: "Gold" }, IAU: { symbol: "GC=F", label: "Gold" }, SLV: { symbol: "SI=F", label: "Silver" },
  USO: { symbol: "CL=F", label: "Crude oil" }, CPER: { symbol: "HG=F", label: "Copper" },
};
function regimeFit(a: AssetEntry): RegimeFit | null {
  if (!a.trendSymbol) return null;
  const via = FIT_VIA[a.ticker];
  const f = affinityFor(via?.symbol ?? a.trendSymbol);
  if (!f.bullish.length && !f.bearish.length) return null;
  return { bullish: [...f.bullish], bearish: [...f.bearish], via: via?.label ?? null };
}

const DAY = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function AssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const asset = assetBySlug((await params).slug);
  if (!asset) notFound();
  const note = ASSET_NOTES[asset.slug];
  const trackers = trackerLinks(asset.slug);
  const cryptoProject = asset.kind === "crypto" ? CRYPTO_PROJECTS.find((p) => p.symbol.toUpperCase() === asset.ticker.toUpperCase()) : undefined;
  const related = ASSETS.filter((a) => a.kind === asset.kind && a.slug !== asset.slug && (asset.sector ? a.sector === asset.sector : true)).slice(0, 8);

  return <main className="relative min-h-screen">
    <Nav />
    <article className="mx-auto flex max-w-5xl flex-col gap-10 px-6 pb-20 pt-36 md:px-10">
      <header className="flex flex-col gap-3">
        <p className="landing-kicker"><a href="/assets" className="hover:text-[var(--ink)]">Assets</a> · {KIND_LABEL[asset.kind]}{asset.sector ? ` · ${asset.sector}` : ""}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{asset.name} <span className="font-mono text-[var(--ink-3)]">{asset.ticker}</span></h1>
        {note ? <p className="max-w-2xl text-base leading-relaxed text-[var(--ink-2)]">{note.summary}</p> : null}
      </header>

      <AssetWidgets slug={asset.slug} tv={asset.tv} profile={asset.kind !== "crypto"} />

      {note ? <section className="flex max-w-3xl flex-col gap-4">
        <h2 className="landing-kicker">A3RO notes · updated {DAY.format(new Date(`${note.updated}T00:00:00Z`))}</h2>
        {note.body.map((p, i) => <p key={i} className="text-base leading-relaxed text-[var(--ink)]">{p}</p>)}
        {note.watching?.length ? <>
          <h3 className="landing-kicker">What we&rsquo;re watching</h3>
          <ul className="list-disc pl-5 text-sm leading-relaxed text-[var(--ink-2)]">{note.watching.map((w) => <li key={w}>{w}</li>)}</ul>
        </> : null}
      </section> : null}

      {asset.trendSymbol ? <AssetTrend ticker={asset.ticker} name={asset.name} trendSymbol={asset.trendSymbol} universe={ASSETS.filter((a) => a.trendSymbol).length} fit={regimeFit(asset)} /> : null}

      {cryptoProject ? <CryptoUsage projectId={cryptoProject.id} ticker={asset.ticker} /> : null}

      {trackers.length ? <section aria-labelledby="asset-globes" className="flex max-w-3xl flex-col gap-3">
        <h2 id="asset-globes" className="landing-kicker">{asset.ticker} on the Commodity Watch globes</h2>
        <ul className="flex flex-col gap-2">{trackers.map((t) => <li key={t.href}>
          <a href={t.href} className="flex flex-col gap-0.5 rounded-sm border border-[var(--line)] px-4 py-3 hover:border-[var(--line-2)]">
            <span className="text-sm font-medium">{t.tracker} →</span>
            {t.role ? <span className="text-xs leading-relaxed text-[var(--ink-3)]">{t.role}</span> : null}
          </a>
        </li>)}</ul>
      </section> : null}

      <section className="flex flex-col gap-3">
        <h2 className="landing-kicker">More on {asset.ticker}</h2>
        <div className="flex flex-wrap gap-6">
          {outsideLinks(asset).map((l) => <a key={l.id} href={l.href} target="_blank" rel="noopener nofollow" data-track-outbound={l.id}
            className="sweep font-mono text-xs uppercase tracking-[0.2em]">{l.label} ↗</a>)}
        </div>
      </section>

      <NewsletterSignup context={`asset:${asset.slug}`} title="The A3RO weekly"
        blurb="The week's macro read for Australia and the US, what has flipped, and what's coming up. Free, every Monday evening." />

      {related.length ? <section className="flex flex-col gap-3">
        <h2 className="landing-kicker">Related</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {related.map((a) => <li key={a.slug}><a href={assetPath(a)} className="hover:text-[var(--ink)]"><span className="font-mono">{a.ticker}</span> <span className="text-[var(--ink-3)]">{a.name}</span></a></li>)}
        </ul>
      </section> : null}

      <div className="max-w-xl"><AssetSearch items={searchIndex()} /></div>
    </article>
    <SiteFooter />
  </main>;
}

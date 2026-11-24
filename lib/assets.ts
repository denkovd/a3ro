/* ────────────────────────────────────────────────────────────────
   Free asset pages (roadmap #38) and asset search (#39).

   One page per asset at /assets/<slug>: a TradingView chart and
   profile (they show the numbers, delayed) plus our own write-up
   where we have one (lib/assetNotes.ts). Names and tickers only come
   from our lists; no market data of ours is shown, so the pages stay
   public (#18). Premium (Bull Market Finder) holds our trend reads.

   Upgrade path: our own asset page (#6) once data is licensed.
──────────────────────────────────────────────────────────────── */
import { CRYPTO, ETFS, NDX_EXTRA, SP500 } from "../backend/src/bull/universeData";
import { ASX_NAMES } from "./marketLinks";

export type AssetKind = "us_stock" | "asx_stock" | "etf" | "crypto";

export interface AssetEntry {
  /** URL slug: lower case, letters, digits and dashes. */
  slug: string;
  /** Ticker as people type it: AAPL, BRK.B, BHP, BTC. */
  ticker: string;
  name: string;
  kind: AssetKind;
  /** TradingView symbol for the widgets. */
  tv: string;
  /** Yahoo-notation symbol in the Bull Market Finder universe, when it's there (Premium trend read). */
  trendSymbol: string | null;
  /** ASX sector, from lib/marketLinks.ts. */
  sector?: string;
}

export const KIND_LABEL: Record<AssetKind, string> = {
  us_stock: "US stock",
  asx_stock: "ASX stock",
  etf: "ETF",
  crypto: "Crypto",
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function build(): AssetEntry[] {
  const out: AssetEntry[] = [];
  const seen = new Set<string>();
  const push = (e: AssetEntry) => {
    if (seen.has(e.slug)) return;
    seen.add(e.slug);
    out.push(e);
  };
  for (const [code, name] of [...SP500, ...NDX_EXTRA]) {
    push({ slug: slugify(code), ticker: code, name, kind: "us_stock", tv: code, trendSymbol: code.replace(/\./g, "-") });
  }
  for (const [code, name] of ETFS) push({ slug: slugify(code), ticker: code, name, kind: "etf", tv: code, trendSymbol: code });
  for (const [sym, name] of CRYPTO) {
    const base = sym.replace(/-USD$/, "");
    // CRYPTO:<BASE>USD is TradingView's cross-exchange index, so no one venue is implied.
    push({ slug: `${slugify(base)}-usd`, ticker: base, name, kind: "crypto", tv: `CRYPTO:${base}USD`, trendSymbol: sym });
  }
  for (const a of ASX_NAMES) {
    push({ slug: `asx-${slugify(a.code)}`, ticker: a.code, name: a.name, kind: "asx_stock", tv: `ASX:${a.code}`, trendSymbol: null, sector: a.sector });
  }
  return out;
}

export const ASSETS: readonly AssetEntry[] = build();
const BY_SLUG = new Map(ASSETS.map((a) => [a.slug, a]));

export function assetBySlug(slug: string): AssetEntry | null {
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

export const assetPath = (a: Pick<AssetEntry, "slug">) => `/assets/${a.slug}`;

/** TradingView's own page for a symbol, for anything we don't cover. */
export function tradingViewUrl(tv: string): string {
  const [exchange, symbol] = tv.includes(":") ? tv.split(":") : [null, tv];
  return `https://www.tradingview.com/symbols/${exchange ? `${exchange}-${symbol}` : symbol}/`;
}

/** Search entry sent to the browser: just enough to match and link. */
export interface SearchItem { s: string; t: string; n: string; k: AssetKind }
export const searchIndex = (): SearchItem[] => ASSETS.map((a) => ({ s: a.slug, t: a.ticker, n: a.name, k: a.kind }));

/**
 * Rank matches for a query: exact ticker, then ticker prefix, then name word prefix, then anywhere
 * in the name. Case and dots/dashes are ignored ("brk b" finds BRK.B).
 */
export function searchAssets<T extends { t: string; n: string }>(items: readonly T[], query: string, limit = 12): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/[.\-\s/]+/g, "");
  const q = norm(query);
  if (!q) return [];
  const qWords = query.toLowerCase().trim();
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const t = norm(item.t);
    const n = item.n.toLowerCase();
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 80 - (t.length - q.length);
    else if (n.split(/[\s\-.&]+/).some((w) => w.startsWith(qWords))) score = 50;
    else if (n.startsWith(qWords)) score = 45;
    else if (norm(n).includes(q)) score = 20;
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.item.t.localeCompare(b.item.t)).slice(0, limit).map((s) => s.item);
}

/* Which Commodity Watch globes an asset page should link to (asset pages, #38).
   Copper, iron ore, LNG and uranium come from each tracker's own listed-company table (matched by
   TradingView symbol or the table's assetSlug), with the role the tracker gives the company.
   Oil, gold and BTC have no company table, so a short hand list covers the obvious ones. */
import { COMPANIES as COPPER } from "./copper/reference";
import { COMPANIES as IRON_ORE } from "./ironore/reference";
import { COMPANIES as LNG } from "./lng/reference";
import { COMPANIES as URANIUM } from "./uranium/fuelChain";
import { assetBySlug } from "./assets";

export interface TrackerLink { tracker: string; href: string; role: string | null }

const US_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "NYSEARCA", "BATS"]);
const slugFromTv = (tv: string): string | null => {
  const [ex, code] = tv.split(":");
  if (!code) return null;
  if (ex === "ASX") return `asx-${code.toLowerCase()}`;
  if (US_EXCHANGES.has(ex)) return code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return null;
};

const TABLES: { tracker: string; href: string; companies: readonly { tv: string; role: string; assetSlug?: string }[] }[] = [
  { tracker: "Copper Tracker", href: "/Projects/Copper-Tracker", companies: COPPER },
  { tracker: "Iron Ore Tracker", href: "/Projects/Iron-Ore-Tracker", companies: IRON_ORE },
  { tracker: "LNG Tracker", href: "/Projects/LNG-Tracker", companies: LNG },
  { tracker: "Uranium Tracker", href: "/Projects/Uranium-Tracker", companies: URANIUM },
];

const HAND: { tracker: string; href: string; slugs: string[]; role: string }[] = [
  { tracker: "BTC Tracker", href: "/Projects/BTC-Tracker", slugs: ["btc-usd", "ibit", "fbtc", "gbtc", "mstr", "coin"], role: "Where Bitcoin trades and is held: exchanges, spot ETFs and mining" },
  { tracker: "Gold Tracker", href: "/Projects/Gold-Tracker", slugs: ["gld", "iau", "gdx", "nem", "asx-nst", "asx-evn", "asx-nem"], role: "Gold's mines, holders and trading hubs" },
  { tracker: "Oil Tracker", href: "/Projects/Oil-Tracker", slugs: ["xom", "cvx", "cop", "oxy", "eog", "uso", "xle", "asx-wds", "asx-sto"], role: "Oil shipping chokepoints, refineries and benchmark prices" },
];

export function trackerLinks(slug: string): TrackerLink[] {
  const out: TrackerLink[] = [];
  for (const t of TABLES) {
    const hit = t.companies.find((c) => c.assetSlug === slug || slugFromTv(c.tv) === slug);
    if (hit) out.push({ tracker: t.tracker, href: t.href, role: hit.role });
  }
  for (const h of HAND) if (h.slugs.includes(slug) && assetBySlug(slug)) out.push({ tracker: h.tracker, href: h.href, role: h.role });
  return out;
}

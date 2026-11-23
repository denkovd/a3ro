/* ────────────────────────────────────────────────────────────────
   Free v1 market coverage by link-out (roadmap #42 / #43).
   We write the commentary; TradingView, Market Index and Finviz show
   the numbers. Edit these lists freely: the /markets page reads them.
   Upgrade paths: ASX in Bull Market Finder (#22), our own FCF filter (#14).
──────────────────────────────────────────────────────────────── */

export interface AsxName { code: string; name: string; sector: string }

/** Starter list: the largest ASX names across the main sectors. */
export const ASX_NAMES: readonly AsxName[] = [
  { code: "BHP", name: "BHP Group", sector: "Resources" },
  { code: "RIO", name: "Rio Tinto", sector: "Resources" },
  { code: "FMG", name: "Fortescue", sector: "Resources" },
  { code: "WDS", name: "Woodside Energy", sector: "Energy" },
  { code: "CBA", name: "Commonwealth Bank", sector: "Banks" },
  { code: "NAB", name: "National Australia Bank", sector: "Banks" },
  { code: "WBC", name: "Westpac", sector: "Banks" },
  { code: "ANZ", name: "ANZ Group", sector: "Banks" },
  { code: "MQG", name: "Macquarie Group", sector: "Financials" },
  { code: "QBE", name: "QBE Insurance", sector: "Financials" },
  { code: "CSL", name: "CSL", sector: "Health care" },
  { code: "WES", name: "Wesfarmers", sector: "Consumer" },
  { code: "WOW", name: "Woolworths", sector: "Consumer" },
  { code: "COL", name: "Coles", sector: "Consumer" },
  { code: "TLS", name: "Telstra", sector: "Telecoms" },
  { code: "GMG", name: "Goodman Group", sector: "Property" },
  { code: "TCL", name: "Transurban", sector: "Infrastructure" },
  { code: "REA", name: "REA Group", sector: "Technology" },
  { code: "XRO", name: "Xero", sector: "Technology" },
  { code: "ALL", name: "Aristocrat Leisure", sector: "Consumer" },
];

export const marketIndexUrl = (code: string) => `https://www.marketindex.com.au/asx/${code.toLowerCase()}`;
export const tradingViewAsxUrl = (code: string) => `https://www.tradingview.com/symbols/ASX-${code}/`;

export interface SavedScreen { id: string; title: string; summary: string; url: string; source: string; filters: string[] }

/**
 * Saved screens we link to instead of computing ourselves. The FCF screen is a starting point:
 * adjust the filters on Finviz, then paste the new URL here.
 */
export const SAVED_SCREENS: readonly SavedScreen[] = [
  {
    id: "fcf-machines",
    title: "Free cash flow machines",
    summary: "US companies worth $2bn or more, trading under 20 times free cash flow: businesses that turn a lot of their value into cash.",
    url: "https://finviz.com/screener.ashx?v=111&f=cap_midover,fa_pfcf_u20&o=-marketcap",
    source: "Finviz",
    filters: ["Market cap over $2bn", "Price / free cash flow under 20"],
  },
];

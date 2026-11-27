/* ────────────────────────────────────────────────────────────────
   Module access list (roadmap #33 / #34) — the one place that says
   who can see what.

   public   anyone, signed in or not
   premium  signed-in accounts with Premium (user_access.premium, set by
            an admin from /owner/users today, by payments later). Admins
            always have Premium.
   admin    admin tools: only an email listed in OWNER_EMAILS (fails
            closed when unset)

   Anyone can create an account; an account alone opens nothing that is
   not public. `data` records the licensing basis (#18): open-data
   modules can be public with attribution; market-data modules are never
   public. Middleware enforces this list on pages and APIs; the UI uses
   it only to hide links.
──────────────────────────────────────────────────────────────── */

export type AccessLevel = "public" | "premium" | "admin";
export type DataBasis = "open" | "market";

export interface ModuleAccess {
  id: string;
  label: string;
  level: AccessLevel;
  data: DataBasis;
  /** Page routes (exact path or path prefix). */
  pages: readonly string[];
  /** API route prefixes serving this module's data. */
  apis: readonly string[];
  /** What the module does, shown on the private page to visitors who can't open it yet (#35). */
  preview?: string;
  /** Admin tools: everyone else gets a plain 404, not the Premium page. */
  hidden?: boolean;
}

export const MODULE_ACCESS: readonly ModuleAccess[] = [
  { id: "australia", label: "Australia Watch", level: "public", data: "open", pages: ["/Projects/Australia-Watch"], apis: ["/api/australia-watch"] },
  { id: "dividend", label: "AI Dividend", level: "public", data: "open", pages: ["/Projects/AI-Dividend"], apis: ["/api/dividend"] },
  { id: "commodity", label: "Commodity Watch (oil corridors)", level: "public", data: "open", pages: ["/Projects/Oil-Tracker"], apis: ["/api/oil"] },
  { id: "crypto", label: "Crypto (usage scorecard)", level: "public", data: "open", pages: ["/Projects/Crypto-Fundamentals"], apis: ["/api/crypto/fundamentals", "/api/crypto/exchanges"] },
  // Market caps are market data (#18): the valuation ratios are Premium, served apart from the free scorecard.
  { id: "crypto-valuation", label: "Crypto valuation (market caps, ratios)", level: "premium", data: "market", pages: [], apis: ["/api/crypto/valuation"],
    preview: "On the Crypto page: each project's market cap against the fees users pay and the revenue it keeps (price-to-fees, price-to-revenue) with 12 months of history, stablecoins' share of the whole crypto market, and Solana and memecoin baskets measured against SOL and BTC." },
  { id: "uranium", label: "Commodity Watch (uranium fuel chain)", level: "public", data: "open", pages: ["/Projects/Uranium-Tracker"], apis: [] },
  // ABS exports (CC BY), USGS and WA Government reference figures; the price is a TradingView widget (#55).
  { id: "ironore", label: "Commodity Watch (iron ore)", level: "public", data: "open", pages: ["/Projects/Iron-Ore-Tracker"], apis: ["/api/ironore"] },
  // ABS exports, CME warehouse stock counts (no prices) and USGS reference figures; price is a TradingView widget (#56).
  { id: "copper", label: "Commodity Watch (copper)", level: "public", data: "open", pages: ["/Projects/Copper-Tracker"], apis: ["/api/copper"] },
  // ABS exports and IGU / company reference figures; price is a TradingView widget (#57).
  { id: "lng", label: "Commodity Watch (LNG)", level: "public", data: "open", pages: ["/Projects/LNG-Tracker"], apis: ["/api/lng"] },
  { id: "macro", label: "Macro view", level: "public", data: "open", pages: [], apis: ["/api/macro", "/api/capital"] },
  { id: "trend", label: "Bull Market Finder", level: "premium", data: "market", pages: ["/Projects/Bull-Market-Finder", "/Projects/Regime-Finder"], apis: ["/api/bull"],
    preview: "Finds the assets that have just turned bullish on both daily and weekly closes, ranked by how recent and how strong the turn is, with a chart and profile for each." },
  { id: "earnings", label: "Earnings Beat Leaderboard", level: "premium", data: "market", pages: ["/Projects/Earnings-Beat"], apis: ["/api/leaderboard", "/api/watchlist"],
    preview: "Ranks companies by how consistently they beat earnings expectations quarter after quarter, and by how big the surprises are." },
  { id: "regime", label: "US regime", level: "premium", data: "market", pages: ["/Projects/Regime-Shift"],
    // The backtest file is served from public/ (9 MB, too big for a function response), so the gate covers it here (#92).
    apis: ["/api/regime", "/data/regime-backtest.json"],
    preview: "Places the US economy in one of four growth and inflation regimes from official releases, then checks whether markets are pricing the same regime." },
  { id: "gold", label: "Gold", level: "premium", data: "market", pages: ["/Projects/Gold-Tracker"], apis: ["/api/gold"],
    preview: "Follows gold across its main trading hubs, with prices, COMEX vault stocks and the macro drivers behind the moves." },
  { id: "ops", label: "Admin tools", level: "admin", data: "open", pages: ["/owner"], apis: ["/api/owner"], hidden: true },
  // The page stays open (roadmap #123) so free visitors get a free TradingView BTC chart; the globe and
  // all its data come from /api/btc, which is Premium. TradingView widgets stay on public pages only (#37).
  { id: "btc", label: "BTC", level: "premium", data: "market", pages: [], apis: ["/api/btc"],
    preview: "Follows bitcoin across major venues, with price, market structure and the macro backdrop in one view." },
  // The page stays open so free visitors see the next pivot (from the public /api/execute-peek, calendar only);
  // signals, the paper position and the track records come from /api/execute, which is Premium.
  { id: "execute", label: "Execute", level: "premium", data: "market", pages: [], apis: ["/api/execute"],
    preview: "Tracks a rules-based BTC strategy around FOMC and CPI releases: the live signal before each event, a forward paper-trade record and the hypothetical backtest." },
];

/**
 * Price sources that may be shown publicly (roadmap #18 / #58): official open data only.
 * Yahoo Finance, Alpha Vantage and other market-data feeds stay Premium-only.
 */
export const OPEN_DATA_PRICE_SOURCES: readonly string[] = ["eia", "fred"];

export function isOpenDataPriceSource(sourceId: string): boolean {
  return OPEN_DATA_PRICE_SOURCES.includes(sourceId);
}

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

export interface PathAccess { module: ModuleAccess; kind: "page" | "api" }

/** Admin overrides from the Ops controls (#52), keyed by module id. */
export type LevelOverrides = Readonly<Record<string, AccessLevel | null | undefined>>;

/** Who is asking: signed in or not, with Premium, an admin. */
export interface Viewer { signedIn: boolean; premium: boolean; admin: boolean }
export const ANONYMOUS: Viewer = { signedIn: false, premium: false, admin: false };

/**
 * A module's level after admin overrides. Only public ⇄ premium can be switched: market-data
 * modules can never become public (licensing, #18), and admin tools can never be opened up.
 */
export function effectiveLevel(module: ModuleAccess, overrides: LevelOverrides = {}): AccessLevel {
  const override = overrides[module.id];
  if (!override || module.level === "admin" || override === "admin") return module.level;
  if (override === "public" && module.data === "market") return module.level;
  return override;
}

/** Whether a viewer may open something at this level. */
export function viewerCanOpen(level: AccessLevel, viewer: Viewer): boolean {
  if (level === "public") return true;
  if (level === "premium") return viewer.premium || viewer.admin;
  return viewer.admin;
}

/** The module a path belongs to (any level), or null when it isn't a module path. */
export function moduleForPath(pathname: string): PathAccess | null {
  // Paths are matched case-sensitively, as Next routes them; normalise trailing slashes only.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const module of MODULE_ACCESS) {
    if (module.pages.some((p) => matches(path, p))) return { module, kind: "page" };
    if (module.apis.some((p) => matches(path, p))) return { module, kind: "api" };
  }
  return null;
}

/** The gated module a path belongs to, or null when the path is public or not a module path. */
export function gatedModuleForPath(pathname: string, overrides: LevelOverrides = {}): PathAccess | null {
  const hit = moduleForPath(pathname);
  return hit && effectiveLevel(hit.module, overrides) !== "public" ? hit : null;
}

export function isGatedPath(pathname: string): boolean {
  return gatedModuleForPath(pathname) !== null;
}

/** Admins are listed by email in OWNER_EMAILS (comma-separated). Unset or empty means nobody is an admin. */
export function isAdminEmail(email: string | null | undefined, ownerEmails = process.env.OWNER_EMAILS): boolean {
  if (!email || !ownerEmails) return false;
  const owners = ownerEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return owners.includes(email.trim().toLowerCase());
}

/** A signed-in user is an admin only if their email is listed AND confirmed (Google emails arrive confirmed). */
export function isAdminUser(user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined, ownerEmails = process.env.OWNER_EMAILS): boolean {
  return Boolean(user?.email_confirmed_at) && isAdminEmail(user?.email, ownerEmails);
}

/** Page routes a viewer may be linked to (module switcher, homepage). */
export function canSeeRoute(route: string, viewer: Viewer): boolean {
  const hit = moduleForPath(route);
  return !hit || viewerCanOpen(hit.module.level, viewer);
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

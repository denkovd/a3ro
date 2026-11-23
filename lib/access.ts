/* ────────────────────────────────────────────────────────────────
   Module access list (roadmap #33 / #34) — the one place that says
   who can see what.

   public     anyone
   owner      only an email listed in OWNER_EMAILS (fails closed when unset)
   subscriber reserved for paid tiers (#27); treated as owner-only for now

   `data` records the licensing basis (#18): open-data modules can be
   public with attribution; market-data modules stay owner-only until
   the data is licensed. Middleware enforces this list on pages and
   APIs; the UI uses it only to hide links.
──────────────────────────────────────────────────────────────── */

export type AccessLevel = "public" | "owner" | "subscriber";
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
}

export const MODULE_ACCESS: readonly ModuleAccess[] = [
  { id: "australia", label: "Australia Watch", level: "public", data: "open", pages: ["/Projects/Australia-Watch"], apis: ["/api/australia-watch"] },
  { id: "dividend", label: "AI Dividend", level: "public", data: "open", pages: ["/Projects/AI-Dividend"], apis: ["/api/dividend"] },
  { id: "commodity", label: "Commodity Watch (oil corridors)", level: "public", data: "open", pages: ["/Projects/Oil-Tracker"], apis: ["/api/oil"] },
  { id: "macro", label: "Macro view", level: "public", data: "open", pages: [], apis: ["/api/macro", "/api/capital"] },
  { id: "trend", label: "Bull Market Finder", level: "owner", data: "market", pages: ["/Projects/Bull-Market-Finder", "/Projects/Regime-Finder"], apis: ["/api/bull"] },
  { id: "earnings", label: "Earnings Beat Leaderboard", level: "owner", data: "market", pages: ["/Projects/Earnings-Beat"], apis: ["/api/leaderboard", "/api/watchlist"] },
  { id: "regime", label: "US regime", level: "owner", data: "market", pages: ["/Projects/Regime-Shift"], apis: ["/api/regime"] },
  { id: "gold", label: "Gold", level: "owner", data: "market", pages: ["/Projects/Gold-Tracker"], apis: ["/api/gold"] },
  { id: "btc", label: "BTC", level: "owner", data: "market", pages: ["/Projects/BTC-Tracker"], apis: ["/api/btc"] },
];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

export interface PathAccess { module: ModuleAccess; kind: "page" | "api" }

/** The gated module a path belongs to, or null when the path is public or not a module path. */
export function gatedModuleForPath(pathname: string): PathAccess | null {
  // Paths are matched case-sensitively, as Next routes them; normalise trailing slashes only.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const module of MODULE_ACCESS) {
    if (module.level === "public") continue;
    if (module.pages.some((p) => matches(path, p))) return { module, kind: "page" };
    if (module.apis.some((p) => matches(path, p))) return { module, kind: "api" };
  }
  return null;
}

export function isGatedPath(pathname: string): boolean {
  return gatedModuleForPath(pathname) !== null;
}

/** Owners are listed by email in OWNER_EMAILS (comma-separated). Unset or empty means nobody is an owner. */
export function isOwnerEmail(email: string | null | undefined, ownerEmails = process.env.OWNER_EMAILS): boolean {
  if (!email || !ownerEmails) return false;
  const owners = ownerEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return owners.includes(email.trim().toLowerCase());
}

/** A signed-in user is the owner only if their email is listed AND confirmed (Google emails arrive confirmed). */
export function isOwnerUser(user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined, ownerEmails = process.env.OWNER_EMAILS): boolean {
  return Boolean(user?.email_confirmed_at) && isOwnerEmail(user?.email, ownerEmails);
}

/** Page routes a non-owner may be linked to (module switcher, homepage). */
export function canSeeRoute(route: string, owner: boolean): boolean {
  return owner || !isGatedPath(route);
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

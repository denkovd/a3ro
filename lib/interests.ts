// What a member can tick as interests on /account (roadmap #105). Used to shape the newsletter
// and to see which modules people want built next. Ids are stored in user_profiles.interests,
// so keep an id once used; change labels freely.
export interface Interest { id: string; label: string; group: "Modules" | "Topics" }

export const INTERESTS: readonly Interest[] = [
  { id: "australia", label: "Australia Watch", group: "Modules" },
  { id: "dividend", label: "AI Dividend", group: "Modules" },
  { id: "commodity", label: "Commodity Watch (oil, iron ore, copper, LNG, gold, uranium)", group: "Modules" },
  { id: "trend", label: "Bull Market Finder", group: "Modules" },
  { id: "earnings", label: "Earnings Beat Leaderboard", group: "Modules" },
  { id: "regime", label: "US regime", group: "Modules" },
  { id: "macro", label: "Macro and liquidity", group: "Topics" },
  { id: "asx", label: "ASX shares", group: "Topics" },
  { id: "us-stocks", label: "US shares", group: "Topics" },
  { id: "crypto", label: "Crypto", group: "Topics" },
  { id: "commodities", label: "Commodities and mining", group: "Topics" },
  { id: "property", label: "Australian property and housing", group: "Topics" },
  { id: "ai", label: "AI and tech", group: "Topics" },
  { id: "trading", label: "Trading strategies and backtests", group: "Topics" },
];

const IDS = new Set(INTERESTS.map((i) => i.id));

/** Known ids only, de-duplicated, in list order. */
export function cleanInterests(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > INTERESTS.length * 2) return null;
  const picked = new Set(value.filter((v): v is string => typeof v === "string" && IDS.has(v)));
  return INTERESTS.map((i) => i.id).filter((id) => picked.has(id));
}

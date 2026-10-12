/** Shared public-market contracts and display calculations; no server imports. */
export type BtcMarket = {
  locus: "coinbase" | "bybit";
  pair: string;
  quote: "USD" | "USDT";
  price: number;
  change24h: number | null;
  volumeBtc: number | null;
  turnover: number | null;
  spreadBps: number | null;
  fundingPct: number | null;
  openInterest: number | null;
  nextFundingAt: string | null;
  asOf: string;
  source: string;
};

export type BtcMarketResponse = {
  markets: BtcMarket[];
  errors: Partial<Record<BtcMarket["locus"], string>>;
};

export type GlobeMode = "overview" | "spot" | "derivatives" | "etfs" | "mining";
export const GLOBE_MODES: { id: GlobeMode; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "spot", label: "Spot" },
  { id: "derivatives", label: "Derivatives" }, { id: "etfs", label: "ETFs" },
  { id: "mining", label: "Mining" },
];

export function venueInMode(kind: string, id: string, mode: GlobeMode): boolean {
  return mode === "overview" || (mode === "spot" && kind === "exchange" && id !== "bybit") ||
    (mode === "derivatives" && (kind === "derivatives" || id === "bybit" || id === "okx")) ||
    (mode === "etfs" && kind === "etf");
}

export function freshness(asOf: string | undefined, now: number, maxAgeMs = 5 * 60_000): "live" | "delayed" | "unavailable" {
  const time = asOf ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(time) || time > now + 5 * 60_000) return "unavailable";
  return now - time > maxAgeMs ? "delayed" : "live";
}

export function formatTimestamp(iso: string): string {
  return Number.isFinite(Date.parse(iso)) ? `${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC` : "Time unavailable";
}

/** Count reported trading sessions, never assume calendar days or fill gaps with zero. */
export function sumSessions(series: { periodDate: string; value: number }[], count: number): number | null {
  const rows = Array.from(new Map(series.filter((r) => Number.isFinite(r.value)).map((r) => [r.periodDate, r])).values())
    .sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  return rows.length >= count ? rows.slice(-count).reduce((sum, row) => sum + row.value, 0) : null;
}

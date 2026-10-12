export type RevenueComparisonStatus = "available" | "missing" | "basis_unverified";

/** Finnhub's Alphabet calendar revenue excludes TAC, but the estimate's
 * basis is not identified. Do not score this pair until both bases are known.
 * Applies to existing cache rows as well as future ingestion, without
 * overwriting the original amounts or their source payloads. */
export function revenueComparisonStatus(
  ticker: string,
  source: string,
  actual: number | null,
  estimate: number | null,
  surprise: number | null,
): RevenueComparisonStatus {
  if (actual === null || estimate === null || estimate === 0) return "missing";
  if (source === "finnhub" && ["GOOG", "GOOGL"].includes(ticker.toUpperCase())) {
    return "basis_unverified";
  }
  return surprise === null ? "missing" : "available";
}

import type { Metadata } from "next";
import RegimeFinderView from "./view";

export const metadata: Metadata = {
  title: "Bull Market Finder 1 — A3RO Intelligence",
  description:
    "Macro-45 bullish-state screener (variant 1) — Money Line trend flips confirmed on daily and weekly closes across a 45-asset macro watchlist, ranked by recency and strength.",
};

export default function RegimeFinderPage() {
  return <RegimeFinderView />;
}

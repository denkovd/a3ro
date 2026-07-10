import type { Metadata } from "next";
import RegimeFinderView from "./view";

export const metadata: Metadata = {
  title: "Regime Finder — A3RO Intelligence",
  description:
    "Cross-asset regime intelligence — Money Line trend flips confirmed on daily and weekly closes across a 30-asset macro watchlist, ranked by recency and strength.",
};

export default function RegimeFinderPage() {
  return <RegimeFinderView />;
}

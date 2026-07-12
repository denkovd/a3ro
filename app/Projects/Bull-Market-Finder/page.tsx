import type { Metadata } from "next";
import BullMarketFinderView from "./view";

export const metadata: Metadata = {
  title: "A3RO — Bull Market Finder 2",
  description:
    "Whole-market bullish-state screener: ~650 assets across macro, US equities, crypto and ETFs, double-confirmed on daily and weekly closes and ranked by newly bullish state.",
};

export default function Page() {
  return <BullMarketFinderView />;
}

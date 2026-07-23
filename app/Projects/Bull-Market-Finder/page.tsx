import type { Metadata } from "next";
import BullMarketFinderView from "./view";

export const metadata: Metadata = {
  title: "A3RO — Bull Market Finder",
  description:
    "Whole-market bullish-state screener: ~670 assets across macro, US equities, crypto and ETFs, ranked by newly bullish state through switchable strategy lenses — Money Line D×W, weekly-only and daily-only.",
};

export default function Page() {
  return <BullMarketFinderView />;
}

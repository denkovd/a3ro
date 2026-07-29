import type { Metadata } from "next";
import RelativeStrengthView from "./view";

export const metadata: Metadata = {
  title: "A3RO — Relative Strength Matrix",
  description:
    "Cross-asset relative strength: multi-window RS, a percentile heatmap, an RRG-style quadrant view and a leadership rotation table, built entirely from the Bull Market Finder's scan universe.",
};

export default function Page() {
  return <RelativeStrengthView />;
}

import type { Metadata } from "next";
import BtcTrackerView from "./view";

export const metadata: Metadata = {
  title: "BTC Tracker — A3RO Intelligence",
  description:
    "Visual intelligence for where known Bitcoin concentrates and how liquidity flows — exchange loci, ETF stock, mining geography, and corridor-style liquidity paths.",
};

export default function BtcTrackerPage() {
  return <BtcTrackerView />;
}

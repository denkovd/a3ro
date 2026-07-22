import type { Metadata } from "next";
import GoldTrackerView from "./view";

export const metadata: Metadata = {
  title: "Gold Tracker — A3RO Intelligence",
  description:
    "Visual intelligence for where gold is mined, who holds known stock, and how metal and paper flow — mines, central banks, ETFs, COMEX, and vault hubs.",
};

export default function GoldTrackerPage() {
  return <GoldTrackerView />;
}

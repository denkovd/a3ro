import type { Metadata } from "next";
import OilTrackerView from "./view";

export const metadata: Metadata = {
  title: "Oil Tracker — A3RO Intelligence",
  description:
    "Live corridor intelligence for crude, products, and price-sensitive flows. A modeled preview of strategic chokepoints, demand shifts, and price pressure across the global oil system.",
};

export default function OilTrackerPage() {
  return <OilTrackerView />;
}

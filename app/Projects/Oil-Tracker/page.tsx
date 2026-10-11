import type { Metadata } from "next";
import OilTrackerView from "./view";

export const metadata: Metadata = {
  title: "Oil Tracker — A3RO Intelligence",
  description:
    "Explore refinery capacity, sourced operating events, fuel inventories, crude benchmarks and shipping corridors with dated observations and trends.",
};

export default function OilTrackerPage() {
  return <OilTrackerView />;
}

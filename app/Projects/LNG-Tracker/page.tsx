import type { Metadata } from "next";
import LngTrackerView from "./view";

export const metadata: Metadata = {
  title: "LNG Tracker — A3RO Intelligence",
  description:
    "A globe of the LNG trade: the biggest exporters and buyers, Australia's ten LNG plants, the 2026 Strait of Hormuz disruption, and Australia's monthly LNG exports by destination from the ABS.",
  alternates: { canonical: "/Projects/LNG-Tracker" },
};

export default function LngTrackerPage() {
  return <LngTrackerView />;
}

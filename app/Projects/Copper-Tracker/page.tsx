import type { Metadata } from "next";
import CopperTrackerView from "./view";

export const metadata: Metadata = {
  title: "Copper Tracker — A3RO Intelligence",
  description:
    "A globe of the copper trade: where copper is mined and refined, the big mines and supply disruptions, COMEX warehouse stocks, and Australia's monthly copper exports by destination from the ABS.",
  alternates: { canonical: "/Projects/Copper-Tracker" },
};

export default function CopperTrackerPage() {
  return <CopperTrackerView />;
}

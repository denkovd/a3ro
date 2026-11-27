import type { Metadata } from "next";
import IronOreTrackerView from "./view";

export const metadata: Metadata = {
  title: "Iron Ore Tracker — A3RO Intelligence",
  description:
    "A globe of the iron ore trade: who mines it, who buys it, the Pilbara mines and ports, and Australia's monthly export value by destination from the ABS. Sourced from the ABS, USGS and the WA Government.",
  alternates: { canonical: "/Projects/Iron-Ore-Tracker" },
};

export default function IronOreTrackerPage() {
  return <IronOreTrackerView />;
}

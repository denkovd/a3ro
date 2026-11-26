import type { Metadata } from "next";
import UraniumTrackerView from "./view";

export const metadata: Metadata = {
  title: "Uranium Tracker — A3RO Intelligence",
  description:
    "A globe of the civilian nuclear fuel chain: where uranium is mined, converted, enriched and made into fuel, and where the world's reactors are. Sourced from the World Nuclear Association and Geoscience Australia.",
  alternates: { canonical: "/Projects/Uranium-Tracker" },
};

export default function UraniumTrackerPage() {
  return <UraniumTrackerView />;
}

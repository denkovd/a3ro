import type { Metadata } from "next";
import BagholderRiskMapView from "./view";

export const metadata: Metadata = {
  title: "Bagholder Risk Map — A3RO Intelligence",
  description:
    "Narrative shock → trapped-cohort positioning → trigger/invalidator state machine. A spatial risk map of trapped cohorts across crypto, equities, macro and commodities, deterministically scored.",
};

export default function BagholderRiskMapPage() {
  return <BagholderRiskMapView />;
}

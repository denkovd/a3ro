import type { Metadata } from "next";
import RegimeShiftView from "./view";

export const metadata: Metadata = {
  title: "Regime Shift Finder — A3RO Intelligence",
  description:
    "Top-down macro regime — the Darius-Dale-style growth × inflation GRID (Goldilocks / Reflation / Inflation / Deflation) from free-tier FRED data, plus the Macro Override pressure read.",
};

export default function RegimeShiftPage() {
  return <RegimeShiftView />;
}

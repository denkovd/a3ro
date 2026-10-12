import type { Metadata } from "next";
import RegimeShiftView from "./view";

export const metadata: Metadata = {
  title: "US regime — A3RO Intelligence",
  description:
    "The current US growth × inflation regime (Goldilocks / Reflation / Inflation / Deflation), automatically updated from FRED releases, with cross-asset market confirmation and source dates.",
};

export default function RegimeShiftPage() {
  return <RegimeShiftView />;
}

import type { Metadata } from "next";
import MacroHorizonView from "./view";

export const metadata: Metadata = {
  title: "Macro Horizon — A3RO Intelligence",
  description: "Measured evidence, transparent 2026–2046 scenarios, stress screening and an investment-theme research workbench.",
};

export default function Page() {
  return <MacroHorizonView />;
}

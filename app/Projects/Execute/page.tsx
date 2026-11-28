import type { Metadata } from "next";
import ExecuteView from "./view";

export const metadata: Metadata = {
  title: "Execute — A3RO Intelligence",
  description: "A rules-based BTC research tracker around FOMC and CPI releases: the next pivot, the live signal, a forward paper-trade record and the hypothetical backtest.",
  robots: { index: false, follow: false }, // Premium module (lib/access.ts)
};

export default function ExecutePage() {
  return <ExecuteView />;
}

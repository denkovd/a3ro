import type { Metadata } from "next";
import AIDividendView from "./view";

export const metadata: Metadata = {
  title: "AI Dividend — A3RO Intelligence",
  description: "Measuring how much of AI’s rising capability turns into real output, who captures the value, and what could stop it.",
};

export default function Page() {
  return <AIDividendView />;
}

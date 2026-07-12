import type { Metadata } from "next";
import ThesisLabView from "./view";

export const metadata: Metadata = {
  title: "Thesis Lab — A3RO Intelligence",
  description:
    "Pressure-test a trading thesis against live market context — assumption extraction, fragility scoring, fake-confidence detection, bull/base/bear + tail scenarios, and a portfolio risk audit tying size to conviction.",
};

export default function ThesisLabPage() {
  return <ThesisLabView />;
}

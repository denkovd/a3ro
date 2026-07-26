import type { Metadata } from "next";
import NarrativeRotationView from "./view";

export const metadata: Metadata = {
  title: "A3RO — Narrative Rotation",
  description:
    "Which narrative is climbing: attention deltas across curated narratives (AI, energy, L2s, memes, uranium, gold miners), cross-sectionally z-scored over 1d/1w/1m windows and shown against market corroboration from the Bull Market Finder scan.",
};

export default function Page() {
  return <NarrativeRotationView />;
}

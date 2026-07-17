import type { Metadata } from "next";
import EarningsBeatView from "./view";

export const metadata: Metadata = {
  title: "A3RO — Earnings Beat Leaderboard",
  description:
    "Watchlist companies ranked by the size, consistency, and recency of their earnings beats — beat streaks walked over full cached history, surprise averages, and per-quarter beat maps on real Finnhub data.",
};

export default function Page() {
  return <EarningsBeatView />;
}

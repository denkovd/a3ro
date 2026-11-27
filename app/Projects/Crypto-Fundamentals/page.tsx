/* ────────────────────────────────────────────────────────────────
   /Projects/Crypto-Fundamentals — usage scorecard (roadmap #82).
   One yardstick for every project: who pays to use it, and how much.
   Data: DefiLlama's free API, one snapshot a day (GitHub Action
   crypto-fundamentals.yml). Free module, open data.
──────────────────────────────────────────────────────────────── */
import type { Metadata } from "next";
import { createDb, latestCryptoSnapshot, type CryptoSnapshot } from "@a3ro/oil-backend";
import { Nav } from "../../components/Chrome";
import SiteFooter from "../../components/SiteFooter";
import CryptoFundamentalsView from "./view";

export const metadata: Metadata = {
  title: "Crypto — who pays to use it · A3RO Intelligence",
  description: "A usage scorecard for Bitcoin, Ethereum, Solana, Hyperliquid and more: fees users pay, revenue, share of DeFi and stablecoins held on each chain, from DefiLlama.",
  alternates: { canonical: "/Projects/Crypto-Fundamentals" },
};

export const revalidate = 3600;

async function load(): Promise<CryptoSnapshot | null> {
  try { return await latestCryptoSnapshot(await createDb()); } catch { return null; }
}

export default async function CryptoFundamentalsPage() {
  const snap = await load();
  return <main className="relative min-h-screen">
    <Nav />
    <CryptoFundamentalsView snap={snap} />
    <SiteFooter />
  </main>;
}

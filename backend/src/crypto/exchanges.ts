/* ────────────────────────────────────────────────────────────────
   Exchange reserves (roadmap #127): assets held in the wallets an
   exchange has published, from DefiLlama's CEX transparency data
   (free /protocols list, category "CEX"). Open data.

   "Clean" assets leave out the exchange's own token (Binance's BNB,
   Bitfinex's LEO…), which it can print and which would be hard to sell
   in a crisis. The 7-day change includes price moves, so it is not a
   measure of deposits and withdrawals (DefiLlama's flow figures are a
   paid feature). Only exchanges that publish their wallets appear.
──────────────────────────────────────────────────────────────── */
export interface ExchangeReserve { name: string; slug: string; assets: number; ownTokens: number; clean: number; change1d: number | null; change7d: number | null }

type Rec = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function buildExchangeReserves(protocols: unknown, limit = 15): ExchangeReserve[] {
  if (!Array.isArray(protocols)) return [];
  return (protocols as Rec[])
    .filter((p) => p.category === "CEX" && (num(p.tvl) ?? 0) > 0)
    .map((p) => {
      const assets = num(p.tvl)!;
      const own = num(((p.chainTvls as Rec | undefined)?.OwnTokens as Rec | undefined)?.tvl) ?? 0;
      return { name: String(p.name).replace(/ CEX$/, ""), slug: String(p.slug ?? ""), assets, ownTokens: own, clean: Math.max(0, assets - own), change1d: num(p.change_1d), change7d: num(p.change_7d) };
    })
    .sort((a, b) => b.clean - a.clean)
    .slice(0, limit);
}

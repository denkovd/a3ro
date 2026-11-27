/* ────────────────────────────────────────────────────────────────
   Crypto valuation (roadmap #83 / #84): market caps from CoinGecko's
   public API (no key). Market data (#18): stored with the snapshot but
   only served to Premium (/api/crypto/valuation).

     /coins/markets?ids=…        market cap, fully diluted value, now
     /global                     total crypto market cap, now
     /coins/{id}/market_chart    daily market cap, last 365 days

   The public API allows only a few calls a minute, so calls are
   spaced and a 429 is retried once after a minute.
──────────────────────────────────────────────────────────────── */
import { CRYPTO_PROJECTS } from "./projects";
import type { Fetcher } from "./defillama";

export const GECKO = "https://api.coingecko.com/api/v3";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchMarketInputs(get: Fetcher, projects = CRYPTO_PROJECTS, spacingMs = 7000): Promise<{ markets: unknown; global: unknown; mcapCharts: Record<string, unknown>; problems: string[] }> {
  const problems: string[] = [];
  const call = async (label: string, url: string): Promise<unknown> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const v = await get(url); await sleep(spacingMs); return v; }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt === 0 && /429/.test(msg)) { await sleep(60_000); continue; }
        problems.push(`${label}: ${msg}`); return null;
      }
    }
    return null;
  };
  const ids = projects.map((p) => p.gecko).filter((x): x is string => !!x);
  const markets = await call("CoinGecko markets", `${GECKO}/coins/markets?vs_currency=usd&ids=${ids.join(",")}&per_page=250`);
  const global = await call("CoinGecko global", `${GECKO}/global`);
  const mcapCharts: Record<string, unknown> = {};
  for (const id of ids) mcapCharts[id] = await call(`CoinGecko ${id} history`, `${GECKO}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`);
  return { markets, global, mcapCharts, problems };
}

/* ────────────────────────────────────────────────────────────────
   Global markets figures (roadmap #68 / #69, upgrade path #15).

   World assets: published estimates, each with its source and date.
   They come out once or twice a year, so this list is edited by hand
   (re-check each quarter). Bitcoin is supply × a stored price, rounded.

   Currencies: share of the world's official foreign-exchange reserves,
   IMF COFER (open data), fetched live; FALLBACK_RESERVES is used if
   the IMF API doesn't answer.
──────────────────────────────────────────────────────────────── */

export interface AssetClass { id: string; label: string; valueTn: number; asOf: string; source: string; url: string; note?: string }

/** Checked 23 Nov 2026. */
export const WORLD_ASSETS: readonly AssetClass[] = [
  { id: "real-estate", label: "Real estate", valueTn: 393.3, asOf: "end 2024", source: "Savills", url: "https://impacts.savills.com/market-trends/how-much-is-global-real-estate-worth.html", note: "Homes $286.9T, commercial $58.5T, farmland $47.9T" },
  { id: "bonds", label: "Bonds", valueTn: 160.7, asOf: "end 2025", source: "SIFMA", url: "https://www.sifma.org/resources/research/fact-book/" },
  { id: "other-stocks", label: "Stocks outside the US", valueTn: 90.4, asOf: "Sep 2026", source: "World Federation of Exchanges", url: "https://focus.world-exchanges.org/issue/november-2026/market-statistics", note: "Member exchanges" },
  { id: "us-stocks", label: "US stocks", valueTn: 78.7, asOf: "Sep 2026", source: "World Federation of Exchanges", url: "https://focus.world-exchanges.org/issue/november-2026/market-statistics", note: "NYSE + Nasdaq" },
  { id: "gold", label: "Gold", valueTn: 30.0, asOf: "end Sep 2026", source: "World Gold Council", url: "https://www.gold.org/goldhub/data/how-much-gold", note: "224,200 tonnes above ground" },
  { id: "bitcoin", label: "Bitcoin", valueTn: 1.2, asOf: "22 Nov 2026", source: "Blockchain.com supply × price", url: "https://www.blockchain.com/explorer/charts/total-bitcoins", note: "20.1m coins, approximate" },
];

export interface CurrencyShare { code: string; label: string; share: number }
export interface ReserveShares { quarter: string; shares: CurrencyShare[]; live: boolean }

const CURRENCY_LABEL: Record<string, string> = {
  USD: "US dollar", EUR: "Euro", JPY: "Japanese yen", GBP: "British pound", CAD: "Canadian dollar",
  AUD: "Australian dollar", CNY: "Chinese renminbi", CHF: "Swiss franc", OTHC: "Other currencies",
};

/** IMF COFER 2026 Q2 (published 30 Sep 2026). */
export const FALLBACK_RESERVES: ReserveShares = {
  quarter: "2026 Q2", live: false,
  shares: [["USD", 56.7], ["EUR", 20.6], ["OTHC", 6.06], ["JPY", 4.96], ["GBP", 4.57], ["CAD", 2.47], ["AUD", 2.25], ["CNY", 2.11], ["CHF", 0.27]]
    .map(([code, share]) => ({ code: String(code), label: CURRENCY_LABEL[String(code)], share: Number(share) })),
};

export const COFER_URL = "https://data.imf.org/en/datasets/IMF.STA:COFER";
const COFER_API = "https://api.imf.org/external/sdmx/2.1/data/IMF.STA,COFER/G001.AFXRA..SHRO_PT.Q";

/** Parses the IMF SDMX-CSV for the latest quarter's shares. Returns null if anything is off. */
export function parseCofer(csv: string): ReserveShares | null {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  const col = (name: string) => header.indexOf(name);
  const [cCur, cPeriod, cValue] = [col("FXR_CURRENCY"), col("TIME_PERIOD"), col("OBS_VALUE")];
  if (cCur < 0 || cPeriod < 0 || cValue < 0) return null;
  const rows = lines.map((l) => l.split(",")).filter((r) => r[cValue] !== "" && Number.isFinite(Number(r[cValue])));
  const latest = rows.map((r) => r[cPeriod]).sort().at(-1);
  if (!latest) return null;
  const shares = rows.filter((r) => r[cPeriod] === latest)
    .map((r) => ({ code: r[cCur].replace(/^CI_/, ""), share: Math.round(Number(r[cValue]) * 100) / 100 }))
    .filter((s) => s.code in CURRENCY_LABEL)
    .map((s) => ({ ...s, label: CURRENCY_LABEL[s.code] }))
    .sort((a, b) => b.share - a.share);
  const total = shares.reduce((s, x) => s + x.share, 0);
  if (shares.length < 5 || Math.abs(total - 100) > 1.5) return null;
  return { quarter: latest.replace("-Q", " Q"), shares, live: true };
}

export async function getReserveShares(): Promise<ReserveShares> {
  try {
    const year = new Date().getUTCFullYear() - 1;
    const res = await fetch(`${COFER_API}?startPeriod=${year}-Q1`, {
      headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" },
      next: { revalidate: 86_400 }, signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return FALLBACK_RESERVES;
    return parseCofer(await res.text()) ?? FALLBACK_RESERVES;
  } catch {
    return FALLBACK_RESERVES;
  }
}

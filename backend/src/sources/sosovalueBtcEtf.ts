/* ────────────────────────────────────────────────────────────────
   SoSoValue free US spot Bitcoin ETF daily flow/AUM API.

   POST https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart
     Content-Type: application/json
     body: { "type": "us-btc-spot" }
     → { code: 0, data: [{ date, totalNetInflow, totalValueTraded,
                            totalNetAssets, cumNetInflow }, ...] }
     Keyless, ~300 daily rows (confirmed live 2026-07-23), USD units.

   Chosen over Farside Investors' public page (farside.co.uk/btc) after
   that page turned out to sit behind a Cloudflare bot challenge:
   confirmed live that plain `curl` gets a real 200, but Node's fetch
   (undici) — including from this exact server, same UA string, same
   headers — consistently gets a 403 "Just a moment..." challenge page.
   That's a TLS/HTTP2 client-fingerprint distinction, not a header
   problem, so it can't be fixed by spoofing more request headers, and
   deliberately spoofing a TLS fingerprint to pass a bot challenge is
   evasion this project doesn't build. SoSoValue's JSON API has no such
   gate and is a strictly better fit: real API (not HTML scraping) and
   it additionally reports `totalNetAssets` — genuine cumulative fund
   AUM, something Farside's page never had at all — so BTC gets both a
   flow and a holdings-analogue metric, closer to parity with Gold's
   ETF pair (etf_holdings_t + etf_flow_t).

   totalNetAssets is a USD dollar figure (fund AUM), not a BTC-denominated
   holdings count — same "proxy, not the literal coin count" caveat WGC's
   tonnes figure already carries for gold.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import type { BtcFlowMetricInput } from "../storage/btcFlowRepo";

const SOURCE_ID = "sosovalue-btc-etf";
const API_URL = "https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart";

export interface SosoValueFlowRow {
  date: string; // YYYY-MM-DD
  netInflowUsd: number;
  netAssetsUsd: number | null;
}

interface SosoValueResponse {
  code?: number;
  data?: Array<{
    date?: string;
    totalNetInflow?: number;
    totalNetAssets?: number;
  }>;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pure parse — fixture-tested. */
export function parseSosoValueFlows(body: SosoValueResponse): SosoValueFlowRow[] {
  const rows = body.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new SourceError(SOURCE_ID, "bad_payload", "SoSoValue response missing data[]");
  }
  const out: SosoValueFlowRow[] = [];
  for (const r of rows) {
    if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const netInflow = num(r.totalNetInflow);
    if (netInflow === null) continue;
    out.push({ date: r.date, netInflowUsd: netInflow, netAssetsUsd: num(r.totalNetAssets) });
  }
  if (out.length === 0) {
    throw new SourceError(SOURCE_ID, "bad_payload", "SoSoValue response produced zero usable rows");
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** SoSoValue's endpoint is POST-only with a JSON body, which the shared
 *  getJsonForSource helper (GET-only, used by every other keyless
 *  source in this codebase) doesn't support — so this fetches directly,
 *  mirroring comexGoldStocks.ts's manual AbortController pattern. */
export async function fetchSosoValueBtcFlows(): Promise<SosoValueFlowRow[]> {
  const timeoutMs = 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "us-btc-spot" }),
    });
  } catch (cause) {
    clearTimeout(timer);
    const timedOut = cause instanceof Error && cause.name === "AbortError";
    throw new SourceError(SOURCE_ID, "network", timedOut ? `timeout after ${timeoutMs}ms` : String(cause), {
      cause,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const kind =
      res.status === 401 || res.status === 403
        ? "auth"
        : res.status === 429
          ? "rate_limited"
          : res.status >= 500
            ? "upstream_error"
            : "bad_payload";
    throw new SourceError(SOURCE_ID, kind, `HTTP ${res.status} fetching SoSoValue BTC ETF flows`, {
      status: res.status,
    });
  }

  let body: SosoValueResponse;
  try {
    body = (await res.json()) as SosoValueResponse;
  } catch (cause) {
    throw new SourceError(SOURCE_ID, "bad_payload", "SoSoValue response is not JSON", { cause });
  }
  return parseSosoValueFlows(body);
}

export function sosovalueFlowsToMetrics(rows: SosoValueFlowRow[]): BtcFlowMetricInput[] {
  const metrics: BtcFlowMetricInput[] = [];
  for (const r of rows) {
    metrics.push({
      locus: "etf_us",
      metric: "etf_flow_usd_mn",
      periodDate: r.date,
      value: r.netInflowUsd / 1_000_000,
      unit: "usd_mn",
      source: SOURCE_ID,
      meta: { report: "sosovalue.xyz us-btc-spot", aggregate: "US spot BTC ETFs total (all funds)" },
    });
    if (r.netAssetsUsd !== null) {
      metrics.push({
        locus: "etf_us",
        metric: "etf_holdings_usd_mn",
        periodDate: r.date,
        value: r.netAssetsUsd / 1_000_000,
        unit: "usd_mn",
        source: SOURCE_ID,
        meta: { report: "sosovalue.xyz us-btc-spot", note: "fund AUM in USD, not a BTC-count" },
      });
    }
  }
  return metrics;
}

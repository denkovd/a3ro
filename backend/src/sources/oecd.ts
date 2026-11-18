import { startPeriodFor } from "../australia/watch";
import { oecdSpec } from "../australia/registry";
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";
import { parseSdmxCsv } from "./abs";

export const OECD_DATA_BASE = "https://sdmx.oecd.org/public/rest/data";

/**
 * OECD .Stat Suite SDMX-CSV. The public API is rate limited, so this is called once per series per
 * daily refresh (three requests). A 429 is reported as a degraded fetch like any other failure.
 */
/** Back-to-back requests to sdmx.oecd.org are throttled with 429 or a bare "Internal server error" 500. */
export const OECD_RETRY_DELAYS_MS = [5_000, 15_000];

export async function fetchOecdSeries(indicator: AustraliaIndicator, opts: { fetchImpl?: typeof fetch; now?: Date; retryDelaysMs?: readonly number[] } = {}): Promise<AustraliaObservation[]> {
  const now = opts.now ?? new Date();
  const cfg = oecdSpec(indicator);
  const sourceUrl = `${OECD_DATA_BASE}/${cfg.dataflow}/${cfg.key}?startPeriod=${startPeriodFor(indicator, now)}&format=csvfilewithlabels`;
  // Built as a variable so the backend's RequestInit typing (which lacks `cache`) accepts it.
  const requestOptions = { headers: { Accept: "application/vnd.sdmx.data+csv; charset=utf-8; labels=both" }, cache: "no-store" as const, signal: AbortSignal.timeout(30_000) };
  const delays = opts.retryDelaysMs ?? OECD_RETRY_DELAYS_MS;
  let response = await (opts.fetchImpl ?? fetch)(sourceUrl, requestOptions);
  for (const delay of delays) {
    if (response.ok || (response.status !== 429 && response.status < 500)) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    response = await (opts.fetchImpl ?? fetch)(sourceUrl, { ...requestOptions, signal: AbortSignal.timeout(30_000) });
  }
  if (!response.ok) throw new Error(`OECD HTTP ${response.status}`);
  return parseSdmxCsv(indicator, await response.text(), sourceUrl, now.toISOString(), "OECD");
}

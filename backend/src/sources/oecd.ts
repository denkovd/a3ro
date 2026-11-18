import { startPeriodFor } from "../australia/watch";
import { oecdSpec } from "../australia/registry";
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";
import { parseSdmxCsv } from "./abs";

export const OECD_DATA_BASE = "https://sdmx.oecd.org/public/rest/data";

/**
 * OECD .Stat Suite SDMX-CSV. The public API is rate limited, so this is called once per series per
 * daily refresh (three requests). A 429 is reported as a degraded fetch like any other failure.
 */
export async function fetchOecdSeries(indicator: AustraliaIndicator, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<AustraliaObservation[]> {
  const now = opts.now ?? new Date();
  const cfg = oecdSpec(indicator);
  const sourceUrl = `${OECD_DATA_BASE}/${cfg.dataflow}/${cfg.key}?startPeriod=${startPeriodFor(indicator, now)}&format=csvfilewithlabels`;
  // Built as a variable so the backend's RequestInit typing (which lacks `cache`) accepts it.
  const requestOptions = { headers: { Accept: "application/vnd.sdmx.data+csv; charset=utf-8; labels=both" }, cache: "no-store" as const, signal: AbortSignal.timeout(30_000) };
  const response = await (opts.fetchImpl ?? fetch)(sourceUrl, requestOptions);
  if (!response.ok) throw new Error(`OECD HTTP ${response.status}`);
  return parseSdmxCsv(indicator, await response.text(), sourceUrl, now.toISOString(), "OECD");
}

import { AUSTRALIA_SERIES, startPeriodFor } from "../australia/watch";
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";

function csvRow(line: string): string[] {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += c; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { out.push(value); value = ""; } else value += c;
  }
  out.push(value); return out;
}

/** Parses ABS labelled SDMX-CSV. Publication date is intentionally null: it is not present in this payload. */
export function parseAbsCsv(indicator: AustraliaIndicator, text: string, sourceUrl: string, retrievedAt: string): AustraliaObservation[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines[0] === "NoRecordsFound") throw new Error("ABS returned no observations");
  const header = csvRow(lines[0]); const col = (name: string) => header.indexOf(name);
  const required = ["TIME_PERIOD", "OBS_VALUE", "UNIT_MEASURE", "TSEST"];
  if (required.some((name) => col(name) < 0)) throw new Error("ABS CSV missing required columns");
  const config = AUSTRALIA_SERIES[indicator];
  return lines.slice(1).map(csvRow).flatMap((r) => {
    const raw = r[col("OBS_VALUE")]?.trim();
    if (!raw || raw === ".") return [];
    const period = r[col("TIME_PERIOD")];
    if (!(config.frequency === "monthly" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-Q[1-4]$/).test(period)) throw new Error("Invalid ABS reference period");
    const value = Number(raw);
    if (!Number.isFinite(value)) return [];
    return [{ indicator, title: config.title, value, unit: r[col("Unit of Measure")] || r[col("UNIT_MEASURE")],
      unitMultiplier: col("UNIT_MULT") >= 0 ? Number(r[col("UNIT_MULT")]) : null,
      frequency: config.frequency, adjustment: r[col("Adjustment Type")] || r[col("TSEST")], referencePeriod: r[col("TIME_PERIOD")], sourceUrl,
      publicationDate: null, sourceStatus: col("OBS_STATUS") >= 0 ? r[col("OBS_STATUS")] || null : null,
      sourceComment: col("OBS_COMMENT") >= 0 ? r[col("OBS_COMMENT")] || null : null,
      firstRetrievedAt: retrievedAt, lastVerifiedAt: retrievedAt }];
  }).sort((a, b) => a.referencePeriod.localeCompare(b.referencePeriod));
}

export async function fetchAbsSeries(indicator: AustraliaIndicator, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<AustraliaObservation[]> {
  const now = opts.now ?? new Date(); const cfg = AUSTRALIA_SERIES[indicator];
  const sourceUrl = `https://data.api.abs.gov.au/rest/data/${cfg.dataflow}/${cfg.key}?startPeriod=${startPeriodFor(indicator, now)}&format=csvfilewithlabels`;
  const response = await (opts.fetchImpl ?? fetch)(sourceUrl, { headers: { Accept: "application/vnd.sdmx.data+csv;labels=both" } });
  if (!response.ok) throw new Error(`ABS HTTP ${response.status}`);
  return parseAbsCsv(indicator, await response.text(), sourceUrl, now.toISOString());
}

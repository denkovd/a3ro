import { parseFredCsv } from "../../sources/fredMacro";
import { parseDividendCsv } from "../sources";
import type { DataCentresPayload, DroughtPayload, EiaPayload } from "../signals/types";

// ── EIA retail electricity sales and prices ──────────────────────

export const EIA_STATES = ["US", "VA"] as const;
export const EIA_SECTORS = ["ALL", "COM"] as const;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** EIA APIv2 `electricity/retail-sales` response → monthly rows for the states and sectors we track. */
export function parseEiaRetail(body: unknown): EiaPayload {
  const response = (body as { response?: { data?: unknown }; error?: unknown })?.response;
  if ((body as { error?: unknown })?.error) throw new Error("EIA returned an error body");
  if (!response || !Array.isArray(response.data)) throw new Error("Unexpected EIA response shape");
  const rows: EiaPayload["rows"] = [];
  for (const raw of response.data as Record<string, unknown>[]) {
    const period = String(raw.period ?? "");
    const state = String(raw.stateid ?? "");
    const sector = String(raw.sectorid ?? "");
    if (!/^\d{4}-\d{2}$/.test(period) || !(EIA_STATES as readonly string[]).includes(state) || !(EIA_SECTORS as readonly string[]).includes(sector)) continue;
    rows.push({ period, state, sector, sales: num(raw.sales), price: num(raw.price) });
  }
  if (rows.length < 24) throw new Error("EIA returned too few monthly rows");
  return { rows: rows.sort((a, b) => a.period.localeCompare(b.period) || a.state.localeCompare(b.state) || a.sector.localeCompare(b.sector)) };
}

export function eiaRetailUrl(apiKey: string, start: string): string {
  const params = new URLSearchParams({ api_key: apiKey, frequency: "monthly", start, length: "5000" });
  params.append("data[]", "sales");
  params.append("data[]", "price");
  for (const state of EIA_STATES) params.append("facets[stateid][]", state);
  for (const sector of EIA_SECTORS) params.append("facets[sectorid][]", sector);
  params.set("sort[0][column]", "period");
  params.set("sort[0][direction]", "asc");
  return `https://api.eia.gov/v2/electricity/retail-sales/data/?${params.toString()}`;
}

// ── FRED (IMF commodity prices) ──────────────────────────────────

export const FRED_SERIES = { uranium: "PURANUSDM", copper: "PCOPPUSDM" } as const;

export function parseFredPrices(csv: string, seriesId: string) {
  if (/<html/i.test(csv)) throw new Error(`FRED returned HTML for ${seriesId}`);
  const observations = parseFredCsv(csv);
  if (observations.length < 24) throw new Error(`FRED returned too few observations for ${seriesId}`);
  return observations;
}

// ── Epoch AI frontier data centres ───────────────────────────────

export const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"] as const;

const STATE_NAMES: Record<string, string> = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY" };

/**
 * State from a US address: the last "ST 12345" pair, else a spelled-out state
 * name ("Canton, Mississippi"). Longest names first so "West Virginia" wins over "Virginia".
 */
export function stateFromAddress(address: string): string | null {
  const codes = [...address.matchAll(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g)].map(match => match[1]).filter(code => (US_STATES as readonly string[]).includes(code));
  if (codes.length) return codes.at(-1)!;
  for (const name of Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${name}\\b`).test(address)) return STATE_NAMES[name];
  }
  return null;
}

const clean = (value: string | undefined) => (value ?? "").replace(/\s*#\w+/g, "").trim();

export function parseDataCentres(csv: string): DataCentresPayload {
  const rows = parseDividendCsv(csv);
  if (!rows[0] || !["Name", "Current power (MW)", "Country"].every(key => Object.hasOwn(rows[0], key))) throw new Error("Epoch data-centre CSV header changed");
  const sites: DataCentresPayload["sites"] = [];
  for (const row of rows) {
    const powerMw = num(row["Current power (MW)"]);
    if (!row.Name || powerMw === null || powerMw <= 0) continue;
    const country = row.Country ?? "";
    sites.push({
      name: row.Name, country,
      state: country === "United States" ? stateFromAddress(row.Address ?? "") : null,
      powerMw, h100e: num(row["Current H100 equivalents"]), capexBn: num(row["Current total capital cost (2025 USD billions)"]),
      owner: clean(row.Owner),
    });
  }
  if (sites.length < 5) throw new Error("Epoch data-centre CSV has too few sites");
  return { sites: sites.sort((a, b) => b.powerMw - a.powerMw) };
}

// ── US Drought Monitor ───────────────────────────────────────────

export const STATE_FIPS: Record<string, string> = { AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56" };

const usdmDate = (value: unknown) => {
  const text = String(value ?? "");
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
};

/**
 * One state's USDM response (statisticsType=1, cumulative): `d2` is the share
 * of the state's area in D2 (severe) drought or worse. Returns the latest week.
 */
export function parseDroughtState(state: string, body: unknown): DroughtPayload["states"][number] {
  if (!Array.isArray(body) || !body.length) throw new Error(`USDM returned no rows for ${state}`);
  const weeks = (body as Record<string, unknown>[]).map(row => {
    const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
    return { date: usdmDate(lower.mapdate ?? lower.validstart), d2: num(lower.d2) };
  }).filter((week): week is { date: string; d2: number } => week.date !== null && week.d2 !== null && week.d2 >= 0 && week.d2 <= 100);
  if (!weeks.length) throw new Error(`USDM rows for ${state} had no usable D2 values`);
  const latest = weeks.sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  return { state, date: latest.date, severeOrWorse: latest.d2 };
}

export function droughtUrl(fips: string, start: Date, end: Date): string {
  const us = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
  return `https://usdmdataservices.unl.edu/api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=${fips}&startdate=${encodeURIComponent(us(start))}&enddate=${encodeURIComponent(us(end))}&statisticsType=1`;
}

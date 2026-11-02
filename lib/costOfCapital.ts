export const CAPITAL_METHODOLOGY = "msci-trailing-pe-plus-monthly-10y-v1";

export const CAPITAL_MARKETS = [
  { id: "US", market: "United States", benchmark: "MSCI USA", code: "984000", slug: "msci-usa-index", timeZone: "America/New_York", bondDefinition: "Treasury constant-maturity yield" },
  { id: "CN", market: "China", benchmark: "MSCI China", code: "302400", slug: "msci-china-index", timeZone: "Asia/Shanghai", bondDefinition: "MOF–ChinaBond government par yield" },
  { id: "EA", market: "Eurozone", benchmark: "MSCI EMU", code: "106400", slug: "msci-emu-index", timeZone: "Europe/Berlin", bondDefinition: "ECB all-issuer euro-area government par yield" },
  { id: "CH", market: "Switzerland", benchmark: "MSCI Switzerland", code: "975600", slug: "msci-switzerland-index", timeZone: "Europe/Zurich", bondDefinition: "SNB Confederation zero-coupon spot yield" },
  { id: "JP", market: "Japan", benchmark: "MSCI Japan", code: "939200", slug: "msci-japan-index", timeZone: "Asia/Tokyo", bondDefinition: "MOF JGB constant-maturity yield" },
  { id: "GB", market: "United Kingdom", benchmark: "MSCI United Kingdom", code: "982600", slug: "msci-united-kingdom-index", timeZone: "Europe/London", bondDefinition: "BoE gilt nominal par yield" },
  { id: "AU", market: "Australia", benchmark: "MSCI Australia", code: "903600", slug: "msci-australia-index", timeZone: "Australia/Sydney", bondDefinition: "RBA interpolated government bond yield" },
] as const;

export type CapitalMarketId = typeof CAPITAL_MARKETS[number]["id"];
export type CapitalSource = { label: string; url: string };
export type EquityInput = { marketId: CapitalMarketId; asOf: string; priceEarnings: number; checkedAt: string; sourceUrl: string };
export type YieldPoint = { date: string; value: number };
export type HolidayOverride = { marketId: CapitalMarketId; asOf: string; lastTradingDay: string; sourceUrl: string; checkedAt: string };
export type BondInput = { asOf: string; bondYield: number; observations: YieldPoint[]; sourceUrl: string; checkedAt: string; holidayCalendar?: HolidayOverride };
export type CapitalObservation = {
  marketId: CapitalMarketId; market: string; benchmark: string; asOf: string;
  priceEarnings: number; earningsYield: number; bondYield: number; current: number;
  bondDefinition: string; bondBasis: "monthly-average"; equityCheckedAt: string; bondCheckedAt: string;
  bondObservations: YieldPoint[]; sources: CapitalSource[];
  holidayCalendar?: HolidayOverride;
};
export type CapitalDataset = { version: 2; methodology: string; observations: CapitalObservation[] };

export function capitalMarket(id: string) {
  const market = CAPITAL_MARKETS.find((item) => item.id === id);
  if (!market) throw new Error(`Unknown capital market: ${id}`);
  return market;
}

export const equitySourceUrl = (id: string) => {
  const market = capitalMarket(id);
  return `https://www.msci.com/indexes/index/${market.code}/${market.slug}`;
};

export function monthEnd(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("A valid YYYY-MM month is required.");
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

function validDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso))
    && new Date(iso).toISOString().slice(0, 10) === iso;
}

export function validateEquity(input: EquityInput, now = new Date()) {
  capitalMarket(input.marketId);
  if (!validDate(input.asOf) || input.asOf !== monthEnd(input.asOf.slice(0, 7))
    || input.asOf.slice(0, 7) >= now.toISOString().slice(0, 7)) {
    throw new Error("Equity observation must identify a completed month-end, never a future/current month.");
  }
  if (!Number.isFinite(input.priceEarnings) || input.priceEarnings <= 0 || !Number.isFinite(100 / input.priceEarnings)) throw new Error("Trailing P/E must be finite and positive and produce a finite earnings yield.");
  if (!Number.isFinite(Date.parse(input.checkedAt)) || Date.parse(input.checkedAt) > now.getTime()
    || Date.parse(input.checkedAt) < Date.parse(input.asOf)) throw new Error("Invalid equity source-check date.");
  if (input.sourceUrl !== equitySourceUrl(input.marketId)) throw new Error("Use the configured official MSCI Standard index profile.");
}

export function calculateCapitalObservation(equity: EquityInput, bond: BondInput, now = new Date()): CapitalObservation {
  validateEquity(equity, now);
  const market = capitalMarket(equity.marketId);
  if (bond.asOf !== equity.asOf || !Number.isFinite(bond.bondYield)) throw new Error("Equity and bond inputs must cover the same completed month.");
  if (!Number.isFinite(Date.parse(bond.checkedAt)) || Date.parse(bond.checkedAt) > now.getTime()
    || Date.parse(bond.checkedAt) < Date.parse(bond.asOf)) throw new Error("Invalid bond source-check date.");
  if (!bond.sourceUrl.startsWith("https://")) throw new Error("An official HTTPS bond source is required.");
  const earningsYield = 100 / equity.priceEarnings;
  return {
    marketId: market.id, market: market.market, benchmark: market.benchmark, asOf: equity.asOf,
    priceEarnings: equity.priceEarnings, earningsYield, bondYield: bond.bondYield, current: earningsYield + bond.bondYield,
    bondDefinition: market.bondDefinition, bondBasis: "monthly-average", equityCheckedAt: equity.checkedAt,
    bondCheckedAt: bond.checkedAt, bondObservations: bond.observations,
    ...(bond.holidayCalendar ? { holidayCalendar: bond.holidayCalendar } : {}),
    sources: [{ label: `${market.benchmark} — trailing P/E`, url: equity.sourceUrl },
      { label: `${market.bondDefinition} — 10 years, monthly average`, url: bond.sourceUrl }],
  };
}

/** Quoted fields, embedded newlines and escaped quotes occur in official exports. Never evaluate source JavaScript. */
export function parseCapitalCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === delimiter || char === "\n")) {
      row.push(cell.trim()); cell = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("Unterminated CSV field.");
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

function numeric(value: string | undefined): number {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("Missing or invalid source yield.");
  return Number(value);
}

function sourceDate(raw: string): string {
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(raw)) {
    const [year, month, day] = raw.split("/"); return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (validDate(raw)) return raw;
  // RBA and BoE use English month names, with dashes or spaces.
  if (/^\d{1,2}[- ][A-Za-z]{3}[- ]\d{4}$/.test(raw)) {
    const date = new Date(`${raw.replace(/-/g, " ")} 00:00:00 GMT`);
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return "";
}

export function parseMonthlyBond(csv: string, asOf: string, headerName: string, series: string) {
  const rows = parseCapitalCsv(csv), header = rows.find((row) => row[0] === headerName);
  const column = header?.indexOf(series) ?? -1;
  if (column < 1) throw new Error(`Required monthly series ${series} is missing.`);
  const row = rows.find((row) => (sourceDate(row[0]) || row[0]).slice(0, 7) === asOf.slice(0, 7));
  if (!row) throw new Error(`Monthly bond source has not published ${asOf.slice(0, 7)}.`);
  return { bondYield: numeric(row[column]), observations: [] as YieldPoint[] };
}

/** Require coverage at both ends. A holiday at month-end needs explicit verification, never silent forward-fill. */
export function averageDailyYields(points: YieldPoint[], asOf: string, verifiedLastTradingDay?: string) {
  const unique = new Map<string, number>();
  for (const point of points.filter((point) => point.date.slice(0, 7) === asOf.slice(0, 7))) {
    if (!validDate(point.date) || !Number.isFinite(point.value)) throw new Error("Invalid daily yield observation.");
    if (unique.has(point.date)) throw new Error("Duplicate daily yield date.");
    unique.set(point.date, point.value);
  }
  const observations = [...unique].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const lastWeekday = new Date(`${asOf}T00:00:00Z`);
  while ([0, 6].includes(lastWeekday.getUTCDay())) lastWeekday.setUTCDate(lastWeekday.getUTCDate() - 1);
  const expectedLast = verifiedLastTradingDay ?? lastWeekday.toISOString().slice(0, 10);
  if (observations.length < 12 || Number(observations[0].date.slice(8)) > 10
    || observations.at(-1)!.date < expectedLast) {
    throw new Error(`Incomplete daily bond coverage for ${asOf.slice(0, 7)}; verify holidays or wait for publication.`);
  }
  return { bondYield: observations.reduce((sum, point) => sum + point.value, 0) / observations.length, observations };
}

export function parseDailyBond(csv: string, asOf: string, kind: "JP" | "CH" | "EA", verifiedLastTradingDay?: string) {
  const rows = parseCapitalCsv(csv, kind === "CH" ? ";" : ",");
  const dateColumn = kind === "EA" ? "TIME_PERIOD" : "Date";
  const valueColumn = kind === "EA" ? "OBS_VALUE" : kind === "JP" ? "10Y" : "Value";
  const start = rows.findIndex((row) => row.includes(dateColumn) && row.includes(valueColumn));
  if (start < 0) throw new Error("Required 10-year daily source columns are missing.");
  const header = rows[start], dateIndex = header.indexOf(dateColumn), valueIndex = header.indexOf(valueColumn);
  const points: YieldPoint[] = [];
  for (const row of rows.slice(start + 1)) {
    const date = sourceDate(row[dateIndex] || "");
    if (!date || date.slice(0, 7) !== asOf.slice(0, 7)) continue;
    if (kind === "CH" && (row[header.indexOf("D0")] !== "CHF" || row[header.indexOf("D1")] !== "10J")) continue;
    if (kind === "EA" && row[header.indexOf("KEY")] !== "YC.B.U2.EUR.4F.G_N_C.SV_C_YM.PY_10Y") throw new Error("Unexpected ECB yield curve definition.");
    points.push({ date, value: numeric(row[valueIndex]) });
  }
  return averageDailyYields(points, asOf, verifiedLastTradingDay);
}

export function parseChinaBond(json: string, asOf: string, verifiedLastTradingDay?: string) {
  const series = JSON.parse(json);
  if (!Array.isArray(series) || series.length !== 1 || series[0].dcq !== 10 || series[0].ycDefName !== "10Yr"
    || !Array.isArray(series[0].seriesData)) throw new Error("Expected the MOF–ChinaBond 10-year government curve.");
  return averageDailyYields(series[0].seriesData.map(([time, value]: [number, number]) => {
    if (!Number.isFinite(time) || typeof value !== "number") throw new Error("Invalid ChinaBond daily data.");
    // ChinaBond timestamps represent midnight in China, not midnight UTC.
    return { date: new Date(time + 8 * 3_600_000).toISOString().slice(0, 10), value };
  }), asOf, verifiedLastTradingDay);
}

export function validateHolidayOverride(override: HolidayOverride, marketId: string, asOf: string, now = new Date()) {
  const domains: Record<string, string[]> = { CN: ["chinabond.com.cn", "mof.gov.cn", "pbc.gov.cn"], JP: ["mof.go.jp", "boj.or.jp"], CH: ["snb.ch"], EA: ["ecb.europa.eu"] };
  const source = new URL(override.sourceUrl);
  if (override.marketId !== marketId || override.asOf !== asOf || !validDate(override.lastTradingDay)
    || override.lastTradingDay.slice(0, 7) !== asOf.slice(0, 7) || override.lastTradingDay > asOf
    || Date.parse(asOf) - Date.parse(override.lastTradingDay) > 7 * 86_400_000
    || !Number.isFinite(Date.parse(override.checkedAt)) || Date.parse(override.checkedAt) < Date.parse(asOf)
    || Date.parse(override.checkedAt) > now.getTime() || source.protocol !== "https:"
    || !domains[marketId]?.some((domain) => source.hostname === domain || source.hostname.endsWith(`.${domain}`))) {
    throw new Error("Holiday coverage needs verified dates and an official source-country calendar.");
  }
}

/** Replace/revise one market-month; never delete history or regress a latest row. */
export function mergeCapitalObservation(dataset: CapitalDataset, observation: CapitalObservation): CapitalDataset {
  if (dataset.version !== 2 || dataset.methodology !== CAPITAL_METHODOLOGY) throw new Error("Unexpected capital methodology.");
  const latest = latestCapitalObservations(dataset).find((row) => row.marketId === observation.marketId);
  if (latest && observation.asOf < latest.asOf) throw new Error("Refusing a backward capital update.");
  return { ...dataset, observations: [...dataset.observations.filter((row) => row.marketId !== observation.marketId || row.asOf !== observation.asOf), observation]
    .sort((a, b) => a.asOf.localeCompare(b.asOf) || a.marketId.localeCompare(b.marketId)) };
}

export function latestCapitalObservations(dataset: CapitalDataset): CapitalObservation[] {
  return CAPITAL_MARKETS.flatMap((market) => {
    const latest = dataset.observations.filter((row) => row.marketId === market.id).sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    return latest ? [latest] : [];
  });
}

export function commonCapitalObservations(dataset: CapitalDataset): CapitalObservation[] {
  const months = [...new Set(dataset.observations.map((row) => row.asOf))].sort().reverse();
  for (const month of months) {
    const rows = CAPITAL_MARKETS.map((market) => dataset.observations.find((row) => row.marketId === market.id && row.asOf === month));
    if (rows.every((row) => row !== undefined)) return rows as CapitalObservation[];
  }
  return [];
}

export function validateCapitalDataset(data: CapitalDataset) {
  if (!data || data.version !== 2 || data.methodology !== CAPITAL_METHODOLOGY || !Array.isArray(data.observations)) throw new Error("Invalid capital dataset.");
  const seen = new Set<string>();
  for (const row of data.observations) {
    const key = `${row.marketId}:${row.asOf}`;
    const market = capitalMarket(row.marketId);
    if (seen.has(key) || row.market !== market.market || row.benchmark !== market.benchmark || row.bondDefinition !== market.bondDefinition
      || !validDate(row.asOf) || row.asOf !== monthEnd(row.asOf.slice(0, 7))
      || row.bondBasis !== "monthly-average" || !Number.isFinite(row.bondYield) || !Number.isFinite(row.priceEarnings)
      || row.priceEarnings <= 0 || !Number.isFinite(row.current) || !Number.isFinite(row.earningsYield)
      || Math.abs(row.current - (100 / row.priceEarnings + row.bondYield)) > 1e-9
      || Math.abs(row.earningsYield - 100 / row.priceEarnings) > 1e-9
      || !Number.isFinite(Date.parse(row.equityCheckedAt)) || !Number.isFinite(Date.parse(row.bondCheckedAt))
      || !Array.isArray(row.sources) || row.sources.length !== 2
      || row.sources[0].url !== equitySourceUrl(row.marketId) || !row.sources[1].url.startsWith("https://")) {
      throw new Error("Invalid or duplicate capital observation.");
    }
    seen.add(key);
  }
}

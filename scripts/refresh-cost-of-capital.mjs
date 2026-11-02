import { readFile, writeFile, rename, mkdir, rmdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  CAPITAL_MARKETS, CAPITAL_METHODOLOGY, equitySourceUrl, monthEnd, validateEquity,
  calculateCapitalObservation, latestCapitalObservations, mergeCapitalObservation,
  parseMonthlyBond, parseDailyBond, parseChinaBond, validateHolidayOverride,
} from "../lib/costOfCapital.ts";
import { capitalRefreshPlan } from "../lib/capitalSchedule.ts";

export const US_MONTHLY_URL = "https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=d7e27b7b09a3a7feae95b9c61781fcd8&lastobs=12&from=&to=&filetype=csv&label=include&layout=seriescolumn&type=package";

export function bondSource(id, asOf) {
  const start = `${asOf.slice(0, 7)}-01`;
  switch (id) {
    case "AU": return "https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv";
    case "US": return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS10&cosd=${start}&coed=${asOf}`;
    case "GB": {
      const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(asOf.slice(5, 7)) - 1];
      return `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/${month}/${asOf.slice(0, 4)}&Dateto=now&SeriesCodes=IUMAMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
    }
    case "JP": return "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv";
    case "CH": return `https://data.snb.ch/api/cube/rendeiduebd/data/csv/en?dimSel=D0(CHF),D1(10J)&fromDate=${start}&toDate=${asOf}`;
    case "EA": return `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_C.SV_C_YM.PY_10Y?format=csvdata&startPeriod=${start}&endPeriod=${asOf}`;
    case "CN": return `https://yield.chinabond.com.cn/cbweb-czb-web/czb/czbQueryYz?zblx=yz&gjqx=10&startTime=${start}&endTime=${asOf}&locale=en_US&qxmc=1`;
    default: throw new Error(`Unknown bond market ${id}`);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Official bond source returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 12_000_000) throw new Error("Unexpectedly large bond response.");
  return text;
}

export async function fetchBond(id, asOf, fetchSource = fetchText, now = new Date(), holidayCalendar) {
  if (holidayCalendar) validateHolidayOverride(holidayCalendar, id, asOf, now);
  let sourceUrl = bondSource(id, asOf), result;
  if (id === "US") {
    try { result = parseMonthlyBond(await fetchSource(sourceUrl), asOf, "observation_date", "GS10"); }
    catch {
      // Same Federal Reserve monthly series, not a substitute instrument. DDP may be retired;
      // the preferred FRED endpoint remains available independently of this fallback.
      sourceUrl = US_MONTHLY_URL;
      result = parseMonthlyBond(await fetchSource(sourceUrl), asOf, "Time Period", "RIFLGFCY10_N.M");
    }
  } else if (id === "AU") result = parseMonthlyBond(await fetchSource(sourceUrl), asOf, "Series ID", "FCMYGBAG10");
  else if (id === "GB") result = parseMonthlyBond(await fetchSource(sourceUrl), asOf, "DATE", "IUMAMNPY");
  else if (id === "CN") result = parseChinaBond(await fetchSource(sourceUrl), asOf, holidayCalendar?.lastTradingDay);
  else {
    let csv = await fetchSource(sourceUrl);
    if (id === "JP") {
      // At month rollover the latest completed month can still be in the current file.
      const currentUrl = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
      try { result = parseDailyBond(csv, asOf, id, holidayCalendar?.lastTradingDay); }
      catch {
        csv = await fetchSource(currentUrl); result = parseDailyBond(csv, asOf, id, holidayCalendar?.lastTradingDay); sourceUrl = currentUrl;
      }
    } else result = parseDailyBond(csv, asOf, id, holidayCalendar?.lastTradingDay);
  }
  return { asOf, ...result, sourceUrl, checkedAt: now.toISOString(), ...(holidayCalendar ? { holidayCalendar } : {}) };
}

export async function refreshCapital(dataset, equities, { marketIds, force = false, now = new Date(), fetchSource, holidayOverrides = [] } = {}) {
  if (!Array.isArray(equities) || new Set(equities.map((row) => row.marketId)).size !== equities.length) throw new Error("Equity inputs must be a unique array of markets.");
  // Validate every supplied equity before making any requests or writing anything.
  equities.forEach((equity) => validateEquity(equity, now));
  const plan = capitalRefreshPlan(CAPITAL_MARKETS, latestCapitalObservations(dataset), now);
  const report = { updated: [], waiting: [], errors: [] };
  let next = dataset;
  for (const job of plan.filter((job) => (!marketIds || marketIds.includes(job.marketId)) && (force || job.due))) {
    const equity = equities.find((row) => row.marketId === job.marketId);
    if (!equity || (!force && equity.asOf.slice(0, 7) < job.targetMonth)) {
      report.waiting.push({ marketId: job.marketId, targetMonth: job.targetMonth, reason: "Awaiting verified MSCI trailing P/E for the target month", sourceUrl: equitySourceUrl(job.marketId) });
      continue;
    }
    try {
      const holiday = holidayOverrides.find((item) => item.marketId === job.marketId && item.asOf === equity.asOf);
      const bond = await fetchBond(job.marketId, equity.asOf, fetchSource, now, holiday);
      const row = calculateCapitalObservation(equity, bond, now);
      next = mergeCapitalObservation(next, row);
      report.updated.push({ marketId: row.marketId, asOf: row.asOf, current: row.current });
    } catch (error) { report.errors.push({ marketId: job.marketId, error: error.message }); }
  }
  return { dataset: next, report };
}

async function main() {
  const { values } = parseArgs({ options: {
    equities: { type: "string" }, markets: { type: "string" }, plan: { type: "boolean" }, force: { type: "boolean" },
    "holiday-overrides": { type: "string" },
  } });
  const output = new URL("../public/data/cost-of-capital.json", import.meta.url);
  const input = values.equities ? pathToFileURL(values.equities.startsWith("/") || /^[A-Za-z]:/.test(values.equities) ? values.equities : `${process.cwd()}/${values.equities}`)
    : new URL("../lib/data/cost-of-capital-equities.json", import.meta.url);
  const dataset = JSON.parse(await readFile(output, "utf8"));
  if (dataset.version !== 2 || dataset.methodology !== CAPITAL_METHODOLOGY) throw new Error("Unexpected capital methodology.");
  const marketIds = values.markets?.split(",");
  if (marketIds?.some((id) => !CAPITAL_MARKETS.some((market) => market.id === id))) throw new Error("Unknown --markets selection.");
  if (values.plan) {
    console.log(JSON.stringify(capitalRefreshPlan(CAPITAL_MARKETS, latestCapitalObservations(dataset)).map((job) => ({
      ...job, equitySourceUrl: equitySourceUrl(job.marketId), bondSourceUrl: bondSource(job.marketId, monthEnd(job.targetMonth)),
    })), null, 2)); return;
  }
  const lock = new URL("../public/data/.cost-of-capital-refresh-lock", import.meta.url);
  await mkdir(lock); // fail rather than race a second automation/manual run
  try {
    const current = JSON.parse(await readFile(output, "utf8"));
    const holidayOverrides = values["holiday-overrides"] ? JSON.parse(await readFile(values["holiday-overrides"], "utf8")) : [];
    if (!Array.isArray(holidayOverrides)) throw new Error("Holiday overrides must be an array.");
    const { dataset: next, report } = await refreshCapital(current, JSON.parse(await readFile(input, "utf8")), { marketIds, force: values.force, holidayOverrides });
    if (report.updated.length) {
      const temporary = new URL(`${output.href}.tmp`);
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`); await rename(temporary, output);
    }
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } finally { await rmdir(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

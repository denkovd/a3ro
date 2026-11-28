import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { VALUE_CHAIN_COMPANIES } from "../src/dividend/valueChain/companies";
import { buildValueChainSnapshot, cleanFacts, joinRenamedConcepts, latestTtm, layerTotals, metricFromFacts, readCompany, ttmAt } from "../src/dividend/valueChain/metrics";
import { fetchValueChain, parseCompanyFacts, secUserAgent } from "../src/dividend/valueChain/sec";
import { runValueChainCycle } from "../src/ingest/valueChainCycle";
import { getStoredValueChain, valueChainContentHash } from "../src/storage/valueChainRepo";
import type { CompanyFinancials, DurationFact, ValueChainDataset } from "../src/dividend/valueChain/types";

const fact = (start: string, end: string, val: number, form = "10-Q", filed = end.slice(0, 8) + "28"): DurationFact => ({ start, end, val, form, filed });
const UA = "A3RO test test@example.com";

// Calendar-year filer: FY2024 annual, 2025 Q3 year-to-date and prior-year year-to-date.
const calendar = [
  fact("2024-01-01", "2024-12-31", 100, "10-K", "2025-02-10"),
  fact("2024-01-01", "2024-09-30", 70),
  fact("2024-07-01", "2024-09-30", 25),
  fact("2025-01-01", "2025-09-30", 90),
  fact("2025-07-01", "2025-09-30", 32),
  fact("2023-01-01", "2023-12-31", 80, "10-K", "2024-02-10"),
  fact("2023-01-01", "2023-09-30", 55),
];

function companyFacts(cik: number, entityName: string, concepts: Record<string, DurationFact[]>) {
  return { cik, entityName, facts: { "us-gaap": Object.fromEntries(Object.entries(concepts).map(([name, facts]) => [name, { units: { USD: facts } }])) } };
}

function financials(ticker: string, overrides: Partial<CompanyFinancials> = {}): CompanyFinancials {
  const company = VALUE_CHAIN_COMPANIES.find(item => item.ticker === ticker)!;
  const value = (v: number, end = "2025-09-30") => ({ value: v, end, concept: "x", basis: "derived" as const, filed: "2025-10-28" });
  return {
    ticker, cik: company.cik, layer: company.layer, entityName: company.name, periodEnd: "2025-09-30",
    ttm: { revenue: value(200), operatingIncome: value(50), operatingCashFlow: value(80), capex: value(30) },
    prior: { revenue: value(160, "2024-09-30"), operatingIncome: value(40, "2024-09-30"), operatingCashFlow: value(60, "2024-09-30"), capex: value(20, "2024-09-30") },
    ...overrides,
  };
}

describe("Trailing-12-month figures from SEC year-to-date reporting", () => {
  test("a full fiscal year is used directly", () => {
    assert.deepEqual(ttmAt(calendar, "2024-12-31"), { value: 100, basis: "annual", filed: "2025-02-10" });
  });

  test("year-to-date periods use last fiscal year + YTD − prior YTD, preferring the longest YTD", () => {
    assert.equal(ttmAt(calendar, "2025-09-30")?.value, 120);
    assert.equal(ttmAt(calendar, "2025-09-30")?.basis, "derived");
  });

  test("52/53-week fiscal years with shifting period ends still line up", () => {
    const facts = [
      fact("2024-01-29", "2025-01-26", 1300, "10-K", "2025-02-26"),
      fact("2024-01-29", "2024-10-27", 900),
      fact("2025-01-27", "2025-10-26", 1500),
      fact("2023-01-30", "2024-01-28", 600, "10-K", "2024-02-21"),
      fact("2023-01-30", "2023-10-29", 400),
    ];
    const result = latestTtm(facts, "Revenues");
    assert.equal(result?.current.end, "2025-10-26");
    assert.equal(result?.current.value, 1300 + 1500 - 900);
    assert.equal(result?.prior?.end, "2024-10-27");
    assert.equal(result?.prior?.value, 600 + 900 - 400);
  });

  test("missing prior-year YTD means no TTM rather than a guess", () => {
    const facts = calendar.filter(item => !(item.start === "2024-01-01" && item.end === "2024-09-30"));
    assert.equal(ttmAt(facts, "2025-09-30"), null);
    assert.equal(latestTtm(facts, "Revenues")?.current.end, "2024-12-31");
  });

  test("restated periods keep the latest filing and non-10-K/10-Q forms are ignored", () => {
    const facts = cleanFacts([
      { start: "2024-01-01", end: "2024-12-31", val: 100, form: "10-K", filed: "2025-02-10" },
      { start: "2024-01-01", end: "2024-12-31", val: 104, form: "10-K/A", filed: "2025-05-01" },
      { start: "2024-01-01", end: "2024-12-31", val: 999, form: "8-K", filed: "2025-06-01" },
      { start: "bad", end: "2024-12-31", val: 1, form: "10-K", filed: "2025-02-10" },
    ]);
    assert.deepEqual(facts.map(item => item.val), [104]);
  });

  test("the most recent concept wins; on the same period the larger total is used", () => {
    const newer = metricFromFacts({ Revenues: { units: { USD: calendar.filter(item => item.end <= "2024-12-31") } }, RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: calendar } } }, "revenue");
    assert.equal(newer?.current.concept, "RevenueFromContractWithCustomerExcludingAssessedTax");
    const doubled = calendar.map(item => ({ ...item, val: item.val * 2 }));
    const larger = metricFromFacts({ Revenues: { units: { USD: doubled } }, RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: calendar } } }, "revenue");
    assert.equal(larger?.current.concept, "Revenues");
    assert.equal(larger?.current.value, 240);
  });
});

describe("Renamed XBRL concepts", () => {
  // Old concept: FY2024, FY2025 and 2025 YTD. New concept from 2026: 2026 YTD plus the 2025 comparative.
  const older = [fact("2024-01-01", "2024-12-31", 80, "10-K"), fact("2024-01-01", "2024-09-30", 55), fact("2025-01-01", "2025-09-30", 70), fact("2025-01-01", "2025-12-31", 100, "10-K", "2026-02-10")];
  const renamed = [fact("2026-01-01", "2026-09-30", 90, "10-Q", "2026-10-30"), fact("2025-01-01", "2025-09-30", 70, "10-Q", "2026-10-30")];
  const split = [fact("2026-01-01", "2026-09-30", 60, "10-Q", "2026-10-30"), fact("2025-01-01", "2025-09-30", 45, "10-Q", "2026-10-30")];

  test("a rename is joined when both concepts report the same shared period", () => {
    const joined = joinRenamedConcepts(renamed, older)!;
    assert.equal(ttmAt(joined, "2026-09-30")?.value, 100 + 90 - 70);
    const result = metricFromFacts({ PaymentsToAcquireProductiveAssets: { units: { USD: older } }, PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: renamed } } }, "capex")!;
    assert.equal(result.current.end, "2026-09-30");
    assert.equal(result.current.value, 120);
    assert.match(result.current.concept, /joined with earlier PaymentsToAcquireProductiveAssets/);
  });

  test("a concept covering a different scope is never joined", () => {
    assert.equal(joinRenamedConcepts(split, older), null);
    assert.equal(joinRenamedConcepts([fact("2026-01-01", "2026-09-30", 90)], older), null);
    const result = metricFromFacts({ PaymentsToAcquireProductiveAssets: { units: { USD: older } }, PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: split } } }, "capex")!;
    assert.equal(result.current.end, "2025-12-31");
  });
});

describe("Company parsing", () => {
  const msft = VALUE_CHAIN_COMPANIES.find(company => company.ticker === "MSFT")!;

  test("rejects a payload for a different entity", () => {
    assert.throws(() => parseCompanyFacts(msft, companyFacts(msft.cik, "Some Other Corp", { Revenues: calendar })), /does not match/);
    assert.throws(() => parseCompanyFacts(msft, companyFacts(123, "Microsoft Corp", { Revenues: calendar })), /does not match/);
  });

  test("requires revenue and drops metrics that describe a different twelve months", () => {
    assert.throws(() => parseCompanyFacts(msft, companyFacts(msft.cik, "MICROSOFT CORP", { OperatingIncomeLoss: calendar })), /revenue/);
    const stale = calendar.filter(item => item.end <= "2024-12-31");
    const parsed = parseCompanyFacts(msft, companyFacts(msft.cik, "MICROSOFT CORP", { Revenues: calendar, OperatingIncomeLoss: calendar, PaymentsToAcquirePropertyPlantAndEquipment: stale }));
    assert.equal(parsed.periodEnd, "2025-09-30");
    assert.equal(parsed.ttm.operatingIncome?.value, 120);
    assert.equal(parsed.ttm.capex, null);
  });
});

describe("Layer totals", () => {
  const now = new Date("2025-11-15T00:00:00Z");

  test("free cash flow, margin and growth per company", () => {
    const read = readCompany(financials("MSFT"), now);
    assert.equal(read.freeCashFlow, 50);
    assert.equal(read.operatingMargin, 0.25);
    assert.equal(read.revenueGrowth, 0.25);
    assert.equal(read.capexGrowth, 0.5);
    assert.equal(read.stale, false);
  });

  test("stale companies are shown but left out of totals", () => {
    const companies = [readCompany(financials("MSFT"), now), readCompany(financials("GOOGL", { periodEnd: "2025-01-31" }), now)];
    assert.equal(companies[1].stale, true);
    const totals = layerTotals("hyperscalers", companies);
    assert.equal(totals.included, 1);
    assert.equal(totals.revenue, 200);
    assert.equal(totals.capexIntensity, 0.15);
    assert.equal(totals.companies, VALUE_CHAIN_COMPANIES.filter(company => company.layer === "hyperscalers").length);
  });

  test("margins only use companies that report both revenue and operating income", () => {
    const noIncome = financials("AMZN", { ttm: { ...financials("AMZN").ttm, operatingIncome: null } });
    const totals = layerTotals("hyperscalers", [readCompany(financials("MSFT"), now), readCompany(noIncome, now)]);
    assert.equal(totals.revenue, 400);
    assert.equal(totals.operatingMargin, 0.25);
    assert.equal(totals.revenueGrowth, 0.25);
  });

  test("no dataset means an unavailable snapshot, not zeros", () => {
    const snapshot = buildValueChainSnapshot(null, now);
    assert.equal(snapshot.status, "unavailable");
    assert.deepEqual(snapshot.layers, []);
  });
});

describe("SEC fetching and archiving", () => {
  test("a contact email is required in the User-Agent", () => {
    assert.throws(() => secUserAgent({}), /SEC_USER_AGENT/);
    assert.throws(() => secUserAgent({ SEC_USER_AGENT: "A3RO" }), /SEC_USER_AGENT/);
    assert.equal(secUserAgent({ SEC_USER_AGENT: UA }), UA);
  });

  test("one failing company is recorded without stopping the rest", async () => {
    const companies = VALUE_CHAIN_COMPANIES.filter(company => ["MSFT", "GOOGL"].includes(company.ticker));
    const seen: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push(String((init?.headers as Record<string, string>)["User-Agent"]));
      if (url.includes("0000789019")) return new Response(JSON.stringify(companyFacts(789019, "MICROSOFT CORP", { Revenues: calendar })));
      return new Response("busy", { status: 503 });
    }) as typeof fetch;
    const dataset = await fetchValueChain({ fetchImpl, userAgent: UA, companies, now: new Date("2025-11-15T00:00:00Z") });
    assert.deepEqual(dataset.companies.map(company => company.ticker), ["MSFT"]);
    assert.deepEqual(dataset.failures, [{ ticker: "GOOGL", error: "SEC returned HTTP 503" }]);
    assert.deepEqual(seen, [UA, UA]);
  });

  test("an empty fetch never overwrites the archive", async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [], rowCount: 0 }; } };
    const fetchImpl = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const report = await runValueChainCycle(db as never, { fetchImpl, userAgent: UA, companies: VALUE_CHAIN_COMPANIES.slice(0, 1) });
    assert.equal(report.archived, false);
    assert.equal(queries.length, 0);
  });

  test("stored datasets are validated and the hash ignores retrieval time", async () => {
    const dataset: ValueChainDataset = { version: 1, retrievedAt: "2025-11-15T00:00:00.000Z", companies: [financials("MSFT")], failures: [] };
    assert.equal(valueChainContentHash(dataset), valueChainContentHash({ ...dataset, retrievedAt: "2025-11-22T00:00:00.000Z" }));
    const db = (payload: unknown) => ({ query: async () => ({ rows: [{ payload, last_verified_at: "2025-11-22T00:00:00Z" }], rowCount: 1 }) });
    assert.equal((await getStoredValueChain(db(dataset) as never))?.retrievedAt, "2025-11-22T00:00:00.000Z");
    assert.equal(await getStoredValueChain(db({ version: 2 }) as never), null);
  });
});

describe("Frontier labs (hand-entered)", () => {
  test("Anthropic's S-1 periods give a trailing 12 months to June 2026", async () => {
    const { readLabs } = await import("../src/dividend/valueChain/labs");
    const anthropic = readLabs().find(lab => lab.name === "Anthropic")!;
    assert.equal(anthropic.periodEnd, "2026-06-30");
    assert.equal(anthropic.revenue, 19_708_000_000);
    assert.equal(anthropic.operatingIncome, -6_613_000_000);
    assert.equal(anthropic.basis, "filed");
  });

  test("a single reported year is used as-is, and every lab names a source", async () => {
    const { readLabs, REPORTED_LABS } = await import("../src/dividend/valueChain/labs");
    const openai = readLabs().find(lab => lab.name === "OpenAI")!;
    assert.equal(openai.periodEnd, "2025-12-31");
    assert.equal(openai.revenue, 13_070_000_000);
    assert.ok(Math.abs(openai.operatingMargin! + 1.6006) < 0.001);
    for (const lab of REPORTED_LABS) assert.ok(lab.sources.length > 0 && lab.sources.every(source => source.url.startsWith("https://")));
  });
});

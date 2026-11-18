import { VALUE_CHAIN_COMPANIES } from "./companies";
import { emptyMetrics, metricFromFacts } from "./metrics";
import { FINANCIAL_METRICS, type CompanyFinancials, type ValueChainCompany, type ValueChainDataset } from "./types";

export const SEC_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/";
const MAX_BYTES = 80_000_000;
/** SEC allows 10 requests a second; stay well under it. */
const REQUEST_GAP_MS = 250;
const CONCURRENCY = 3;

export function companyFactsUrl(cik: number): string {
  return `${SEC_COMPANY_FACTS_URL}CIK${String(cik).padStart(10, "0")}.json`;
}

/** SEC rejects requests without a User-Agent naming the requester and a contact email. */
export function secUserAgent(env: Record<string, string | undefined> = process.env): string {
  const value = env.SEC_USER_AGENT?.trim();
  if (!value || !/\S+@\S+\.\S+/.test(value)) throw new Error("SEC_USER_AGENT must be set to a name and contact email, e.g. \"A3RO research you@example.com\"");
  return value;
}

/** Reduce one companyfacts payload to aligned trailing-12-month figures. */
export function parseCompanyFacts(company: ValueChainCompany, payload: unknown): CompanyFinancials {
  const body = payload as { cik?: unknown; entityName?: unknown; facts?: { "us-gaap"?: Record<string, { units?: { USD?: unknown } }> } };
  if (!body || typeof body.entityName !== "string") throw new Error("SEC response did not include an entity name");
  if (Number(body.cik) !== company.cik || !company.entityPattern.test(body.entityName)) throw new Error(`SEC entity "${body.entityName}" does not match ${company.ticker}`);
  const usGaap = body.facts?.["us-gaap"];
  if (!usGaap) throw new Error("No US-GAAP facts (the company may file under IFRS)");
  const ttm = emptyMetrics<CompanyFinancials["ttm"][keyof CompanyFinancials["ttm"]]>(null);
  const prior = emptyMetrics<CompanyFinancials["prior"][keyof CompanyFinancials["prior"]]>(null);
  for (const metric of FINANCIAL_METRICS) {
    const result = metricFromFacts(usGaap, metric);
    if (result) { ttm[metric] = result.current; prior[metric] = result.prior; }
  }
  if (!ttm.revenue) throw new Error("No revenue concept with a complete trailing-12-month period");
  // Every metric must describe the same twelve months as revenue; otherwise drop it rather than mix periods.
  const periodEnd = ttm.revenue.end;
  for (const metric of FINANCIAL_METRICS) {
    if (ttm[metric] && ttm[metric]!.end !== periodEnd) { ttm[metric] = null; prior[metric] = null; }
  }
  return { ticker: company.ticker, cik: company.cik, layer: company.layer, entityName: body.entityName, periodEnd, ttm, prior };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFacts(company: ValueChainCompany, userAgent: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(companyFactsUrl(company.cik), { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`SEC returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error("SEC response is unexpectedly large");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("SEC response is unexpectedly large");
  return JSON.parse(text);
}

export async function fetchValueChain(opts: { now?: Date; fetchImpl?: typeof fetch; userAgent?: string; companies?: ValueChainCompany[] } = {}): Promise<ValueChainDataset> {
  const userAgent = opts.userAgent ?? secUserAgent();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const queue = [...(opts.companies ?? VALUE_CHAIN_COMPANIES)];
  const companies: CompanyFinancials[] = [];
  const failures: ValueChainDataset["failures"] = [];
  const worker = async () => {
    for (let company = queue.shift(); company; company = queue.shift()) {
      try { companies.push(parseCompanyFacts(company, await fetchFacts(company, userAgent, fetchImpl))); }
      catch (error) { failures.push({ ticker: company.ticker, error: error instanceof Error ? error.message.slice(0, 200) : "Unknown error" }); }
      await sleep(REQUEST_GAP_MS);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const order = (ticker: string) => VALUE_CHAIN_COMPANIES.findIndex(company => company.ticker === ticker);
  return {
    version: 1,
    retrievedAt: (opts.now ?? new Date()).toISOString(),
    companies: companies.sort((a, b) => order(a.ticker) - order(b.ticker)),
    failures: failures.sort((a, b) => order(a.ticker) - order(b.ticker)),
  };
}

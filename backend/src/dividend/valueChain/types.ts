import type { ValueChainLayerId } from "../framework";

export type FilingsLayerId = Exclude<ValueChainLayerId, "labs" | "households">;
export type FinancialMetric = "revenue" | "operatingIncome" | "operatingCashFlow" | "capex";
export const FINANCIAL_METRICS: FinancialMetric[] = ["revenue", "operatingIncome", "operatingCashFlow", "capex"];

export interface ValueChainCompany {
  ticker: string;
  name: string;
  cik: number;
  layer: FilingsLayerId;
  /** Must match SEC's entityName, so a wrong CIK can never load another company. */
  entityPattern: RegExp;
  role: string;
}

/** One XBRL duration fact from SEC companyfacts, reduced to what the TTM maths needs. */
export interface DurationFact {
  start: string;
  end: string;
  val: number;
  form: string;
  filed: string;
}

export interface TtmValue {
  value: number;
  end: string;
  concept: string;
  /** "annual" = a full fiscal year ending on `end`; "derived" = last annual + year-to-date − prior year-to-date. */
  basis: "annual" | "derived";
  filed: string;
}

export interface CompanyFinancials {
  ticker: string;
  cik: number;
  layer: FilingsLayerId;
  entityName: string;
  periodEnd: string | null;
  ttm: Record<FinancialMetric, TtmValue | null>;
  /** The same trailing-12-month measure one year earlier, for growth. */
  prior: Record<FinancialMetric, TtmValue | null>;
}

export interface ValueChainDataset {
  version: 1;
  retrievedAt: string;
  companies: CompanyFinancials[];
  failures: { ticker: string; error: string }[];
}

export interface LayerTotals {
  layer: FilingsLayerId;
  companies: number;
  included: number;
  revenue: number | null;
  revenueGrowth: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  capex: number | null;
  capexGrowth: number | null;
  capexIntensity: number | null;
  freeCashFlow: number | null;
  periodRange: { from: string; to: string } | null;
}

export interface CompanyRead extends CompanyFinancials {
  name: string;
  role: string;
  stale: boolean;
  operatingMargin: number | null;
  freeCashFlow: number | null;
  revenueGrowth: number | null;
  capexGrowth: number | null;
}

export interface ValueChainSnapshot {
  version: 1;
  status: "ready" | "partial" | "unavailable";
  generatedAt: string;
  retrievedAt: string | null;
  layers: LayerTotals[];
  companies: CompanyRead[];
  failures: ValueChainDataset["failures"];
}

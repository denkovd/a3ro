import { ttmAt } from "./metrics";
import type { DurationFact, ValueChainSnapshot } from "./types";

// Frontier labs are private (or only just filing), so they have no 10-K/10-Q
// XBRL to read. Figures here are entered by hand from a named source and
// checked date. When a lab starts filing 10-Qs, move it to companies.ts so it
// comes straight from SEC like everyone else.
//
// Figures are stored as the periods actually published and run through the same
// trailing-12-month maths as the filings data, so nothing is annualised or estimated.

export const LABS_CHECKED_ON = "2026-11-18";

export interface LabSource {
  label: string;
  url: string;
}

export interface ReportedLab {
  name: string;
  /** "filed": from an SEC registration statement. "reported": press reports of documents that are not public. */
  basis: "filed" | "reported";
  basisNote: string;
  revenue: DurationFact[];
  operatingIncome: DurationFact[];
  sources: LabSource[];
}

const usd = (billions: number) => Math.round(billions * 1e9);
const period = (start: string, end: string, billions: number, form: string): DurationFact => ({ start, end, val: usd(billions), form, filed: "2026-10-26" });

export const REPORTED_LABS: ReportedLab[] = [
  {
    name: "Anthropic",
    basis: "filed",
    basisNote: "Form S-1 filed 26 Oct 2026: full-year 2025 audited, half-years unaudited.",
    revenue: [
      period("2025-01-01", "2025-12-31", 4.585, "S-1"),
      period("2025-01-01", "2025-06-30", 1.163, "S-1"),
      period("2026-01-01", "2026-06-30", 16.286, "S-1"),
    ],
    operatingIncome: [
      period("2025-01-01", "2025-12-31", -8.06, "S-1"),
      period("2025-01-01", "2025-06-30", -2.14, "S-1"),
      period("2026-01-01", "2026-06-30", -0.693, "S-1"),
    ],
    sources: [
      { label: "TheWrap — S-1 first-half figures", url: "https://www.thewrap.com/industry-news/tech/anthropic-ipo-filing-80-billion-loss-revenue/" },
      { label: "Ynet — S-1 full-year 2025 operating loss", url: "https://www.ynetnews.com/business/article/bjsox0u9fl" },
    ],
  },
  {
    name: "OpenAI",
    basis: "reported",
    basisNote: "2025 audited accounts reported by Ed Zitron and verified by the Financial Times; not filed publicly (OpenAI's S-1 is confidential).",
    revenue: [{ start: "2025-01-01", end: "2025-12-31", val: usd(13.07), form: "reported", filed: "2026-06-17" }],
    operatingIncome: [{ start: "2025-01-01", end: "2025-12-31", val: usd(-20.92), form: "reported", filed: "2026-06-17" }],
    sources: [{ label: "Techstrong.ai — FT-verified 2025 financials", url: "https://techstrong.ai/articles/openais-fast-growing-revenues-outpaced-by-massive-scale-of-losses-ahead-of-expected-ipo/" }],
  },
];

export interface LabRead {
  name: string;
  basis: ReportedLab["basis"];
  basisNote: string;
  periodEnd: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  sources: LabSource[];
}

function latest(facts: DurationFact[]) {
  const ends = [...new Set(facts.map(fact => fact.end))].sort().reverse();
  for (const end of ends) {
    const result = ttmAt(facts, end);
    if (result) return { end, value: result.value };
  }
  return null;
}

export function readLabs(labs = REPORTED_LABS): LabRead[] {
  return labs.map(lab => {
    const revenue = latest(lab.revenue);
    const income = latest(lab.operatingIncome);
    const aligned = revenue && income && revenue.end === income.end;
    return {
      name: lab.name, basis: lab.basis, basisNote: lab.basisNote,
      periodEnd: revenue?.end ?? null,
      revenue: revenue?.value ?? null,
      operatingIncome: aligned ? income!.value : null,
      operatingMargin: aligned && revenue!.value > 0 ? income!.value / revenue!.value : null,
      sources: lab.sources,
    };
  });
}

/** What the page receives: SEC filings data plus the hand-entered labs. */
export type ValueChainResponse = ValueChainSnapshot & { labs: LabRead[]; labsCheckedOn: string };

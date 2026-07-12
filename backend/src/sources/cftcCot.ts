/* ────────────────────────────────────────────────────────────────
   CFTC Commitments of Traders adapter — managed-money net length in
   WTI crude (roadmap P7 / scores-plan #6, the Positioning half of
   Macro Override). Keyless CFTC Socrata API (same posture as the
   keyless FRED CSV + data.gov.sg adapters):

     GET https://publicreporting.cftc.gov/resource/72hh-3qpy.json
       ?$where=cftc_contract_market_code='067651'      (WTI, NYMEX)
       &$order=report_date_as_yyyy_mm_dd desc
       &$select=report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all
       &$limit=60                                        (~14 months weekly)
     → [ { report_date_as_yyyy_mm_dd, m_money_positions_long_all,
           m_money_positions_short_all } ]

   Dataset "72hh-3qpy" = Disaggregated Futures-Only COT. The Managed
   Money category is the standard speculative-positioning gauge for
   crude. WTI Light Sweet on NYMEX is contract code 067651. COT
   publishes weekly (Friday afternoon, data through the prior Tuesday).

   Verification note: the CFTC Socrata host is not reachable from the
   build sandbox (times out — like Yahoo), so the schema here is taken
   from CFTC's published Socrata docs and confirmed at first cron. The
   adapter is fail-loud — an empty result or a missing managed-money
   field throws bad_payload rather than silently emitting nothing (a
   quietly-empty positioning series would corrupt Macro Override).

   Socrata quirk: numeric columns arrive as STRINGS. Values are coerced
   and non-finite rows dropped; report_date arrives as a floating
   timestamp ("2026-07-07T00:00:00.000") — sliced to the date.
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";

const BASE_URL = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
const SOURCE_ID = "cftc-cot";
/** WTI, Light Sweet — NEW YORK MERCANTILE EXCHANGE. */
export const WTI_CONTRACT_CODE = "067651";
const DEFAULT_LIMIT = 60; // weekly rows — ~14 months, enough for a 1-yr percentile

export interface CotObservation {
  date: string; // "YYYY-MM-DD" (weekly, report Tuesday)
  longs: number;
  shorts: number;
  net: number; // longs − shorts (managed-money net length)
}

export interface CotSeries {
  contractCode: string;
  market: string;
  observations: CotObservation[]; // ascending by date
}

interface CotRow {
  report_date_as_yyyy_mm_dd?: string;
  m_money_positions_long_all?: string | number;
  m_money_positions_short_all?: string | number;
  market_and_exchange_names?: string;
}

function fail(kind: SourceErrorKind, message: string, cause?: unknown): never {
  throw new SourceError(SOURCE_ID, kind, message, cause ? { cause } : undefined);
}

const numOrNull = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Parse the Socrata row array into an ascending net-length series. */
export function parseCotRows(rows: CotRow[]): CotObservation[] {
  const out: CotObservation[] = [];
  for (const r of rows) {
    const rawDate = r.report_date_as_yyyy_mm_dd;
    if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(rawDate)) continue;
    const longs = numOrNull(r.m_money_positions_long_all);
    const shorts = numOrNull(r.m_money_positions_short_all);
    if (longs === null || shorts === null) continue;
    out.push({ date: rawDate.slice(0, 10), longs, shorts, net: longs - shorts });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Fetch WTI managed-money net length (keyless Socrata). */
export async function fetchCotPositioning(
  opts: { contractCode?: string; limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<CotSeries> {
  const contractCode = opts.contractCode ?? WTI_CONTRACT_CODE;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const doFetch = opts.fetchImpl ?? fetch;

  const params = new URLSearchParams();
  params.set("$where", `cftc_contract_market_code='${contractCode}'`);
  params.set("$order", "report_date_as_yyyy_mm_dd desc");
  params.set(
    "$select",
    "report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all,market_and_exchange_names",
  );
  params.set("$limit", String(limit));
  const url = `${BASE_URL}?${params.toString()}`;

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (e) {
    fail("upstream_error", `CFTC fetch failed: ${String(e)}`, e);
  }
  if (res.status === 429) fail("rate_limited", "CFTC Socrata throttled (429)");
  if (!res.ok) fail("upstream_error", `CFTC Socrata HTTP ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    fail("bad_payload", `CFTC response was not JSON: ${String(e)}`, e);
  }
  if (!Array.isArray(body)) {
    fail("bad_payload", `CFTC response was not an array: ${JSON.stringify(body).slice(0, 160)}`);
  }

  const rows = body as CotRow[];
  const observations = parseCotRows(rows);
  if (observations.length === 0) {
    fail("bad_payload", `CFTC returned zero usable rows for contract ${contractCode} (wrong code or schema drift)`);
  }

  const market = rows.find((r) => typeof r.market_and_exchange_names === "string")?.market_and_exchange_names ?? "WTI (NYMEX)";
  return { contractCode, market, observations };
}

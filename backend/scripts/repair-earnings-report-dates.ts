/* Audited, one-time recovery of missing announcement dates for the seven
 * latest EPS-only rows restored in October 2026. Source URLs identify the
 * matching company release and fiscal quarter; no dates are inferred from
 * Finnhub's normalized period-end field. Dry-run by default; --apply fills
 * only NULL report_date values and preserves existing source payloads. */
import { Pool } from "pg";

const reports = [
  { ticker: "AAPL", year: 2026, quarter: 3, date: "2026-07-30", source: "https://www.apple.com/newsroom/2026/07/apple-reports-third-quarter-results/" },
  { ticker: "AMD", year: 2026, quarter: 2, date: "2026-08-04", source: "https://ir.amd.com/news-events/press-releases/detail/1295/amd-reports-second-quarter-2026-financial-results" },
  { ticker: "AMZN", year: 2026, quarter: 2, date: "2026-07-30", source: "https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-Second-Quarter-Results/default.aspx" },
  { ticker: "AVGO", year: 2026, quarter: 3, date: "2026-09-02", source: "https://investors.broadcom.com/node/64671/pdf" },
  { ticker: "META", year: 2026, quarter: 2, date: "2026-07-29", source: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/default.aspx" },
  { ticker: "MSFT", year: 2026, quarter: 4, date: "2026-07-29", source: "https://www.microsoft.com/en-us/investor/earnings/fy-2026-q4/press-release-webcast" },
  { ticker: "NVDA", year: 2027, quarter: 2, date: "2026-08-26", source: "https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/" },
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, query_timeout: 15000 });
let inTransaction = false;
try {
  if (apply) {
    await pool.query("begin");
    inTransaction = true;
  }
  let updated = 0;
  for (const report of reports) {
    const key = [report.ticker, report.year, report.quarter];
    const existing = await pool.query(
      `select report_date::text as report_date from earnings_surprises
        where ticker = $1 and fiscal_year = $2 and fiscal_quarter = $3`, key,
    );
    if (existing.rows.length !== 1) throw new Error(`Expected one cached row for ${report.ticker} FY${report.year} Q${report.quarter}`);
    const date = (existing.rows[0] as { report_date: string | null }).report_date;
    if (date !== null && date !== report.date) throw new Error(`Existing date differs for ${report.ticker}; manual review required`);
    if (date !== null) continue;
    console.log(JSON.stringify({ ticker: report.ticker, date: report.date, source: report.source, apply }));
    if (apply) {
      const result = await pool.query(
        `update earnings_surprises
            set report_date = $4::date, updated_at = now(),
                raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('reportDateVerification', $5::jsonb)
          where ticker = $1 and fiscal_year = $2 and fiscal_quarter = $3 and report_date is null`,
        [...key, report.date, JSON.stringify({ source: report.source, report_date: report.date, verified_at: new Date().toISOString() })],
      );
      updated += result.rowCount ?? 0;
    }
  }
  if (apply) {
    await pool.query("commit");
    inTransaction = false;
  }
  console.log(JSON.stringify({ apply, updated, checked: reports.length }));
} catch (error) {
  if (inTransaction) await pool.query("rollback");
  throw error;
} finally {
  await pool.end();
}

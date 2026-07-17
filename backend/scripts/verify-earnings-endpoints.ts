/* ────────────────────────────────────────────────────────────────
   Verification probes V1–V3 against live Finnhub API (spec §0.1).

   Verifies three Finnhub behaviors critical to the earnings pipeline:
   V1: History depth of /calendar/earnings on free tier
   V2: Year/quarter label agreement between /calendar/earnings and /stock/earnings
   V3: Actual values of the hour field

   Requires: FINNHUB_API_KEY in environment or .env.local
   Output: markdown report to backend/docs/earnings-endpoint-verification.md
           + PASS/FAIL summary to stdout
   ──────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ────────────────────────────────────────────────────────────────
// Load FINNHUB_API_KEY from environment or .env.local
// ────────────────────────────────────────────────────────────────
function loadFinnhubApiKey(): string {
  if (process.env.FINNHUB_API_KEY) {
    return process.env.FINNHUB_API_KEY;
  }

  const envPath = resolve(here, "../../.env.local");
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*FINNHUB_API_KEY\s*=\s*(.*)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  }

  console.error(
    "FINNHUB_API_KEY not found: get a free key at https://finnhub.io, add FINNHUB_API_KEY to .env.local"
  );
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────
// Utility: respect 60 req/min free tier with ~1.2s spacing
// ────────────────────────────────────────────────────────────────
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────────
// Utility: truncate JSON for readability in the report
// ────────────────────────────────────────────────────────────────
function truncateJson(obj: unknown, maxLength: number = 500): string {
  const str = JSON.stringify(obj, null, 2);
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + "\n  ... [truncated]";
  }
  return str;
}

// ────────────────────────────────────────────────────────────────
// V1: Calendar earnings history depth
// ────────────────────────────────────────────────────────────────
async function verifyCalendarHistoryDepth(
  apiKey: string
): Promise<{ pass: boolean; data: Record<string, unknown> }> {
  const tickers = ["NVDA", "AAPL", "ORCL"];
  const today = new Date();
  const threeYearsAgo = new Date(today);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const from = formatDate(threeYearsAgo);
  const to = formatDate(today);

  const results: Record<string, unknown> = {};
  const samplePayloads: Record<string, unknown> = {};

  for (const ticker of tickers) {
    await delay(1200); // ~1.2s spacing for free tier
    try {
      const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
      url.searchParams.set("symbol", ticker);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("token", apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
        results[ticker] = {
          error: `HTTP ${response.status}`,
          status: response.statusText,
        };
        continue;
      }

      const data = (await response.json()) as {
        earnings?: Array<{
          date: string;
          year: number;
          quarter: number;
          epsActual: number | null;
          epsEstimate: number | null;
          revenueActual: number | null;
          revenueEstimate: number | null;
          hour?: string;
        }>;
      };

      const earnings = data.earnings || [];
      const withActual = earnings.filter((e) => e.epsActual !== null);
      const oldestDate =
        withActual.length > 0
          ? withActual[withActual.length - 1].date
          : "N/A";

      results[ticker] = {
        quartersWithActual: withActual.length,
        totalRows: earnings.length,
        oldestDate,
        dateRange: `${from} to ${to}`,
      };

      // Store sample payload (first 2 entries)
      samplePayloads[ticker] = earnings.slice(0, 2);
    } catch (err) {
      results[ticker] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // V1 passes if we got history for all tickers and oldest date is before today - 2 years
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const pass = tickers.every((ticker) => {
    const r = results[ticker] as Record<string, unknown>;
    return (
      !r.error &&
      typeof r.oldestDate === "string" &&
      r.oldestDate < formatDate(twoYearsAgo)
    );
  });

  return {
    pass,
    data: {
      summary: results,
      samplePayloads,
    },
  };
}

// ────────────────────────────────────────────────────────────────
// V2: Year/quarter label agreement
// ────────────────────────────────────────────────────────────────
async function verifyQuarterLabelsAgree(apiKey: string): Promise<{
  pass: boolean;
  data: Record<string, unknown>;
}> {
  const tickers = ["NVDA", "AAPL", "ORCL"];
  const today = new Date();
  const threeYearsAgo = new Date(today);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const from = formatDate(threeYearsAgo);
  const to = formatDate(today);

  const results: Record<
    string,
    {
      calendarQuarters: number;
      stockQuarters: number;
      agree: boolean;
      mismatchesSample: Array<Record<string, unknown>>;
    }
  > = {};

  for (const ticker of tickers) {
    // Fetch calendar
    await delay(1200);
    let calendarEarnings = null;
    try {
      const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
      url.searchParams.set("symbol", ticker);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("token", apiKey);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = (await response.json()) as {
          earnings?: Array<{
            year: number;
            quarter: number;
            epsActual: number | null;
          }>;
        };
        calendarEarnings = (data.earnings || []).filter(
          (e) => e.epsActual !== null
        );
      }
    } catch (err) {
      // Silently continue
    }

    // Fetch stock earnings
    await delay(1200);
    let stockEarnings = null;
    try {
      const url = new URL("https://finnhub.io/api/v1/stock/earnings");
      url.searchParams.set("symbol", ticker);
      url.searchParams.set("token", apiKey);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = (await response.json()) as Array<{
          year: number;
          quarter: number;
        }>;
        stockEarnings = Array.isArray(data) ? data : [];
      }
    } catch (err) {
      // Silently continue
    }

    if (!calendarEarnings || !stockEarnings) {
      results[ticker] = {
        calendarQuarters: calendarEarnings?.length || 0,
        stockQuarters: stockEarnings?.length || 0,
        agree: false,
        mismatchesSample: [{ note: "Failed to fetch one or both endpoints" }],
      };
      continue;
    }

    // Compare labels
    const calendarSet = new Set(
      calendarEarnings.map((e) => `${e.year}-Q${e.quarter}`)
    );
    const stockSet = new Set(
      stockEarnings.map((e) => `${e.year}-Q${e.quarter}`)
    );

    const mismatches: Array<Record<string, unknown>> = [];
    for (const label of calendarSet) {
      if (!stockSet.has(label)) {
        mismatches.push({ inCalendarNotStock: label });
      }
    }
    for (const label of stockSet) {
      if (!calendarSet.has(label)) {
        mismatches.push({ inStockNotCalendar: label });
      }
    }

    results[ticker] = {
      calendarQuarters: calendarEarnings.length,
      stockQuarters: stockEarnings.length,
      agree: mismatches.length === 0,
      mismatchesSample: mismatches.slice(0, 3),
    };
  }

  const pass = Object.values(results).every((r) => r.agree);
  return { pass, data: results };
}

// ────────────────────────────────────────────────────────────────
// V3: Distinct hour values
// ────────────────────────────────────────────────────────────────
async function verifyHourValues(
  apiKey: string
): Promise<{ pass: boolean; data: Record<string, unknown> }> {
  const tickers = ["NVDA", "AAPL", "ORCL"];
  const today = new Date();
  const threeYearsAgo = new Date(today);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const from = formatDate(threeYearsAgo);
  const to = formatDate(today);

  const allHours = new Set<string>();
  const hourCounts: Record<string, number> = {};

  for (const ticker of tickers) {
    await delay(1200);
    try {
      const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
      url.searchParams.set("symbol", ticker);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("token", apiKey);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = (await response.json()) as {
          earnings?: Array<{ hour?: string }>;
        };
        for (const e of data.earnings || []) {
          const h = e.hour || ""; // Empty string if not present
          allHours.add(h);
          hourCounts[h] = (hourCounts[h] || 0) + 1;
        }
      }
    } catch (err) {
      // Silently continue
    }
  }

  // Expected values per spec: 'bmo', 'amc', 'dmh', and empty string (normalized to NULL in pipeline)
  const expectedValues = ["bmo", "amc", "dmh", ""];
  const unexpectedValues = Array.from(allHours).filter(
    (h) => !expectedValues.includes(h)
  );
  const pass = unexpectedValues.length === 0;

  return {
    pass,
    data: {
      distinctValues: Array.from(allHours).sort(),
      counts: hourCounts,
      expectedValues,
      unexpectedValues,
      note: "Empty string is normalized to NULL in pipeline (per spec §2.1)",
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = loadFinnhubApiKey();
  const timestamp = new Date().toISOString();

  console.error(`Starting verification probes at ${timestamp}`);
  console.error("Spacing requests ~1.2s apart for free tier (60 req/min)...\n");

  // Run all three verifications
  const v1 = await verifyCalendarHistoryDepth(apiKey);
  const v2 = await verifyQuarterLabelsAgree(apiKey);
  const v3 = await verifyHourValues(apiKey);

  // Generate markdown report
  const markdown = `# Finnhub API Verification Report

**Date:** ${timestamp}

---

## V1: Calendar Earnings History Depth

**Requirement:** Verify how far back \`/calendar/earnings?symbol=X\` returns on the free tier (request 3 years; is it truncated?).

**Why it matters:** Sets backfill depth → streak depth.

**Status:** ${v1.pass ? "✅ PASS" : "❌ FAIL"}

${v1.pass ? "**Finding:** History extends > 2 years back for all tested tickers." : "**Finding:** History is truncated or endpoints returned errors."}

**Details:**
\`\`\`json
${truncateJson(v1.data.summary)}
\`\`\`

**Sample Calendar Payloads (first 2 entries per ticker):**
\`\`\`json
${truncateJson(v1.data.samplePayloads)}
\`\`\`

---

## V2: Year/Quarter Label Agreement

**Requirement:** Verify whether \`(year, quarter)\` labels **agree between the two endpoints** for offset-fiscal-year companies (test NVDA, AAPL, ORCL).

**Why it matters:** Flow B joins the endpoints on \`(year, quarter)\`. If labels disagree (fiscal vs calendar labeling), enrichment lands on the wrong row.

**Status:** ${v2.pass ? "✅ PASS" : "❌ FAIL"}

${v2.pass ? "**Finding:** Year/quarter labels agree between /calendar/earnings and /stock/earnings." : "**Finding:** Labels disagree for one or more tickers (see mismatches below)."}

**Details:**
\`\`\`json
${truncateJson(v2.data)}
\`\`\`

---

## V3: Calendar Hour Field Values

**Requirement:** Verify the actual value set of calendar \`hour\` (docs say \`bmo\`/\`amc\`/\`dmh\`; empty string has been observed).

**Why it matters:** A CHECK constraint that rejects \`''\` aborts inserts. Fallback: pipeline normalizes \`'' → NULL\` (§2.1).

**Status:** ${v3.pass ? "✅ PASS" : "❌ FAIL"}

${v3.pass ? "**Finding:** Only expected hour values observed (bmo, amc, dmh, or empty)." : "**Finding:** Unexpected hour values detected (see below)."}

**Details:**
\`\`\`json
${truncateJson(v3.data)}
\`\`\`

---

## Summary

| Verification | Status | Fallback |
|---|---|---|
| **V1** | ${v1.pass ? "✅ PASS" : "❌ FAIL"} | Backfill EPS-only older quarters from /stock/earnings if history too short |
| **V2** | ${v2.pass ? "✅ PASS" : "❌ FAIL"} | Drop the join; skip /stock/earnings enrichment entirely if labels disagree |
| **V3** | ${v3.pass ? "✅ PASS" : "❌ FAIL"} | Already handled: pipeline normalizes empty string → NULL |

---

*Generated by \`backend/scripts/verify-earnings-endpoints.ts\`*
`;

  // Write report
  const reportPath = resolve(here, "../docs/earnings-endpoint-verification.md");
  writeFileSync(reportPath, markdown);
  console.error(`\nReport written to: ${reportPath}`);

  // Print summary to stdout
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("FINNHUB VERIFICATION SUMMARY");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`V1 (Calendar history depth):       ${v1.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`V2 (Year/quarter label agreement): ${v2.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`V3 (Hour field values):            ${v3.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log("════════════════════════════════════════════════════════════");

  const allPass = v1.pass && v2.pass && v3.pass;
  if (allPass) {
    console.log("\n✅ All verifications passed. Pipeline can proceed.");
    process.exit(0);
  } else {
    console.log("\n⚠️  One or more verifications failed. Check report and spec fallbacks:");
    console.log("   - V1 FAIL → backfill via /stock/earnings (subject to V2)");
    console.log("   - V2 FAIL → skip /stock/earnings enrichment entirely");
    console.log("   - V3 FAIL → revise CHECK constraint or normalization");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

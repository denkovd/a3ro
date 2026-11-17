import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/components/projects/bull/columns.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { BULL_COLUMNS, sortRows, nextSort, parseSort, isDefaultOrder } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const row = (rank, overrides = {}) => ({
  runDate: "2026-11-16", symbol: `S${rank}`, displayName: `Asset ${rank}`, tier: "us_large", assetClass: "equity",
  verdict: "BULLISH", rank, newlyBullish: false, dailyTrend: 1, weeklyTrend: 1,
  dailyFlipDate: null, weeklyFlipDate: null, dailySinceFlipPct: null, dailyCushionPct: null,
  daysSinceAligned: 10, alignedSince: "2026-11-01", strength: 1, atrPct: 1, strengthVol: 1, rs63: 0,
  adjusted: false, lastClose: 100, lastCloseDate: "2026-11-16", consensus: { bull: 3, bear: 0, neutral: 0, of: 3 },
  ...overrides,
});
const symbols = (rows) => rows.map((r) => r.symbol);

test("missing values sort last in both directions", () => {
  const rows = [row(1, { rs63: null }), row(2, { rs63: 5 }), row(3, { rs63: -2 }), row(4, { rs63: null })];
  assert.deepEqual(symbols(sortRows(rows, { key: "rs63", dir: "desc" })), ["S2", "S3", "S1", "S4"]);
  assert.deepEqual(symbols(sortRows(rows, { key: "rs63", dir: "asc" })), ["S3", "S2", "S1", "S4"]);
});

test("ties and the default state fall back to server rank", () => {
  const rows = [row(3, { strengthVol: 2 }), row(1, { strengthVol: 2 }), row(2, { strengthVol: 9 })];
  assert.deepEqual(symbols(sortRows(rows, { key: "strVol", dir: "desc" })), ["S2", "S1", "S3"]);
  assert.deepEqual(symbols(sortRows(rows, null)), ["S1", "S2", "S3"]);
});

test("state sorts most bullish first, warm-up last", () => {
  const rows = [
    row(1, { verdict: "BEARISH" }), row(2, { verdict: "WARMUP" }), row(3, { verdict: "CONFLICT_DAILY" }),
    row(4, { verdict: "BULLISH", newlyBullish: true }), row(5, { verdict: "BULLISH" }),
  ];
  assert.deepEqual(symbols(sortRows(rows, { key: "state", dir: "desc" })), ["S4", "S5", "S3", "S1", "S2"]);
  assert.equal(sortRows(rows, { key: "state", dir: "asc" }).at(-1).symbol, "S2");
});

test("lens ranks net bullishness, confirmed ranks the date shown in the cell", () => {
  const lens = [
    row(1, { consensus: { bull: 2, bear: 1, neutral: 0, of: 3 } }),
    row(2, { consensus: { bull: 2, bear: 0, neutral: 1, of: 3 } }),
    row(3, { consensus: { bull: 0, bear: 0, neutral: 0, of: 0 } }),
  ];
  assert.deepEqual(symbols(sortRows(lens, { key: "lens", dir: "desc" })), ["S2", "S1", "S3"]);
  const dates = [
    row(1, { alignedSince: "2026-10-01" }),
    row(2, { verdict: "CONFLICT_DAILY", alignedSince: null, dailyFlipDate: "2026-11-10" }),
    row(3, { verdict: "WARMUP", alignedSince: null }),
  ];
  assert.deepEqual(symbols(sortRows(dates, { key: "confirmed", dir: "desc" })), ["S2", "S1", "S3"]);
});

test("header clicks cycle default → reversed → ranking", () => {
  let s = nextSort(null, "rs63");
  assert.deepEqual(s, { key: "rs63", dir: "desc" });
  s = nextSort(s, "rs63");
  assert.deepEqual(s, { key: "rs63", dir: "asc" });
  assert.equal(nextSort(s, "rs63"), null);
  assert.deepEqual(nextSort({ key: "rs63", dir: "asc" }, "asset"), { key: "asset", dir: "asc" });
  const r = nextSort(null, "rank");
  assert.deepEqual(r, { key: "rank", dir: "desc" });
  assert.equal(nextSort(r, "rank"), null);
});

test("only the ranking order keeps state groups; URL params are validated", () => {
  assert.equal(isDefaultOrder(null), true);
  assert.equal(isDefaultOrder({ key: "rank", dir: "asc" }), true);
  assert.equal(isDefaultOrder({ key: "rank", dir: "desc" }), false);
  assert.equal(parseSort("lastClose", "desc"), null);
  assert.equal(parseSort("rank", "asc"), null);
  assert.deepEqual(parseSort("rs63", "bogus"), { key: "rs63", dir: "desc" });
});

test("every column explains itself on every lens; last close is not sortable", () => {
  for (const col of BULL_COLUMNS) {
    for (const tf of ["multi", "daily", "weekly"]) assert.ok(col.tip(tf).length > 20, `${col.id}/${tf}`);
  }
  assert.equal(BULL_COLUMNS.length, 10);
  assert.equal(BULL_COLUMNS.find((c) => c.id === "close").sortKey, null);
});

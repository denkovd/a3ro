import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  comexReadingToMetrics,
  parseComexGoldStocksXls,
} from "../src/sources/comexGoldStocks";

const dir = dirname(fileURLToPath(import.meta.url));
const xls = readFileSync(join(dir, "fixtures/Gold_Stocks.xls"));

describe("comexGoldStocks", () => {
  it("parses registered / eligible / combined totals from fixture xls", () => {
    const r = parseComexGoldStocksXls(xls);
    assert.match(r.reportDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.registeredToz > 1_000_000);
    assert.ok(r.eligibleToz > 1_000_000);
    assert.ok(r.combinedToz > r.registeredToz);
  });

  it("maps to gold_flow_metrics rows", () => {
    const r = parseComexGoldStocksXls(xls);
    const rows = comexReadingToMetrics(r);
    const metrics = new Set(rows.map((x) => x.metric));
    assert.ok(metrics.has("comex_registered_toz"));
    assert.ok(metrics.has("comex_eligible_toz"));
    assert.ok(metrics.has("comex_combined_toz"));
    assert.equal(rows[0].locus, "comex");
    assert.equal(rows[0].unit, "troy_oz");
    assert.equal(rows[0].source, "comex-stocks");
  });
});

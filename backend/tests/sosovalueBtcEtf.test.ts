import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseSosoValueFlows, sosovalueFlowsToMetrics } from "../src/sources/sosovalueBtcEtf";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(dir, "fixtures/sosovalue_btc_etf.json"), "utf8"));

describe("sosovalueBtcEtf", () => {
  it("parses daily flow/AUM rows ascending by date", () => {
    const rows = parseSosoValueFlows(fixture);
    assert.ok(rows.length > 100);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].date > rows[i - 1].date, "dates must be strictly ascending");
    }
    const last = rows[rows.length - 1];
    assert.match(last.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(last.netAssetsUsd != null && last.netAssetsUsd > 1_000_000_000, "AUM should be a plausible fund size");
  });

  it("maps rows to flow + holdings btc_flow_metrics rows", () => {
    const rows = parseSosoValueFlows(fixture);
    const metrics = sosovalueFlowsToMetrics(rows);
    const flows = metrics.filter((m) => m.metric === "etf_flow_usd_mn");
    const holdings = metrics.filter((m) => m.metric === "etf_holdings_usd_mn");
    assert.equal(flows.length, rows.length);
    assert.ok(holdings.length > 0);
    assert.equal(flows[0].locus, "etf_us");
    assert.equal(flows[0].unit, "usd_mn");
    assert.equal(flows[0].source, "sosovalue-btc-etf");
  });
});

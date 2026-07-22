import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  parseWgcHoldingsChart,
  wgcHoldingsToMetrics,
} from "../src/sources/wgcEtf";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(dir, "fixtures/wgc_holdings-chart2.json"), "utf8"),
);

describe("wgcEtf", () => {
  it("parses weekly holdings fixture", () => {
    const points = parseWgcHoldingsChart(fixture);
    assert.ok(points.length > 100);
    const last = points[points.length - 1];
    assert.match(last.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(last.northAmericaT != null && last.northAmericaT > 1000);
    assert.ok(last.totalT != null && last.totalT > last.northAmericaT!);
  });

  it("maps holdings + week-over-week flow metrics", () => {
    const points = parseWgcHoldingsChart(fixture);
    const rows = wgcHoldingsToMetrics(points);
    const holdings = rows.filter((r) => r.metric === "etf_holdings_t" && r.locus === "etf_us");
    const flows = rows.filter((r) => r.metric === "etf_flow_t" && r.locus === "etf_us");
    assert.ok(holdings.length > 50);
    assert.equal(flows.length, holdings.length - 1);
    assert.equal(holdings[0].unit, "tonnes");
    assert.equal(holdings[0].source, "wgc-etf");
  });
});

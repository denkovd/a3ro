import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseCoinbaseCandles } from "../src/sources/coinbaseBtc";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(dir, "fixtures/coinbase_candles.json"), "utf8"));

describe("coinbaseBtc", () => {
  it("parses candle fixture into ascending daily closes", () => {
    const points = parseCoinbaseCandles(fixture);
    assert.ok(points.length > 30);
    for (let i = 1; i < points.length; i++) {
      assert.ok(points[i].date > points[i - 1].date, "dates must be strictly ascending");
    }
    const last = points[points.length - 1];
    assert.match(last.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(last.value > 1000, "BTC close should be a plausible USD price");
  });

  it("rejects a non-array payload", () => {
    assert.throws(() => parseCoinbaseCandles({ not: "an array" }));
  });
});

/* Roadmap #25: sector rotation by US regime. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeOnOrBefore, monthlyExcess, summarise, MIN_MONTHS } from "../src/macro/sectorRotation";
import { SECTOR_ROTATION } from "../src/macro/sectorRotation.generated";

const bar = (date: string, close: number) => ({ date, open: close, high: close, low: close, close });

test("closeOnOrBefore: last close at or before the date", () => {
  const bars = [bar("2026-01-02", 1), bar("2026-01-05", 2)];
  assert.equal(closeOnOrBefore(bars, "2026-01-04"), 1);
  assert.equal(closeOnOrBefore(bars, "2026-01-05"), 2);
  assert.equal(closeOnOrBefore(bars, "2026-01-01"), null);
});

test("monthlyExcess: sector minus SPY over each label month, labelled by its start", () => {
  const sector = [bar("2026-01-01", 100), bar("2026-02-01", 110), bar("2026-03-01", 99)];
  const spy = [bar("2026-01-01", 100), bar("2026-02-01", 105), bar("2026-03-01", 105)];
  const out = monthlyExcess(sector, spy, [
    { date: "2026-01-01", quadrant: "GOLDILOCKS" }, { date: "2026-02-01", quadrant: "INFLATION" }, { date: "2026-03-01", quadrant: "INFLATION" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].quadrant, "GOLDILOCKS");
  assert.ok(Math.abs(out[0].excess - 0.05) < 1e-12);
  assert.ok(Math.abs(out[1].excess - -0.1) < 1e-12);
});

test("monthlyExcess: months before a sector existed are skipped", () => {
  const out = monthlyExcess([bar("2026-02-01", 1), bar("2026-03-01", 1)], [bar("2026-01-01", 1), bar("2026-03-01", 1)],
    [{ date: "2026-01-01", quadrant: "REFLATION" }, { date: "2026-02-01", quadrant: "REFLATION" }, { date: "2026-03-01", quadrant: "REFLATION" }]);
  assert.equal(out.length, 1);
});

test("summarise: a strong, consistent edge leads; too few months stays weak", () => {
  const xs = Array.from({ length: MIN_MONTHS }, (_, i) => 0.01 + (i % 2) * 0.002);
  assert.equal(summarise("XLK", "DEFLATION", xs).verdict, "leads");
  assert.equal(summarise("XLK", "DEFLATION", xs.map((x) => -x)).verdict, "lags");
  assert.equal(summarise("XLK", "DEFLATION", xs.slice(0, MIN_MONTHS - 1)).verdict, "weak");
  assert.equal(summarise("XLK", "DEFLATION", []).meanExcess, null);
});

test("generated table: 11 sectors × 4 regimes", () => {
  assert.equal(SECTOR_ROTATION.length, 44);
});

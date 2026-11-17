import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectYahooDates, parseYahooAdjusted, parseYahooDaily, tradingDate } from "../src/regime/yahooHistory";

const at = (iso: string) => Date.parse(iso) / 1000;
const payload = (timestamps: number[], meta: Record<string, unknown>) => ({ chart: { error: null, result: [{ meta, timestamp: timestamps,
  indicators: { quote: [{ open: timestamps.map((_, i) => 1 + i), high: timestamps.map((_, i) => 1 + i), low: timestamps.map((_, i) => 1 + i),
    close: timestamps.map((_, i) => 1 + i) }], adjclose: [{ adjclose: timestamps.map((_, i) => 1 + i) }] } }] } });
const LONDON = { exchangeTimezoneName: "Europe/London", gmtoffset: 0 };

test("a London FX bar is dated by its London day in summer and winter alike", () => {
  // Summer: the bar for Tuesday 16 June opens at 00:00 BST = 23:00 UTC on Monday. Its UTC date is a day early.
  assert.equal(tradingDate(at("2026-06-15T23:00:00Z"), LONDON), "2026-06-16");
  // Winter: the bar opens at 00:00 GMT = 00:00 UTC and both dates agree.
  assert.equal(tradingDate(at("2026-01-13T00:00:00Z"), LONDON), "2026-01-13");
  // The offset in force when the response was generated must not decide a bar from another season.
  assert.equal(tradingDate(at("2026-06-15T23:00:00Z"), { exchangeTimezoneName: "Europe/London", gmtoffset: 3600 }), "2026-06-16");
  assert.equal(tradingDate(at("2026-01-13T00:00:00Z"), { exchangeTimezoneName: "Europe/London", gmtoffset: 3600 }), "2026-01-13");
});

test("dates stay one per weekday across both UK clock changes", () => {
  // Clocks went forward on Sunday 29 March 2026 and back on Sunday 25 October 2026.
  const spring = ["2026-03-26T00:00:00Z", "2026-03-27T00:00:00Z", "2026-03-29T23:00:00Z", "2026-03-30T23:00:00Z"].map(at);
  assert.deepEqual(parseYahooDaily(payload(spring, LONDON) as never, "EURUSD=X").map(b => b.date),
    ["2026-03-26", "2026-03-27", "2026-03-30", "2026-03-31"]);
  const autumn = ["2026-10-21T23:00:00Z", "2026-10-22T23:00:00Z", "2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z"].map(at);
  const bars = parseYahooDaily(payload(autumn, { ...LONDON, gmtoffset: 3600 }) as never, "GBPUSD=X");
  assert.deepEqual(bars.map(b => b.date), ["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27"]);
  assert.deepEqual(bars.map(b => b.close), [1, 2, 3, 4]);
  // The UTC rule this replaces put Thursday's and Friday's summer bars a day early.
  assert.deepEqual(autumn.map(t => tradingDate(t)), ["2026-10-21", "2026-10-22", "2026-10-26", "2026-10-27"]);
});

test("a summer FX bar can no longer be read by a signal formed the day before", () => {
  // The bar opening 23:00 UTC on 30 June runs to 23:00 UTC on 1 July — past the US close on 1 July.
  const [bar] = parseYahooDaily(payload([at("2026-06-30T23:00:00Z")], LONDON) as never, "EURUSD=X");
  const signalDate = "2026-06-30";
  assert.equal(bar.date, "2026-07-01");
  assert.equal([bar].filter(b => b.date <= signalDate).length, 0);
});

test("venues whose local and UTC dates already agree are unchanged", () => {
  const cases: [string, string, string][] = [
    ["2026-07-01T13:30:00Z", "America/New_York", "2026-07-01"], // US equity open, summer
    ["2026-01-05T14:30:00Z", "America/New_York", "2026-01-05"], // US equity open, winter
    ["2026-07-01T04:00:00Z", "America/New_York", "2026-07-01"], // futures stamped at New York midnight
    ["2026-07-01T00:00:00Z", "UTC", "2026-07-01"],              // crypto
    ["2026-07-01T00:00:00Z", "Asia/Tokyo", "2026-07-01"],       // Nikkei open 09:00 JST
    ["2026-07-01T07:00:00Z", "Europe/Berlin", "2026-07-01"],    // DAX open
  ];
  for (const [iso, zone, expected] of cases) {
    assert.equal(tradingDate(at(iso), { exchangeTimezoneName: zone }), expected);
    assert.equal(tradingDate(at(iso)), expected);
  }
});

test("missing or unusable zone information falls back without throwing", () => {
  const stamp = at("2026-06-15T23:00:00Z");
  assert.equal(tradingDate(stamp), "2026-06-15");
  assert.equal(tradingDate(stamp, {}), "2026-06-15");
  assert.equal(tradingDate(stamp, { exchangeTimezoneName: "Not/AZone" }), "2026-06-15");
  // With no named zone the single offset is the best available information.
  assert.equal(tradingDate(stamp, { gmtoffset: 3600 }), "2026-06-16");
  assert.equal(tradingDate(stamp, { exchangeTimezoneName: "Not/AZone", gmtoffset: 3600 }), "2026-06-16");
});

test("adjusted closes are matched to bars on the same exchange-zone date", () => {
  const stamps = ["2026-06-15T23:00:00Z", "2026-06-16T23:00:00Z"].map(at);
  const bars = parseYahooAdjusted(payload(stamps, LONDON), "EURUSD=X");
  assert.deepEqual(bars.map(b => [b.date, b.close]), [["2026-06-16", 1], ["2026-06-17", 2]]);
});

test("the date inspection reports stamp hours, relabelled bars and duplicates", () => {
  const stamps = ["2026-03-26T00:00:00Z", "2026-03-27T00:00:00Z", "2026-03-29T23:00:00Z", "2026-03-30T23:00:00Z"].map(at);
  assert.deepEqual(inspectYahooDates(payload(stamps, LONDON)), { exchangeTimezoneName: "Europe/London", gmtoffset: 0, bars: 4,
    utcHours: { "00": 2, "23": 2 }, relabelled: 2, firstRelabelled: { utc: "2026-03-29", exchange: "2026-03-30" }, duplicateDates: 0 });
  const control = inspectYahooDates(payload([at("2026-07-01T13:30:00Z")], { exchangeTimezoneName: "America/New_York", gmtoffset: -14400 }));
  assert.equal(control.relabelled, 0);
  assert.equal(inspectYahooDates(payload([stamps[0], stamps[0] + 3600], LONDON)).duplicateDates, 1);
});

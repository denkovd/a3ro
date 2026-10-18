import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VALUATION_INPUTS, HORIZON_THEMES, HORIZON_THEMES_VERSION, THEME_COMPANIES, THEME_RESEARCH_CHECKED_ON, VALUATION_RULES, companyDerivedMetrics, companyMilestoneStatus, companyResearchStatus, runThemeValuation, themeTrendContext, type ThemeTrendRow, type ValuationKey } from "../src/horizon/themes";

const asOf = "2026-10-18T12:00:00.000Z";
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const run = (changes = {}) => runThemeValuation({ ...DEFAULT_VALUATION_INPUTS, ...changes });
const company = (symbol: string) => THEME_COMPANIES.find(item => item.symbol === symbol)!;
const row: ThemeTrendRow = { symbol: "ETN", runDate: "2026-10-16", lastCloseDate: "2026-10-15", lastClose: 391.25, dailyTrend: -1, weeklyTrend: 1, adjusted: false };

describe("Horizon sourced theme registry", () => {
  test("five themes connect six distinct examples without manufacturing funded backlog or a buy score", () => {
    assert.equal(HORIZON_THEMES.length, 5);
    assert.equal(THEME_COMPANIES.length, 6);
    assert.equal(new Set(THEME_COMPANIES.map(item => item.symbol)).size, 6);
    assert.equal(new Set(HORIZON_THEMES.map(item => item.id)).size, 5);
    for (const theme of HORIZON_THEMES) {
      assert.ok(THEME_COMPANIES.some(item => item.themes.includes(theme.id)));
      assert.deepEqual(Object.keys(theme.scenarioHypotheses).sort(), ["broad", "disruption", "uneven"]);
      assert.ok(theme.failure && theme.evidenceNeeded && theme.stressIds.length > 0);
    }
    for (const item of THEME_COMPANIES) {
      assert.equal(item.fundedBacklog, null);
      assert.equal(Reflect.get(item, "buyScore"), undefined);
      assert.equal(Reflect.get(item, "portfolioWeight"), undefined);
      assert.ok(item.themes.every(id => HORIZON_THEMES.some(theme => theme.id === id)));
    }
  });
  test("each fact has a dated primary source, units, accounting basis and explicit flow/stock period", () => {
    for (const item of THEME_COMPANIES) {
      assert.equal(new URL(item.sourceUrl).protocol, "https:");
      assert.ok(["www.sec.gov", "investors.bwxt.com", "www.rockwellautomation.com"].includes(new URL(item.sourceUrl).hostname));
      assert.ok(Date.parse(item.publishedOn) <= Date.parse(item.checkedOn));
      assert.equal(item.checkedOn, THEME_RESEARCH_CHECKED_ON);
      for (const metric of item.metrics) {
        assert.ok(Number.isFinite(metric.value));
        assert.ok(Date.parse(metric.end) <= Date.parse(item.publishedOn));
        assert.ok(metric.start === null || Date.parse(metric.start) <= Date.parse(metric.end));
        assert.ok(["GAAP", "company-defined"].includes(metric.basis));
        assert.ok(["USD million", "%"].includes(metric.unit));
      }
    }
  });
  test("research freshness is a dated manual review heuristic, not a live or point-in-time claim", () => {
    const item = company("ETN");
    assert.equal(companyResearchStatus(item, asOf), "dated_evidence");
    assert.equal(companyResearchStatus(item, "2026-10-17"), "unavailable");
    assert.equal(companyResearchStatus(item, "2026-07-30"), "unavailable");
    assert.equal(companyResearchStatus(item, "2026-12-01"), "review_due");
    assert.equal(companyResearchStatus(item, "2027-04-01"), "review_due");
    assert.equal(companyResearchStatus(item, "not a date"), "unavailable");
    assert.equal(companyResearchStatus(item, "2026-02-31"), "unavailable");
    assert.equal(companyResearchStatus({ ...item, checkedOn: "2026-01-01" }, asOf), "unavailable");
  });
  test("reported milestones and management targets never become commissioned capacity merely as time passes", () => {
    const item = company("GEV");
    const reported = item.milestones[0];
    const overdue = item.milestones[1];
    const future = item.milestones[2];
    assert.equal(companyMilestoneStatus(reported, item, asOf), "Reported in dated source");
    assert.match(companyMilestoneStatus(overdue, item, asOf), /passed.*unverified/);
    assert.match(companyMilestoneStatus(future, item, asOf), /Management target/);
    assert.match(companyMilestoneStatus(future, item, "2029-01-02"), /unverified/);
    assert.equal(companyMilestoneStatus({ ...reported, date: "2030-01-01" }, item, asOf), "Reported date requires verification");
    assert.match(companyMilestoneStatus(reported, item, "2026-07-20"), /Not available/);
    assert.equal(companyMilestoneStatus(company("OKLO").milestones[0], company("OKLO"), asOf), "Requires verification");
  });
  test("backlog table units are converted once; funding remains unknown despite a large number", () => {
    const backlog = company("BWXT").metrics.find(metric => metric.label === "Total reported backlog")!;
    assert.equal(backlog.value, 8_398_081 / 1000);
    assert.equal(backlog.unit, "USD million");
    assert.equal(backlog.start, null);
    assert.equal(company("BWXT").fundedBacklog, null);
  });
  test("losses, six-month burn and investment purchases are not transformed into quarterly operating profit or a safe runway", () => {
    const item = company("OKLO");
    assert.equal(item.stage, "development_option");
    assert.equal(item.metrics[0].value, -48.536);
    assert.equal(item.metrics.find(metric => metric.label.includes("Operating cash"))!.value, -65.459);
    assert.equal(item.metrics.find(metric => metric.label.includes("Operating cash"))!.start, "2026-01-01");
    assert.equal(companyDerivedMetrics(item).marginPercent, null);
    assert.equal(Reflect.get(item, "cashRunway"), undefined);
    assert.match(item.shares!.note, /Anti-dilutive/);
  });
  test("historical share changes use matched weighted-average periods and are not a future dilution estimate", () => {
    near(companyDerivedMetrics(company("ETN")).shareCountChangePercent!, (389.5 / 391.4 - 1) * 100);
    near(companyDerivedMetrics(company("VRT")).shareCountChangePercent!, (392.746991 / 389.846827 - 1) * 100);
    assert.ok(companyDerivedMetrics(company("ETN")).shareCountChangePercent! < 0);
    assert.ok(companyDerivedMetrics(company("OKLO")).shareCountChangePercent! > 0);
    assert.equal(companyDerivedMetrics(company("GEV")).shareCountChangePercent, null);
    assert.equal(companyDerivedMetrics({ ...company("ETN"), shares: { ...company("ETN").shares!, previous: 0 } }).shareCountChangePercent, null);
  });
  test("derived GAAP margins retain their different definitions and reject invalid denominators", () => {
    near(companyDerivedMetrics(company("ETN")).marginPercent!, 823 / 8531 * 100);
    near(companyDerivedMetrics(company("VRT")).marginPercent!, 637.9 / 3274.3 * 100);
    near(companyDerivedMetrics(company("ROK")).marginPercent!, 470 / 2313 * 100);
    assert.notEqual(company("VRT").margin!.label, company("ROK").margin!.label);
    for (const denominator of [0, -1, NaN, Infinity]) assert.equal(companyDerivedMetrics({ ...company("VRT"), margin: { ...company("VRT").margin!, denominator } }).marginPercent, null);
  });
});

describe("Horizon illustrative valuation identity", () => {
  test("validates every input, rejects coercion/unknown keys and requires whole holding years", () => {
    assert.equal(run().version, HORIZON_THEMES_VERSION);
    for (const key of Object.keys(VALUATION_RULES) as ValuationKey[]) for (const invalid of [NaN, Infinity, -Infinity, "1", null, undefined, VALUATION_RULES[key].min - 0.01, VALUATION_RULES[key].max + 0.01]) assert.throws(() => run({ [key]: invalid }), new RegExp(key));
    for (const invalid of [null, [], Object.create(DEFAULT_VALUATION_INPUTS), { ...DEFAULT_VALUATION_INPUTS, constructor: 1 }]) assert.throws(() => runThemeValuation(invalid));
    assert.throws(() => run({ years: 1.5 }), /years/);
  });
  test("zero growth, no share change and no multiple change preserve price", () => {
    const result = run({ entryMultiple: 25, exitMultiple: 25, earningsGrowth: 0, shareGrowth: 0, requiredReturn: 0 });
    near(result.priceFactor, 1);
    near(result.annualPriceChange, 0);
    near(result.requiredAggregateGrowth, 0);
    assert.equal(result.meetsRequiredChange, true);
  });
  test("aggregate earnings growth reaches per-share price growth exactly once when shares and multiples are fixed", () => {
    const result = run({ entryMultiple: 25, exitMultiple: 25, earningsGrowth: 10, shareGrowth: 0 });
    near(result.priceFactor, Math.pow(1.1, 5));
    near(result.annualPriceChange, 10);
  });
  test("share dilution reduces per-share participation once; equal earnings and share growth cancel", () => {
    const undiluted = run({ entryMultiple: 25, exitMultiple: 25, earningsGrowth: 10, shareGrowth: 0 });
    const diluted = run({ entryMultiple: 25, exitMultiple: 25, earningsGrowth: 10, shareGrowth: 10 });
    near(diluted.priceFactor, 1);
    near(diluted.annualPriceChange, 0);
    assert.ok(diluted.priceFactor < undiluted.priceFactor);
    near(run({ entryMultiple: 25, exitMultiple: 25, earningsGrowth: 0, shareGrowth: -5 }).annualPriceChange, (1 / 0.95 - 1) * 100);
  });
  test("multiple compression can defeat positive earnings growth and negative outcomes remain negative", () => {
    const result = run({ entryMultiple: 80, exitMultiple: 10, earningsGrowth: 10, shareGrowth: 0 });
    assert.ok(result.earningsFactor > 1);
    assert.ok(result.priceFactor < 1);
    assert.ok(result.annualPriceChange < 0);
    assert.equal(result.meetsRequiredChange, false);
  });
  test("required aggregate growth algebra reproduces the chosen annual price hurdle", () => {
    const result = run();
    const solved = run({ earningsGrowth: result.requiredAggregateGrowth });
    near(solved.annualPriceChange, DEFAULT_VALUATION_INPUTS.requiredReturn);
    assert.equal(solved.meetsRequiredChange, true);
    assert.ok(result.requiredAggregateGrowth > DEFAULT_VALUATION_INPUTS.earningsGrowth);
  });
  test("a more expensive entry, a lower exit or more dilution cannot improve the same conditional result", () => {
    const base = run();
    assert.ok(run({ entryMultiple: 50 }).annualPriceChange < base.annualPriceChange);
    assert.ok(run({ exitMultiple: 15 }).annualPriceChange < base.annualPriceChange);
    assert.ok(run({ shareGrowth: 5 }).annualPriceChange < base.annualPriceChange);
    assert.ok(run({ earningsGrowth: 20 }).annualPriceChange > base.annualPriceChange);
  });
  test("bounded corners stay finite and exports reproduce calculations without mutating assumptions", () => {
    for (const boundary of ["min", "max"] as const) {
      const inputs = Object.fromEntries((Object.keys(VALUATION_RULES) as ValuationKey[]).map(key => [key, VALUATION_RULES[key][boundary]]));
      const before = JSON.stringify(inputs);
      const result = runThemeValuation(inputs);
      for (const value of Object.values(result)) if (typeof value === "number") assert.ok(Number.isFinite(value));
      assert.equal(JSON.stringify(inputs), before);
      assert.deepEqual(runThemeValuation(JSON.parse(JSON.stringify(result.assumptions))), result);
    }
    assert.equal(Reflect.get(run(), "buySignal"), undefined);
    assert.equal(Reflect.get(run(), "expectedReturn"), undefined);
  });
});

describe("Horizon separate trend context", () => {
  test("formed, fresh directions and their original price basis are preserved without a buy verdict", () => {
    const result = themeTrendContext([row], "ETN", "live", asOf);
    assert.equal(result.state, "available");
    assert.equal(result.label, "Daily ↓ · weekly ↑");
    assert.equal(result.row!.lastClose, 391.25);
    assert.equal(result.row!.adjusted, false);
    assert.equal(Reflect.get(result, "buySignal"), undefined);
    assert.equal(row.dailyTrend, -1);
  });
  test("missing coverage, request failure and empty payload are not bearish or bullish", () => {
    assert.equal(themeTrendContext([row], "OKLO", "live", asOf).state, "not_covered");
    for (const status of ["error", "pending", "loading", "unavailable"]) assert.equal(themeTrendContext([row], "ETN", status, asOf).state, "unavailable");
    assert.equal(themeTrendContext([], "ETN", "live", asOf).state, "not_covered");
  });
  test("stale or future scans/closes cannot be interpreted as a current trend", () => {
    for (const changes of [{ runDate: "2026-10-01" }, { lastCloseDate: "2026-10-01" }, { runDate: "2026-10-20" }, { lastCloseDate: "2026-10-20" }, { lastCloseDate: null }, { runDate: "2026-02-31" }, { lastCloseDate: "not a date" }]) assert.equal(themeTrendContext([{ ...row, ...changes }], "ETN", "live", asOf).state, "stale");
    assert.equal(themeTrendContext([row], "ETN", "live", "invalid").state, "unavailable");
  });
  test("both directions must be formed; malformed price or duplicate identity is unavailable", () => {
    for (const changes of [{ dailyTrend: 0 }, { weeklyTrend: null }, { dailyTrend: 2 }]) assert.equal(themeTrendContext([{ ...row, ...changes }], "ETN", "live", asOf).state, "warming");
    for (const lastClose of [null, 0, -1, NaN, Infinity]) assert.equal(themeTrendContext([{ ...row, lastClose }], "ETN", "live", asOf).state, "unavailable");
    assert.equal(themeTrendContext([row, row], "ETN", "live", asOf).state, "unavailable");
    assert.equal(themeTrendContext([{ ...row, runDate: "2026-10-14", lastCloseDate: "2026-10-16" }], "ETN", "live", asOf).state, "stale");
  });
});

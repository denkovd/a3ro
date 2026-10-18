import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildHorizonSnapshot } from "../src/horizon/engine";
import { HORIZON_INDICATORS, HORIZON_SOURCES } from "../src/horizon/indicators";
import { DEFAULT_STRESS_SETTINGS, STRESS_SETTING_RULES, evaluateHorizonStress, retrospectiveStressDiagnostics, scenarioStressWindows, shiftHorizonPeriod, stressSeries, validateStressSettings, type StressSettingKey } from "../src/horizon/stress";
import { HORIZON_LEDGER_MAX_BYTES, emptyHorizonLedger, horizonPredictionMetrics, parseHorizonLedger, recordHorizonPrediction, recordStressCheckpoint, reviewHorizonPredictions, stressCheckpointChanges, type PredictionDirection } from "../src/horizon/ledger";
import { HORIZON_SCENARIOS, runHorizonScenario } from "../src/horizon/scenarios";
import type { HorizonDataset, HorizonPoint, HorizonSnapshot } from "../src/horizon/types";

const checkedAt = "2026-10-18T12:00:00.000Z";
const decisionAt = "2026-10-18T12:00:01.000Z";
const reviewedAt = "2027-10-18T12:00:01.000Z";
const point = (period: string, value: number, status: string | null = null): HorizonPoint => ({ period, value, status });
const baseSeries: Record<string, HorizonPoint[]> = {
  productivity: [point("2025-Q1", 100), point("2025-Q2", 100), point("2026-Q1", 102), point("2026-Q2", 103)],
  real_compensation: [point("2025-Q1", 100), point("2025-Q2", 100), point("2026-Q1", 99), point("2026-Q2", 98)],
  unemployment: [point("2025-07", 4), point("2025-08", 4), point("2025-09", 4), point("2026-07", 4.3), point("2026-08", 4.3), point("2026-09", 4.3)],
  electricity_prices: [point("2025-07", 100), point("2025-08", 100), point("2025-09", 100), point("2026-07", 105), point("2026-08", 105), point("2026-09", 105)],
  wealth_top1: [point("2025-Q1", 30), point("2025-Q2", 30), point("2026-Q1", 31), point("2026-Q2", 31.2)],
  wealth_bottom50: [point("2025-Q1", 3), point("2025-Q2", 3), point("2026-Q1", 2.8), point("2026-Q2", 2.7)],
};

function snapshot(at = checkedAt, overrides: Record<string, HorizonPoint[]> = {}): HorizonSnapshot {
  const series = { ...baseSeries, ...overrides };
  const datasets: HorizonDataset[] = HORIZON_SOURCES.map(source => ({ source, retrievedAt: at, publicationDate: null, dataUrl: "https://example.test/official-fixture", series: HORIZON_INDICATORS.filter(indicator => indicator.source === source).map(indicator => ({ key: indicator.key, points: series[indicator.key] ?? [] })) }));
  return buildHorizonSnapshot(datasets, HORIZON_SOURCES.map(source => ({ source, health: "healthy", checkedAt: at, error: null })), new Date(at));
}

const assess = (source = snapshot(), settings = DEFAULT_STRESS_SETTINGS, at = decisionAt) => evaluateHorizonStress(source, settings, at);
const watch = (id: string, source = snapshot()) => assess(source).watches.find(item => item.id === id)!;
const makeCall = (prediction: PredictionDirection = "decline") => recordHorizonPrediction(emptyHorizonLedger(), snapshot(), DEFAULT_STRESS_SETTINGS, prediction, decisionAt, "call-1");
const outcomeSnapshot = (factor = 0.99, targetStatus: string | null = null, previousValue = 98) => snapshot("2027-10-18T12:00:00.000Z", { real_compensation: [...baseSeries.real_compensation.filter(item => item.period !== "2026-Q2"), point("2026-Q2", previousValue), point("2027-Q2", previousValue * factor, targetStatus)] });

describe("Horizon dated stress rules", () => {
  test("three complete persistent proxy rules can flag while five real-evidence gaps stay uncomputed", () => {
    const result = assess();
    assert.equal(result.watches.length, 8);
    assert.deepEqual(result.watches.slice(0, 3).map(item => item.status), ["watch", "watch", "watch"]);
    assert.equal(result.watches.filter(item => item.status === "needs_data").length, 5);
    assert.deepEqual(result.watches[0].evidence.map(item => item.samples.length), [2, 3]);
    assert.deepEqual(result.watches[0].evidence.map(item => item.latestPeriod), ["2026-Q2", "2026-09"]);
    assert.equal(result.watches[0].evidence[0].sourceSeries, "PRS85006153");
  });
  test("all settings require finite bounded numbers and reject missing/inherited/unknown keys", () => {
    assert.deepEqual(validateStressSettings(DEFAULT_STRESS_SETTINGS), DEFAULT_STRESS_SETTINGS);
    for (const key of Object.keys(STRESS_SETTING_RULES) as StressSettingKey[]) for (const invalid of [NaN, Infinity, "0.3", undefined, STRESS_SETTING_RULES[key].min - 0.01, STRESS_SETTING_RULES[key].max + 0.01]) assert.throws(() => validateStressSettings({ ...DEFAULT_STRESS_SETTINGS, [key]: invalid }));
    for (const invalid of [null, [], "settings", Object.create(DEFAULT_STRESS_SETTINGS), { ...DEFAULT_STRESS_SETTINGS, constructor: 1 }]) assert.throws(() => validateStressSettings(invalid));
    assert.throws(() => assess(snapshot(), DEFAULT_STRESS_SETTINGS, "invalid"), /date/);
  });
  test("period arithmetic respects quarter/month and year boundaries", () => {
    assert.equal(shiftHorizonPeriod("2026-Q1", "quarterly", -1), "2025-Q4");
    assert.equal(shiftHorizonPeriod("2026-Q2", "quarterly", 4), "2027-Q2");
    assert.equal(shiftHorizonPeriod("2026-01", "monthly", -1), "2025-12");
    assert.throws(() => shiftHorizonPeriod("2026-Q5", "quarterly", 1));
    assert.throws(() => shiftHorizonPeriod("2026-01", "monthly", 0.5));
  });
  test("one current observation cannot satisfy persistence or borrow an annual income observation", () => {
    const partial = snapshot(checkedAt, { real_compensation: [point("2025-Q2", 100), point("2026-Q2", 98)], real_median_dpi: [point("2025", 90000)] });
    assert.equal(watch("worker_proxy", partial).status, "unverified");
    const monthlyGap = snapshot(checkedAt, { unemployment: baseSeries.unemployment.filter(item => item.period !== "2026-08") });
    assert.equal(watch("worker_proxy", monthlyGap).status, "unverified");
    assert.equal(watch("worker_proxy", monthlyGap).evidence[1].samples[1].change, null);
    const priorGap = snapshot(checkedAt, { electricity_prices: baseSeries.electricity_prices.filter(item => item.period !== "2025-08") });
    assert.equal(watch("electricity_proxy", priorGap).status, "unverified");
  });
  test("partial conditions do not become a proxy watch, and nominal electricity is isolated", () => {
    const source = snapshot(checkedAt, { real_compensation: [point("2025-Q1", 100), point("2025-Q2", 100), point("2026-Q1", 101), point("2026-Q2", 101)] });
    assert.equal(watch("worker_proxy", source).status, "developing");
    assert.equal(watch("electricity_proxy", source).status, "watch");
    assert.equal(watch("cash_budgets", source).status, "needs_data");
    assert.equal(watch("regional_power", source).status, "needs_data");
  });
  test("clear conditions mean no rule flag, not a claim about broad household recovery", () => {
    const source = snapshot(checkedAt, { real_compensation: [point("2025-Q1", 100), point("2025-Q2", 100), point("2026-Q1", 100), point("2026-Q2", 100)], unemployment: baseSeries.unemployment.map(item => point(item.period, 4)) });
    assert.equal(watch("worker_proxy", source).status, "no_flag");
    assert.match(watch("worker_proxy", source).relief, /not proof of broad recovery/);
  });
  test("floating-point threshold equality is stable but meaningfully lower values fail", () => {
    assert.equal(watch("worker_proxy").status, "watch");
    const lower = snapshot(checkedAt, { unemployment: baseSeries.unemployment.map(item => point(item.period, item.period.startsWith("2026") ? 4.29999 : 4)) });
    assert.equal(watch("worker_proxy", lower).status, "developing");
  });
  test("wealth comparisons require the same two quarters, not unrelated latest periods", () => {
    const source = snapshot(checkedAt, { wealth_bottom50: [point("2024-Q4", 3), point("2025-Q1", 3), point("2025-Q4", 2.9), point("2026-Q1", 2.8)] });
    assert.equal(watch("ownership_proxy", source).status, "unverified");
    assert.ok(watch("ownership_proxy", source).evidence[0].issues.some(issue => issue.includes("same quarter")));
  });
  test("provider failures degrade independently and no failed source can clear a watch", () => {
    const source = snapshot();
    source.sources.find(item => item.source === "bls")!.health = "degraded";
    assert.equal(watch("worker_proxy", source).status, "unverified");
    assert.equal(watch("electricity_proxy", source).status, "unverified");
    assert.equal(watch("ownership_proxy", source).status, "watch");
    source.indicators.find(item => item.key === "wealth_top1")!.sourceHealth = "unavailable";
    assert.equal(watch("ownership_proxy", source).status, "unverified");
  });
  test("aging reference periods, old/future verification and future snapshots cannot imply a clear", () => {
    const source = snapshot();
    assert.equal(assess(source, DEFAULT_STRESS_SETTINGS, "2026-12-26T12:00:00Z").watches[0].status, "unverified");
    assert.equal(assess(source, DEFAULT_STRESS_SETTINGS, "2026-10-27T12:00:00Z").watches[0].status, "unverified");
    source.indicators.find(item => item.key === "real_compensation")!.verifiedAt = "2026-10-19T00:00:00Z";
    assert.equal(watch("worker_proxy", source).status, "unverified");
    source.generatedAt = "2027-01-01T00:00:00Z";
    assert.equal(watch("ownership_proxy", source).status, "unverified");
  });
  test("future, invalid, nonfinite, wrong-unit and nonpositive index points cannot manufacture a signal", () => {
    const source = snapshot();
    source.indicators.find(item => item.key === "real_compensation")!.points.push(point("2026-Q4", 1), point("2026-Q5", 1), point("2026-Q3", NaN), point("2026-Q3", 0));
    assert.equal(stressSeries(source, "real_compensation", decisionAt).at(-1)!.period, "2026-Q2");
    source.indicators.find(item => item.key === "real_compensation")!.frequency = "annual";
    assert.equal(watch("worker_proxy", source).status, "unverified");
  });
  test("retrospective diagnostics restrict reference periods but do not claim original publication availability", () => {
    const history = retrospectiveStressDiagnostics(snapshot(), DEFAULT_STRESS_SETTINGS, decisionAt);
    assert.equal(history.at(-1)!.period, "2026-Q2");
    const quarterEnd = evaluateHorizonStress(snapshot(), DEFAULT_STRESS_SETTINGS, "2026-06-30T00:00:00Z");
    assert.equal(quarterEnd.watches[0].evidence[1].samples.at(-1)!.period, "2025-09");
    assert.equal(quarterEnd.watches[0].status, "unverified");
    assert.equal(quarterEnd.watches[1].rawStatus, "unverified");
    assert.deepEqual(history, retrospectiveStressDiagnostics(snapshot(), DEFAULT_STRESS_SETTINGS, decisionAt));
  });
});

describe("Horizon prospective ledger and revisions", () => {
  test("a checkpoint freezes evidence, round-trips, deduplicates unchanged inputs and never mutates inputs", () => {
    const source = snapshot();
    const original = JSON.stringify(source);
    const first = recordStressCheckpoint(emptyHorizonLedger(), source, DEFAULT_STRESS_SETTINGS, decisionAt, "checkpoint-1");
    assert.deepEqual(parseHorizonLedger(JSON.stringify(first)), first);
    assert.equal(recordStressCheckpoint(first, source, DEFAULT_STRESS_SETTINGS, "2026-10-18T12:01:00Z", "checkpoint-2"), first);
    source.indicators[0].points[0].value = 999;
    assert.notEqual(first.checkpoints[0].snapshot.indicators[0].points[0].value, 999);
    assert.notEqual(JSON.stringify(source), original);
    assert.equal(emptyHorizonLedger().checkpoints.length, 0);
  });
  test("rule retractions require fresh comparable evidence and survive an unverified intervening checkpoint", () => {
    let ledger = recordStressCheckpoint(emptyHorizonLedger(), snapshot(), DEFAULT_STRESS_SETTINGS, decisionAt, "checkpoint-1");
    const blocked = snapshot();
    blocked.indicators.find(item => item.key === "real_compensation")!.sourceHealth = "degraded";
    assert.equal(stressCheckpointChanges(ledger.checkpoints, assess(blocked))[0].kind, "unverified");
    ledger = recordStressCheckpoint(ledger, blocked, DEFAULT_STRESS_SETTINGS, "2026-10-18T12:01:00Z", "checkpoint-2");
    const cleared = snapshot(checkedAt, { real_compensation: [point("2025-Q1", 100), point("2025-Q2", 100), point("2026-Q1", 101), point("2026-Q2", 101)] });
    assert.equal(stressCheckpointChanges(ledger.checkpoints, assess(cleared))[0].kind, "retracted");
    assert.equal(stressCheckpointChanges(ledger.checkpoints, assess(cleared, { ...DEFAULT_STRESS_SETTINGS, compensationFloor: 1 }))[0].kind, "settings_changed");
    assert.equal(ledger.checkpoints[0].assessment.watches[0].status, "watch");
  });
  test("a prospective call records a future exact target, persistence benchmark and frozen evidence", () => {
    const ledger = makeCall();
    const entry = ledger.predictions[0];
    assert.equal(entry.anchorPeriod, "2026-Q2");
    assert.equal(entry.targetPeriod, "2027-Q2");
    assert.equal(entry.persistencePrediction, "decline");
    assert.equal(entry.createdAt, decisionAt);
    assert.equal(entry.reviews.length, 0);
    assert.equal(ledger.checkpoints.length, 1);
    assert.deepEqual(parseHorizonLedger(JSON.stringify(ledger)), ledger);
    assert.throws(() => recordHorizonPrediction(ledger, snapshot(), DEFAULT_STRESS_SETTINGS, "not_decline", decisionAt, "call-2"), /already registered/);
  });
  test("missing/stale/degraded/old verification cannot register a prediction", () => {
    const bad = snapshot();
    bad.indicators.find(item => item.key === "real_compensation")!.sourceHealth = "degraded";
    assert.throws(() => recordHorizonPrediction(emptyHorizonLedger(), bad, DEFAULT_STRESS_SETTINGS, "decline", decisionAt, "bad"), /fresh/);
    assert.throws(() => recordHorizonPrediction(emptyHorizonLedger(), snapshot(), DEFAULT_STRESS_SETTINGS, "decline", reviewedAt, "bad"), /fresh/);
    const missing = snapshot(checkedAt, { real_compensation: [point("2026-Q2", 98)] });
    assert.throws(() => recordHorizonPrediction(emptyHorizonLedger(), missing, DEFAULT_STRESS_SETTINGS, "decline", decisionAt, "bad"), /prior-year/);
  });
  test("pending targets and missing exact outcomes stay pending, not failed forecasts or fabricated outcomes", () => {
    const ledger = makeCall();
    const pending = reviewHorizonPredictions(ledger, snapshot(), decisionAt);
    assert.equal(pending.pending, 1);
    assert.equal(pending.ledger.predictions[0].reviews.length, 0);
    const missing = snapshot("2027-10-18T12:00:00.000Z", { real_compensation: [...baseSeries.real_compensation, point("2027-Q3", 99)] });
    assert.equal(reviewHorizonPredictions(ledger, missing, reviewedAt).pending, 1);
    const metrics = horizonPredictionMetrics(pending.ledger);
    assert.equal(metrics.accuracy, null);
    assert.equal(metrics.persistenceAccuracy, null);
    assert.equal(metrics.meanCalendarLeadDays, null);
  });
  test("a verified target is scored once and unchanged refreshes do not duplicate reviews", () => {
    const ledger = makeCall();
    const outcome = outcomeSnapshot();
    const first = reviewHorizonPredictions(ledger, outcome, reviewedAt);
    assert.equal(first.added, 1);
    assert.equal(first.revised, 0);
    assert.equal(first.ledger.predictions[0].reviews[0].result, "hit");
    const repeated = reviewHorizonPredictions(first.ledger, outcome, "2027-10-18T12:02:00Z");
    assert.equal(repeated.added, 0);
    assert.equal(repeated.revised, 0);
    assert.equal(repeated.ledger.predictions[0].reviews.length, 1);
    assert.equal(ledger.predictions[0].reviews.length, 0);
    const metrics = horizonPredictionMetrics(first.ledger);
    assert.equal(metrics.accuracy, 1);
    assert.equal(metrics.persistenceAccuracy, 1);
    assert.ok(metrics.meanCalendarLeadDays! > 250 && metrics.meanCalendarLeadDays! < 260);
  });
  test("outcome and comparison-value revisions append and may retract a hit without rewriting prior reviews", () => {
    const first = reviewHorizonPredictions(makeCall(), outcomeSnapshot(), reviewedAt).ledger;
    const revised = reviewHorizonPredictions(first, outcomeSnapshot(1.01, "Revised", 99), "2027-10-18T12:02:00Z");
    assert.equal(revised.revised, 1);
    assert.equal(revised.ledger.predictions[0].reviews.length, 2);
    assert.equal(revised.ledger.predictions[0].reviews[0].result, "hit");
    assert.equal(revised.ledger.predictions[0].reviews[1].result, "false_alarm");
    assert.equal(revised.ledger.predictions[0].reviews[1].comparisonValue, 99);
    assert.equal(first.predictions[0].reviews.length, 1);
    const metrics = horizonPredictionMetrics(revised.ledger);
    assert.equal(metrics.scored, 1);
    assert.equal(metrics.counts.hit, 0);
    assert.equal(metrics.counts.false_alarm, 1);
    assert.equal(metrics.accuracy, 0);
  });
  test("classification metrics distinguish hits, false alarms, misses and correct non-declines", () => {
    for (const [prediction, factor, expected] of [["decline", 0.99, "hit"], ["decline", 1, "false_alarm"], ["not_decline", 0.99, "miss"], ["not_decline", 1, "correct_clear"]] as const) {
      const ledger = reviewHorizonPredictions(makeCall(prediction), outcomeSnapshot(factor), reviewedAt).ledger;
      assert.equal(ledger.predictions[0].reviews[0].result, expected);
      assert.equal(horizonPredictionMetrics(ledger).counts[expected], 1);
    }
  });
  test("unverified outcome evidence cannot silently change an earlier saved result", () => {
    const first = reviewHorizonPredictions(makeCall(), outcomeSnapshot(), reviewedAt).ledger;
    const failed = outcomeSnapshot(1.01);
    failed.sources.find(item => item.source === "bls")!.health = "unavailable";
    const review = reviewHorizonPredictions(first, failed, "2027-10-18T12:02:00Z");
    assert.equal(review.unverified, 1);
    assert.equal(review.ledger.predictions[0].reviews.length, 1);
    assert.equal(review.ledger.predictions[0].reviews[0].result, "hit");
  });
  test("invalid/corrupt/oversize records and forged dates, settings or outcome arithmetic are rejected", () => {
    const ledger = makeCall();
    for (const input of ["not json", "null", "[]", JSON.stringify({ ...ledger, version: 2 }), JSON.stringify({ ...ledger, ruleVersion: "future" }), " ".repeat(HORIZON_LEDGER_MAX_BYTES + 1)]) assert.throws(() => parseHorizonLedger(input));
    const changed = structuredClone(ledger);
    changed.checkpoints[0].assessment.settings.unemploymentRise = 0.9;
    assert.throws(() => parseHorizonLedger(JSON.stringify(changed)), /assessment/);
    const backdated = structuredClone(ledger);
    backdated.predictions[0].createdAt = "2027-07-01T00:00:00Z";
    assert.throws(() => parseHorizonLedger(JSON.stringify(backdated)), /prospectively/);
    const scored = reviewHorizonPredictions(ledger, outcomeSnapshot(), reviewedAt).ledger;
    scored.predictions[0].reviews[0].annualChange = 50;
    assert.throws(() => parseHorizonLedger(JSON.stringify(scored)), /match/);
    const corrupt = structuredClone(ledger);
    corrupt.checkpoints[0].snapshot.indicators[0].points[0].value = NaN;
    assert.throws(() => parseHorizonLedger(JSON.stringify(corrupt)), /observation/);
  });
});

describe("Horizon scenario-only pressure windows", () => {
  const anchor = { period: "2026-Q2", year: 2026, productivity: 103, realCompensation: 98, snapshotGeneratedAt: checkedAt, evidence: [] };
  test("scenario windows distinguish no crossing from an annual two-sample budget-gap spell", () => {
    const broad = scenarioStressWindows(runHorizonScenario(anchor, HORIZON_SCENARIOS[0].assumptions));
    assert.equal(broad[0].firstSample, null);
    const disruption = scenarioStressWindows(runHorizonScenario(anchor, HORIZON_SCENARIOS[2].assumptions));
    assert.ok(disruption[0].firstSample);
    assert.ok(disruption[0].secondSample);
    assert.ok(disruption[0].windowAfter! < disruption[0].windowBy!);
    assert.equal(disruption[1].firstSample, null);
  });
  test("a transient breach is not labelled persistent; a later spell has its own onset bracket", () => {
    const run = runHorizonScenario(anchor, HORIZON_SCENARIOS[0].assumptions);
    run.points[2].households[0].roomReal = -1;
    let window = scenarioStressWindows(run)[0];
    assert.equal(window.firstSample, "2028-Q2");
    assert.equal(window.secondSample, null);
    run.points[6].households[0].roomReal = -1;
    run.points[7].households[0].roomReal = -2;
    window = scenarioStressWindows(run)[0];
    assert.equal(window.windowAfter, "2031-Q2");
    assert.equal(window.windowBy, "2032-Q2");
    assert.equal(window.secondSample, "2033-Q2");
  });
  test("zero spending room and an energy ratio exactly 1.1 are not strict threshold breaches", () => {
    const run = runHorizonScenario(anchor, HORIZON_SCENARIOS[0].assumptions);
    run.points.forEach(item => { item.households[0].roomReal = 0; item.demandSupplyRatio = 1.1; });
    const windows = scenarioStressWindows(run);
    assert.equal(windows[0].firstSample, null);
    assert.equal(windows[2].firstSample, null);
  });
});

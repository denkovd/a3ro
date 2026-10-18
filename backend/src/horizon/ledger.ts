import { horizonPeriodEnd } from "./engine";
import { HORIZON_INDICATORS } from "./indicators";
import { HORIZON_STRESS_VERSION, evaluateHorizonStress, shiftHorizonPeriod, stressEvidenceIssues, stressSeries, validateStressSettings, type StressAssessment, type StressSettings } from "./stress";
import type { HorizonSnapshot } from "./types";

export const HORIZON_LEDGER_KEY = "a3ro.horizon.ledger.v1";
export const HORIZON_LEDGER_MAX_BYTES = 3_000_000;
export const HORIZON_LEDGER_LIMITS = { checkpoints: 30, predictions: 20, reviews: 20 };
export type PredictionDirection = "decline" | "not_decline";
export type PredictionResult = "hit" | "false_alarm" | "miss" | "correct_clear";

export interface StressCheckpoint {
  id: string;
  createdAt: string;
  snapshot: HorizonSnapshot;
  assessment: StressAssessment;
}

export interface PredictionReview {
  reviewedAt: string;
  snapshotGeneratedAt: string;
  sourceVerifiedAt: string;
  latestSourcePeriod: string;
  targetValue: number;
  comparisonValue: number;
  targetSourceStatus: string | null;
  comparisonSourceStatus: string | null;
  annualChange: number;
  outcome: PredictionDirection;
  result: PredictionResult;
  persistenceCorrect: boolean;
}

export interface HorizonPrediction {
  id: string;
  createdAt: string;
  checkpointId: string;
  metric: "real_compensation_yoy";
  anchorPeriod: string;
  anchorAnnualChange: number;
  targetPeriod: string;
  prediction: PredictionDirection;
  persistencePrediction: PredictionDirection;
  reviews: PredictionReview[];
}

export interface HorizonLedger {
  version: 1;
  ruleVersion: typeof HORIZON_STRESS_VERSION;
  checkpoints: StressCheckpoint[];
  predictions: HorizonPrediction[];
}

const direction = (change: number): PredictionDirection => change < -1e-9 ? "decline" : "not_decline";
const resultFor = (prediction: PredictionDirection, outcome: PredictionDirection): PredictionResult => prediction === "decline" ? outcome === "decline" ? "hit" : "false_alarm" : outcome === "decline" ? "miss" : "correct_clear";

export function emptyHorizonLedger(): HorizonLedger {
  return { version: 1, ruleVersion: HORIZON_STRESS_VERSION, checkpoints: [], predictions: [] };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid ledger object.");
  return value as Record<string, unknown>;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function validateFrozenSnapshot(input: unknown): HorizonSnapshot {
  const value = record(input);
  if (value.version !== 1 || value.stage !== 1 || !validDate(value.generatedAt) || !Array.isArray(value.indicators) || value.indicators.length > 10 || !Array.isArray(value.sources) || value.sources.length > 3 || !["available", "unavailable"].includes(String(value.archive)) || !["ready", "partial", "unavailable"].includes(String(value.status))) throw new Error("Invalid frozen source snapshot.");
  const coverage = record(value.coverage);
  if (![coverage.available, coverage.current, coverage.total].every(item => typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 10)) throw new Error("Invalid source coverage.");
  const keys = new Set<string>();
  for (const item of value.indicators) {
    const reading = record(item);
    const definition = HORIZON_INDICATORS.find(indicator => indicator.key === reading.key);
    if (!definition || keys.has(definition.key) || reading.source !== definition.source || reading.frequency !== definition.frequency || reading.unit !== definition.unit || !Array.isArray(reading.points) || reading.points.length > 1200 || !["healthy", "degraded", "unavailable"].includes(String(reading.sourceHealth)) || (reading.verifiedAt !== null && !validDate(reading.verifiedAt))) throw new Error("Invalid frozen indicator.");
    keys.add(definition.key);
    for (const pointInput of reading.points) {
      const point = record(pointInput);
      if (typeof point.period !== "string" || !horizonPeriodEnd(point.period, definition.frequency) || typeof point.value !== "number" || !Number.isFinite(point.value) || (point.status !== null && (typeof point.status !== "string" || point.status.length > 4096))) throw new Error("Invalid frozen observation.");
    }
  }
  const sources = new Set<string>();
  for (const item of value.sources) {
    const source = record(item);
    if (!["bls", "bea", "dfa"].includes(String(source.source)) || sources.has(String(source.source)) || !["healthy", "degraded", "unavailable"].includes(String(source.health)) || (source.checkedAt !== null && !validDate(source.checkedAt))) throw new Error("Invalid frozen provider.");
    sources.add(String(source.source));
  }
  return input as HorizonSnapshot;
}

export function parseHorizonLedger(serialized: string): HorizonLedger {
  if (new TextEncoder().encode(serialized).length > HORIZON_LEDGER_MAX_BYTES) throw new Error("The local ledger exceeds its size limit. Export it before clearing space.");
  const value = record(JSON.parse(serialized));
  if (value.version !== 1 || value.ruleVersion !== HORIZON_STRESS_VERSION || !Array.isArray(value.checkpoints) || !Array.isArray(value.predictions) || value.checkpoints.length > HORIZON_LEDGER_LIMITS.checkpoints || value.predictions.length > HORIZON_LEDGER_LIMITS.predictions) throw new Error("Unsupported or invalid ledger version/size. Existing data has not been overwritten.");
  const ids = new Set<string>();
  let lastCheckpointTime = -Infinity;
  const checkpoints = value.checkpoints.map(input => {
    const checkpoint = record(input);
    if (!validId(checkpoint.id) || ids.has(checkpoint.id) || !validDate(checkpoint.createdAt) || Date.parse(checkpoint.createdAt) < lastCheckpointTime) throw new Error("Invalid checkpoint identity/date.");
    ids.add(checkpoint.id);
    lastCheckpointTime = Date.parse(checkpoint.createdAt);
    const snapshot = validateFrozenSnapshot(checkpoint.snapshot);
    if (Date.parse(snapshot.generatedAt) > lastCheckpointTime) throw new Error("Checkpoint cannot precede its source snapshot.");
    const assessment = record(checkpoint.assessment);
    const expected = evaluateHorizonStress(snapshot, assessment.settings, checkpoint.createdAt);
    if (JSON.stringify(expected) !== JSON.stringify(assessment)) throw new Error("Stored assessment does not match its frozen evidence and rule version.");
    return input as StressCheckpoint;
  });
  const targets = new Set<string>();
  let lastPredictionTime = -Infinity;
  for (const input of value.predictions) {
    const prediction = record(input);
    const checkpoint = checkpoints.find(item => item.id === prediction.checkpointId);
    if (!validId(prediction.id) || ids.has(prediction.id) || !validDate(prediction.createdAt) || Date.parse(prediction.createdAt) < lastPredictionTime || !checkpoint || Date.parse(checkpoint.createdAt) > Date.parse(prediction.createdAt) || prediction.metric !== "real_compensation_yoy" || !["decline", "not_decline"].includes(String(prediction.prediction)) || typeof prediction.anchorPeriod !== "string" || !horizonPeriodEnd(prediction.anchorPeriod, "quarterly") || prediction.targetPeriod !== shiftHorizonPeriod(prediction.anchorPeriod, "quarterly", 4) || targets.has(String(prediction.targetPeriod)) || !Array.isArray(prediction.reviews) || prediction.reviews.length > HORIZON_LEDGER_LIMITS.reviews) throw new Error("Invalid or duplicate prediction.");
    ids.add(prediction.id);
    targets.add(String(prediction.targetPeriod));
    lastPredictionTime = Date.parse(prediction.createdAt);
    const points = stressSeries(checkpoint.snapshot, "real_compensation", prediction.createdAt);
    const latest = points.at(-1);
    const previous = points.find(point => point.period === shiftHorizonPeriod(prediction.anchorPeriod as string, "quarterly", -4));
    const annualChange = latest && previous ? (latest.value / previous.value - 1) * 100 : null;
    if (!latest || latest.period !== prediction.anchorPeriod || annualChange === null || prediction.anchorAnnualChange !== annualChange || prediction.persistencePrediction !== direction(annualChange) || horizonPeriodEnd(String(prediction.targetPeriod), "quarterly")!.getTime() <= lastPredictionTime || stressEvidenceIssues(checkpoint.snapshot, "real_compensation", prediction.createdAt).length > 0) throw new Error("Prediction was not prospectively anchored to verified evidence.");
    let lastReviewTime = lastPredictionTime;
    for (const reviewInput of prediction.reviews) {
      const review = record(reviewInput);
      const targetEnd = horizonPeriodEnd(String(prediction.targetPeriod), "quarterly")!.getTime();
      if (!validDate(review.reviewedAt) || !validDate(review.snapshotGeneratedAt) || !validDate(review.sourceVerifiedAt) || Date.parse(review.reviewedAt) < lastReviewTime || Date.parse(review.reviewedAt) < targetEnd || Date.parse(review.snapshotGeneratedAt) > Date.parse(review.reviewedAt) || Date.parse(review.sourceVerifiedAt) < targetEnd || Date.parse(review.sourceVerifiedAt) > Date.parse(review.reviewedAt) || Date.parse(review.reviewedAt) - Date.parse(review.sourceVerifiedAt) > 7 * 86_400_000 || typeof review.latestSourcePeriod !== "string" || !horizonPeriodEnd(review.latestSourcePeriod, "quarterly") || review.latestSourcePeriod < String(prediction.targetPeriod) || horizonFreshCurrent(review.latestSourcePeriod, review.reviewedAt) === false || ![review.targetValue, review.comparisonValue, review.annualChange].every(item => typeof item === "number" && Number.isFinite(item)) || Number(review.targetValue) <= 0 || Number(review.comparisonValue) <= 0 || ![review.targetSourceStatus, review.comparisonSourceStatus].every(item => item === null || typeof item === "string" && item.length <= 4096)) throw new Error("Invalid prediction review evidence/date.");
      const change = (Number(review.targetValue) / Number(review.comparisonValue) - 1) * 100;
      if (review.annualChange !== change || review.outcome !== direction(change) || review.result !== resultFor(prediction.prediction as PredictionDirection, direction(change)) || review.persistenceCorrect !== (prediction.persistencePrediction === direction(change))) throw new Error("Prediction review does not match its evidence.");
      lastReviewTime = Date.parse(review.reviewedAt);
    }
  }
  return value as unknown as HorizonLedger;
}

function horizonFreshCurrent(period: string, evaluatedAt: string): boolean {
  const end = horizonPeriodEnd(period, "quarterly");
  return !!end && end.getTime() <= Date.parse(evaluatedAt) && Date.parse(evaluatedAt) - end.getTime() <= 170 * 86_400_000;
}

function fitLedger(ledger: HorizonLedger): HorizonLedger {
  return parseHorizonLedger(JSON.stringify(ledger));
}

export function recordStressCheckpoint(ledger: HorizonLedger, snapshot: HorizonSnapshot, settings: StressSettings, createdAt: string, id: string): HorizonLedger {
  validateStressSettings(settings);
  if (ledger.checkpoints.length >= HORIZON_LEDGER_LIMITS.checkpoints) throw new Error("Checkpoint limit reached. Export a backup before clearing the local ledger.");
  const assessment = evaluateHorizonStress(snapshot, settings, createdAt);
  const latest = ledger.checkpoints.at(-1);
  if (latest && JSON.stringify(latest.snapshot) === JSON.stringify(snapshot) && JSON.stringify(latest.assessment.settings) === JSON.stringify(settings) && latest.assessment.watches.every((watch, index) => watch.status === assessment.watches[index].status)) return ledger;
  return fitLedger({ ...ledger, checkpoints: [...ledger.checkpoints, structuredClone({ id, createdAt, snapshot, assessment })] });
}

export function recordHorizonPrediction(ledger: HorizonLedger, snapshot: HorizonSnapshot, settings: StressSettings, prediction: PredictionDirection, createdAt: string, id: string): HorizonLedger {
  if (stressEvidenceIssues(snapshot, "real_compensation", createdAt).length > 0) throw new Error("A prediction requires fresh, healthy real-compensation evidence verified within seven days.");
  const points = stressSeries(snapshot, "real_compensation", createdAt);
  const latest = points.at(-1)!;
  const previous = points.find(point => point.period === shiftHorizonPeriod(latest.period, "quarterly", -4));
  if (!previous) throw new Error("The exact prior-year compensation observation is missing.");
  const targetPeriod = shiftHorizonPeriod(latest.period, "quarterly", 4);
  if (ledger.predictions.some(item => item.targetPeriod === targetPeriod)) throw new Error(`A prediction for ${targetPeriod} is already registered. Its original call is preserved.`);
  if (ledger.predictions.length >= HORIZON_LEDGER_LIMITS.predictions) throw new Error("Prediction limit reached. Export a backup before clearing the local ledger.");
  const next = recordStressCheckpoint(ledger, snapshot, settings, createdAt, `${id}-evidence`);
  const anchorAnnualChange = (latest.value / previous.value - 1) * 100;
  const entry: HorizonPrediction = { id, createdAt, checkpointId: next.checkpoints.at(-1)!.id, metric: "real_compensation_yoy", anchorPeriod: latest.period, anchorAnnualChange, targetPeriod, prediction, persistencePrediction: direction(anchorAnnualChange), reviews: [] };
  return fitLedger({ ...next, predictions: [...next.predictions, entry] });
}

export function reviewHorizonPredictions(ledger: HorizonLedger, snapshot: HorizonSnapshot, reviewedAt: string) {
  if (!validDate(reviewedAt)) throw new Error("Invalid review date.");
  const summary = { added: 0, revised: 0, pending: 0, unverified: 0 };
  const predictions = ledger.predictions.map(prediction => {
    const targetEnd = horizonPeriodEnd(prediction.targetPeriod, "quarterly")!.getTime();
    if (targetEnd > Date.parse(reviewedAt)) { summary.pending += 1; return prediction; }
    if (stressEvidenceIssues(snapshot, "real_compensation", reviewedAt).length > 0) { summary.unverified += 1; return prediction; }
    const points = stressSeries(snapshot, "real_compensation", reviewedAt);
    const target = points.find(point => point.period === prediction.targetPeriod);
    const previous = points.find(point => point.period === prediction.anchorPeriod);
    if (!target || !previous) { summary.pending += 1; return prediction; }
    const annualChange = (target.value / previous.value - 1) * 100;
    const outcome = direction(annualChange);
    const reading = snapshot.indicators.find(item => item.key === "real_compensation")!;
    const review: PredictionReview = { reviewedAt, snapshotGeneratedAt: snapshot.generatedAt, sourceVerifiedAt: reading.verifiedAt!, latestSourcePeriod: points.at(-1)!.period, targetValue: target.value, comparisonValue: previous.value, targetSourceStatus: target.status, comparisonSourceStatus: previous.status, annualChange, outcome, result: resultFor(prediction.prediction, outcome), persistenceCorrect: prediction.persistencePrediction === outcome };
    const last = prediction.reviews.at(-1);
    if (last && last.targetValue === target.value && last.comparisonValue === previous.value && last.targetSourceStatus === target.status && last.comparisonSourceStatus === previous.status) return prediction;
    if (prediction.reviews.length >= HORIZON_LEDGER_LIMITS.reviews) throw new Error("A prediction's review limit is reached. Export a backup before clearing the local ledger.");
    if (last) summary.revised += 1; else summary.added += 1;
    return { ...prediction, reviews: [...prediction.reviews, review] };
  });
  return { ledger: fitLedger({ ...ledger, predictions }), ...summary };
}

export function stressCheckpointChanges(checkpoints: StressCheckpoint[], current: StressAssessment) {
  return current.watches.filter(watch => watch.evidence.length > 0).flatMap(watch => {
    const previous = [...checkpoints].reverse().find(checkpoint => checkpoint.assessment.watches.some(item => item.id === watch.id && item.status !== "unverified"));
    if (!previous) return [];
    const old = previous.assessment.watches.find(item => item.id === watch.id)!;
    const settingKeys: (keyof StressSettings)[] = watch.id === "worker_proxy" ? ["compensationFloor", "unemploymentRise"] : watch.id === "electricity_proxy" ? ["electricityRise"] : ["wealthRise"];
    const changedSettings = settingKeys.some(key => previous.assessment.settings[key] !== current.settings[key]);
    return [{ id: watch.id, title: watch.title, previousStatus: old.status, status: watch.status, kind: changedSettings ? "settings_changed" : watch.status === "unverified" ? "unverified" : old.status === "watch" && watch.status !== "watch" ? "retracted" : old.status !== watch.status ? "changed" : "unchanged" }];
  });
}

export function horizonPredictionMetrics(ledger: HorizonLedger) {
  const scored = ledger.predictions.filter(prediction => prediction.reviews.length > 0);
  const counts: Record<PredictionResult, number> = { hit: 0, false_alarm: 0, miss: 0, correct_clear: 0 };
  for (const prediction of scored) counts[prediction.reviews.at(-1)!.result] += 1;
  return { registered: ledger.predictions.length, pending: ledger.predictions.length - scored.length, scored: scored.length, counts, accuracy: scored.length ? (counts.hit + counts.correct_clear) / scored.length : null, persistenceAccuracy: scored.length ? scored.filter(prediction => prediction.reviews.at(-1)!.persistenceCorrect).length / scored.length : null, meanCalendarLeadDays: scored.length ? scored.reduce((total, prediction) => total + (horizonPeriodEnd(prediction.targetPeriod, "quarterly")!.getTime() - Date.parse(prediction.createdAt)) / 86_400_000, 0) / scored.length : null };
}

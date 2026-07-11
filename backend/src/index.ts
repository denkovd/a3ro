/* Public surface of the oil-price backend.
   API route handlers / cron entrypoints import from here only. */

export * from "./core/types";
export * from "./core/corridorTypes";
export * from "./core/scoreTypes";
export * from "./core/seasonalTypes";
export { toUsdPerBarrel, PRICE_BOUNDS, NormalizationError } from "./core/units";
export {
  classifyStaleness, isUsable, isAlertGrade,
  marketCloseUtc, zonedTimeToUtc, MARKET_CLOSE, isoWeekOf,
} from "./core/time";

export type { OilPriceSource } from "./sources/OilPriceSource";
export { BaseSource } from "./sources/OilPriceSource";
export { EiaSource } from "./sources/eia";
export { buildSources, getSource } from "./sources/registry";
export { getJsonForSource } from "./sources/http";

export type { CorridorSource, CorridorSourceDescriptor } from "./sources/CorridorSource";
export { CorridorBaseSource } from "./sources/CorridorSource";
export { EiaUsGulfSource } from "./sources/eiaCorridor";
export { EiaInventorySource, thousandBblToMillionBbl, INVENTORY_SERIES } from "./sources/eiaInventory";
export { MpaSingaporeSource, thousandTonnesToMt, MPA_DATASETS } from "./sources/mpaSingapore";
export { PortWatchSource, tonsToMegatons } from "./sources/portwatch";
export { buildCorridorSources, getCorridorSource } from "./sources/corridorRegistry";
export { fetchGateBaselines } from "./sources/portwatchBaselines";
export { fetchSeasonalBaselines, groupByIsoWeek, SEASONAL_METRICS } from "./sources/eiaSeasonal";

export { createDb } from "./storage/db";
export type { Queryable } from "./storage/db";
export {
  getLatestQuotes, getDailySeries, getLatestDailyPrice,
  insertObservations,
} from "./storage/priceRepo";
export {
  insertCorridorMetrics, getLatestCorridorMetrics, getCorridorMetricSeries,
} from "./storage/corridorRepo";
export {
  upsertBaselines, getBaselines, getBaselineAgeDays,
} from "./storage/baselineRepo";
export {
  upsertSeasonalBaselines, getSeasonalBaselines, getSeasonalAgeDays,
} from "./storage/seasonalRepo";
export {
  upsertScoreSnapshots, getLatestScoreSnapshots,
} from "./storage/scoreRepo";
export {
  getUndeliveredAlertEvents, markAlertEventDelivered,
} from "./storage/alertRepo";
export type { AlertEvent } from "./storage/alertRepo";
// site domain — pro-tier lead capture (app/api/leads), unrelated to price/corridor ingestion
export { insertLead } from "./storage/leadRepo";

// Module 4 — Regime Shift Finder (Money Line engine + daily scan)
export {
  runMoneyLine, computeRegime, rankSnapshots, resampleWeekly,
  closedDailyBars, weekStartOf, verdictOf,
  DONCHIAN_LEN, NEWLY_BULLISH_MAX_AGE,
} from "./regime/engine";
export type {
  RegimeBar, RegimeSnapshot, RegimeVerdict, TimeframeState,
  Trend, UniverseEntry, AssetClass, Flip,
} from "./regime/types";
export { REGIME_UNIVERSE } from "./regime/universe";
export { fetchDailyHistory, parseYahooDaily, REGIME_SOURCE_ID } from "./regime/yahooHistory";
export { runRegimeCycle } from "./regime/pipeline";
export type { RegimeCycleReport } from "./regime/pipeline";
export {
  upsertRegimeSnapshots, getLatestRegimeSnapshots,
} from "./storage/regimeRepo";
export type { RegimeSnapshotRow } from "./storage/regimeRepo";

export { runIngestionCycle } from "./ingest/pipeline";
export type { CycleReport } from "./ingest/pipeline";
export { runCorridorCycle } from "./ingest/corridorPipeline";
export type { CorridorCycleReport } from "./ingest/corridorPipeline";
export { runBaselineCycle } from "./ingest/baselineCycle";
export type { BaselineCycleReport } from "./ingest/baselineCycle";
export { runSeasonalCycle } from "./ingest/seasonalCycle";
export type { SeasonalCycleReport } from "./ingest/seasonalCycle";
export { runScoreCycle } from "./ingest/scorePipeline";
export type { ScoreCycleReport } from "./ingest/scorePipeline";

// Composite scores (Phase 1: spread + Flow Stress; Phase 2: Tightness)
// - see docs/scores-plan.md
export {
  computeSpreadSignal, computeFlowStress, combineComposite,
  computeExportStrengthLeg, computeStockDrawLeg, computeThroughputDeviationLeg,
  spreadLegFrom,
  computeTightness, computeSeasonalTightnessLeg, computeUtilizationLeg, crackPendingLeg,
  alignSpread, percentileOf, clamp01,
} from "./scores/engine";
export type { GateThroughput, StockLevel } from "./scores/engine";
export type { PricePoint, CombineOptions } from "./scores/engine";
export { resolveLatestQuote, resolveDailyClose, DISAGREEMENT_TOLERANCE, SUSPECT_DEVIATION } from "./ingest/resolve";
export { evaluateRule } from "./alerts/rules";
export type { AlertRule, AlertState, EvalContext } from "./alerts/rules";

export { deliverPendingAlerts, consoleAlertDelivery } from "./alerts/deliver";
export type { AlertDeliveryFn, DeliveryReport } from "./alerts/deliver";

// Module 5 — Bull Market Finder (whole-market screener, GitHub Actions scan)
export {
  atrPct, pctChange, computeBullSnapshot, rankBullSnapshots, computeTransitions,
  ATR_LEN, RS_LOOKBACK,
} from "./bull/engine";
export {
  contractSymbols, detectRoll, applyBackAdjustment, verifyAdjustment,
  matchContinuousToContracts, closesMatch, MONTH_CODES, MATCH_TOLERANCE,
} from "./bull/rolls";
export type {
  BullTier, BullUniverseEntry, BullSnapshot, BullTransition,
  BarSourceAdapter, BarRange, AdapterId, AdapterHealthEntry,
  RollEvent, RollProbeResult,
} from "./bull/types";
export { BULL_UNIVERSE, buildBullUniverse, benchmarkFor, toYahooSymbol } from "./bull/universe";
export {
  fetchBarsWithFallback, defaultRegistry, isStale,
  yahooAdapter, makeStooqAdapter, makeBinanceAdapter, makeAlphaVantageAdapter,
  parseStooqCsv, parseBinanceKlines, parseAlphaVantageDaily,
  stooqSymbolFor, binanceSymbolFor,
} from "./bull/adapters";
export type { AdapterRegistry, FallbackResult } from "./bull/adapters";
export { runBullScan } from "./bull/pipeline";
export type { BullScanReport, BullScanOptions } from "./bull/pipeline";
export {
  upsertBars, loadBars, latestBarDate, shiftAdjBarsBefore,
  insertRoll, getRolls, upsertBullSnapshots, getPreviousVerdicts,
  insertTransitions, insertHealthEntries,
  getLatestBullSnapshots, getRecentTransitions,
} from "./storage/bullRepo";
export type { BullSnapshotRow, BullTransitionRow, BarSeries } from "./storage/bullRepo";

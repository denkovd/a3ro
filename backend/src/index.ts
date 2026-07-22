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
export { EiaSpotProductsSource, dollarsPerGallonToPerBarrel, GALLONS_PER_BARREL, SPOT_PRODUCT_SERIES } from "./sources/eiaSpotProducts";
export { MpaSingaporeSource, thousandTonnesToMt, MPA_DATASETS } from "./sources/mpaSingapore";
export { PortWatchSource, tonsToMegatons } from "./sources/portwatch";
export { buildCorridorSources, getCorridorSource } from "./sources/corridorRegistry";
export { fetchGateBaselines } from "./sources/portwatchBaselines";
export { fetchSeasonalBaselines, groupByIsoWeek, SEASONAL_METRICS } from "./sources/eiaSeasonal";
export { fetchFredSeries, fetchMacroPanel, parseFredCsv, MACRO_SERIES } from "./sources/fredMacro";
export type { MacroSeries, MacroObservation, FredSeriesConfig } from "./sources/fredMacro";
export { computeMacroRegime, computeMacroPressure, computePositioning, yoyAndMomentum } from "./macro/engine";
export type {
  MacroRegimeSnapshot, MacroPressureSnapshot, MacroQuadrant, MacroAxisRead,
  PositioningSnapshot, PositioningStance,
} from "./macro/types";
export { upsertMacroSnapshot, getLatestMacroSnapshot } from "./storage/macroRepo";
export type { MacroSnapshotRow } from "./storage/macroRepo";
export { fetchCotPositioning, parseCotRows, WTI_CONTRACT_CODE } from "./sources/cftcCot";
export type { CotSeries, CotObservation } from "./sources/cftcCot";
export { upsertPositioning, getLatestPositioning } from "./storage/positioningRepo";
export type { PositioningRow } from "./storage/positioningRepo";
export { upsertTapeSnapshot, getLatestTapeSnapshot } from "./storage/tapeRepo";
export type { TapeRow } from "./storage/tapeRepo";

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
  getUndeliveredAlertEvents, markAlertEventDelivered, getRecentAlertEvents,
  ensureDefaultAlertRules,
} from "./storage/alertRepo";
export type { AlertEvent, AlertEventView } from "./storage/alertRepo";
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
export { runMacroCycle } from "./ingest/macroCycle";
export type { MacroCycleReport } from "./ingest/macroCycle";
export { runPositioningCycle } from "./ingest/positioningCycle";
export type { PositioningCycleReport } from "./ingest/positioningCycle";
export { runScoreCycle } from "./ingest/scorePipeline";
export type { ScoreCycleReport } from "./ingest/scorePipeline";

// Composite scores (Phase 1: spread + Flow Stress; Phase 2: Tightness)
// - see docs/scores-plan.md
export {
  computeSpreadSignal, computeFlowStress, combineComposite,
  computeExportStrengthLeg, computeStockDrawLeg, computeThroughputDeviationLeg,
  spreadLegFrom,
  computeTightness, computeSeasonalTightnessLeg, computeUtilizationLeg, computeCrackLeg,
  computeTapeStance,
  alignSpread, percentileOf, clamp01,
} from "./scores/engine";
export type { GateThroughput, StockLevel, TapeStance, TapeSnapshot } from "./scores/engine";
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
  getLatestBullSnapshots, getRecentTransitions, getLatestVerdictsBySymbol,
} from "./storage/bullRepo";
export type { BullSnapshotRow, BullTransitionRow, BarSeries } from "./storage/bullRepo";
export {
  STRATEGIES, STRATEGY_IDS, DEFAULT_STRATEGY, isStrategyId,
  deriveStrategySnapshots, tallyConsensus,
} from "./bull/strategies";
export type { StrategyId, StrategyMeta, BullStrategySnapshot, StrategyConsensus } from "./bull/strategies";

// Module 7 — Thesis Lab (P·07): pressure test → scenarios → portfolio risk
export {
  analyzeThesis, parseThesis, splitSentences, classifyKinds, readLanguage,
  scoreClaim, contextChecks,
  THESIS_ENGINE_VERSION, FAKE_STATED_MIN, FAKE_EVIDENCE_MAX,
} from "./thesis/engine";
export {
  buildScenarios, tradingDaysIn, horizonReturns, empiricalProbabilities,
  SCENARIO_SIGMA,
} from "./thesis/scenarios";
export {
  buildRiskReport, pairwiseCorrelations, correlationClusters, pearson, betaTo,
} from "./thesis/risk";
export type { RiskInputs } from "./thesis/risk";
export { assembleMarketContext, closeSeriesFor, realizedVolFrom } from "./thesis/marketContext";
export type {
  Assumption, ClaimKind, AssumptionOrigin, LanguageRead, ContextCheck,
  ThesisAnalysis, ThesisVerdict, StrengthComponent, ParsedThesis,
  MarketContext, RealizedVol, TrendRead,
  Scenario, ScenarioId, ScenarioSet, AssumptionOutcome,
  PositionInput, MarkedPosition, RiskFlag, RiskFlagKind, CorrelationPair,
  PositionRisk, PortfolioRiskReport,
} from "./thesis/types";
export {
  insertThesis, deleteThesis, listTheses, getThesis, getThesisMeta,
} from "./storage/thesisRepo";
export type { ThesisRow, ThesisSummary } from "./storage/thesisRepo";
export {
  insertPosition, updatePosition, deletePosition, listPositions, markPositions,
} from "./storage/portfolioRepo";
export type { PositionWrite } from "./storage/portfolioRepo";

// Earnings-Beat Tracker — watchlist EPS/revenue surprise tracking
// (see earnings-beat-tracker-architecture.md for the full spec, v2)
export { fetchCalendarEarnings, fetchStockEarnings, safePct } from "./earnings/finnhub";
export {
  computeBeatStreak, computeTrailingAverages, computeRankScore, computeTickerMetrics,
  compareRankings, winsor,
  RANKING_CONFIG, RECENCY_WEIGHTS, WINSOR_BOUND, EPS_BLEND_WEIGHT, REVENUE_BLEND_WEIGHT,
} from "./earnings/engine";
export type { RankableEntry } from "./earnings/engine";
export {
  upsertQuarter, runWeeklyIncremental, backfillTicker, reconcileUnderfilledTickers,
} from "./earnings/pipeline";
export type {
  WeeklyIncrementalReport, WeeklyIncrementalOptions,
  BackfillReport, BackfillReconcileReport,
} from "./earnings/pipeline";
export type {
  WatchlistEntry, ReportHour, EarningsQuarterRow, UpsertQuarterInput, UpsertOutcome,
  FinnhubCalendarEntry, FinnhubStockEarningsEntry,
  QuarterSurprise, TickerMetrics, Confidence,
  PipelineFlow, PipelineRunStatus, PipelineRunRow,
  RankingsQueryParams, RankingsQuarterEntry, RankingsLatest, RankingsResultEntry, RankingsResponse,
  ApiErrorCode, ApiErrorBody,
} from "./earnings/types";
export {
  getActiveWatchlist, getAllWatchlist, getActiveQuarterCounts,
  getCachedQuarterKeys, getCachedQuarterRevenueStatus, upsertQuarterRow, getCachedQuarters, getRankingData,
  startPipelineRun, finishPipelineRun, getLastSuccessfulPipelineRun, getLastSuccessfulRunFinishedAt,
} from "./storage/earningsRepo";
export type { RankingDataEntry } from "./storage/earningsRepo";

// Gold Tracker — FRED deep history + GoldAPI live tick, pure engine over
// trend/momentum/volatility/usdPressure/realYieldPressure
export { fetchGoldPriceSeries, GOLD_INCREMENTAL_LOOKBACK_DAYS, GOLD_BACKFILL_LOOKBACK_DAYS } from "./sources/yahooGold";
export { fetchGoldSpot } from "./sources/goldapi";
export type { GoldSpotTick } from "./sources/goldapi";
export {
  computeGoldSnapshot, computeGoldChanges, resolveHeadlinePrice,
  computeTrend, computeMomentum, computeVolatility, computeUsdPressure, computeRealYieldPressure,
} from "./gold/engine";
export type {
  GoldPricePoint, GoldLiveTick, GoldChanges, GoldIndicator, GoldEngineSnapshot,
} from "./gold/engine";
export {
  upsertGoldPrice, upsertGoldPrices, getGoldPriceHistory,
  upsertGoldSnapshot, getLatestGoldSnapshot, hasLiveGoldTick,
} from "./storage/goldRepo";
export type { GoldSnapshotRow } from "./storage/goldRepo";
export { runGoldCycle } from "./ingest/goldCycle";
export type { GoldCycleReport } from "./ingest/goldCycle";
export { runGoldFlowCycle } from "./ingest/goldFlowCycle";
export type { GoldFlowCycleReport } from "./ingest/goldFlowCycle";
export {
  upsertGoldFlowMetrics, getLatestGoldFlowMetrics, getGoldFlowMetricSeries,
} from "./storage/goldFlowRepo";
export type { GoldFlowMetricInput } from "./storage/goldFlowRepo";
export type { GoldFlowMetricRow, GoldLocusId, GoldFlowMetricId } from "./gold/flowTypes";
export { GOLD_LOCI, GOLD_FLOW_METRICS, isGoldLocusId } from "./gold/flowTypes";
export { fetchWgcEtfHoldings, parseWgcHoldingsChart, wgcHoldingsToMetrics } from "./sources/wgcEtf";
export {
  fetchComexGoldStocks, parseComexGoldStocksXls, comexReadingToMetrics,
} from "./sources/comexGoldStocks";

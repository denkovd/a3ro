/* Public surface of the oil-price backend.
   API route handlers / cron entrypoints import from here only. */

export * from "./core/types";
export * from "./core/corridorTypes";
export { toUsdPerBarrel, PRICE_BOUNDS, NormalizationError } from "./core/units";
export {
  classifyStaleness, isUsable, isAlertGrade,
  marketCloseUtc, zonedTimeToUtc, MARKET_CLOSE,
} from "./core/time";

export type { OilPriceSource } from "./sources/OilPriceSource";
export { BaseSource } from "./sources/OilPriceSource";
export { EiaSource } from "./sources/eia";
export { buildSources, getSource } from "./sources/registry";
export { getJsonForSource } from "./sources/http";

export type { CorridorSource, CorridorSourceDescriptor } from "./sources/CorridorSource";
export { CorridorBaseSource } from "./sources/CorridorSource";
export { EiaUsGulfSource } from "./sources/eiaCorridor";
export { PortWatchSource, tonsToMegatons } from "./sources/portwatch";
export { buildCorridorSources, getCorridorSource } from "./sources/corridorRegistry";
export { fetchGateBaselines } from "./sources/portwatchBaselines";

export { createDb } from "./storage/db";
export type { Queryable } from "./storage/db";
export {
  getLatestQuotes, getDailySeries, getLatestDailyPrice,
  insertObservations,
} from "./storage/priceRepo";
export {
  insertCorridorMetrics, getLatestCorridorMetrics,
} from "./storage/corridorRepo";
export {
  upsertBaselines, getBaselines, getBaselineAgeDays,
} from "./storage/baselineRepo";
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
export { resolveLatestQuote, resolveDailyClose, DISAGREEMENT_TOLERANCE, SUSPECT_DEVIATION } from "./ingest/resolve";
export { evaluateRule } from "./alerts/rules";
export type { AlertRule, AlertState, EvalContext } from "./alerts/rules";

export { deliverPendingAlerts, consoleAlertDelivery } from "./alerts/deliver";
export type { AlertDeliveryFn, DeliveryReport } from "./alerts/deliver";

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
export { buildCorridorSources, getCorridorSource } from "./sources/corridorRegistry";

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
  getUndeliveredAlertEvents, markAlertEventDelivered,
} from "./storage/alertRepo";
export type { AlertEvent } from "./storage/alertRepo";

export { runIngestionCycle } from "./ingest/pipeline";
export type { CycleReport } from "./ingest/pipeline";
export { runCorridorCycle } from "./ingest/corridorPipeline";
export type { CorridorCycleReport } from "./ingest/corridorPipeline";
export { resolveLatestQuote, resolveDailyClose, DISAGREEMENT_TOLERANCE, SUSPECT_DEVIATION } from "./ingest/resolve";
export { evaluateRule } from "./alerts/rules";
export type { AlertRule, AlertState, EvalContext } from "./alerts/rules";

export { deliverPendingAlerts, consoleAlertDelivery } from "./alerts/deliver";
export type { AlertDeliveryFn, DeliveryReport } from "./alerts/deliver";

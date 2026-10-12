import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import { metricFreshness } from "./dataQuality";

export const CHINA_METRICS = [
  { metric: "crude_imports", title: "Crude imports", detail: "Crude purchased from overseas", source: "China Customs" },
  { metric: "crude_processing", title: "Refinery processing", detail: "Crude processed by reporting refineries", source: "NBS" },
  { metric: "crude_production", title: "Domestic production", detail: "Crude produced by reporting enterprises", source: "NBS" },
] as const;

export function chinaPeriod(row: Pick<CorridorMetricLatest, "periodDate" | "meta">) {
  const year = row.periodDate.slice(0, 4);
  const month = new Date(`${row.periodDate.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
  return `${row.meta?.periodStart?.slice(5, 7) === "01" && row.periodDate.slice(5, 7) === "02" ? "Jan–Feb" : month} ${year}`;
}

export function chinaRows(metrics: CorridorMetricLatest[] | null) {
  return CHINA_METRICS.map(spec => ({ ...spec, row: metrics?.find(m => m.corridor === "china" && m.metric === spec.metric && m.unit === "Mt" && Number.isFinite(m.value) && m.value > 0) }));
}

export function chinaYoy(row: CorridorMetricLatest | undefined) {
  const raw = row?.meta?.yoyPct;
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

export function chinaSummary(metrics: CorridorMetricLatest[] | null, now = Date.now()) {
  const [imports, processing] = chinaRows(metrics).map(x => x.row);
  if (!imports || !processing) return "Read crude purchases alongside refinery processing. Both series are needed to compare buying and refining activity.";
  if ([imports, processing].some(r => metricFreshness(r, now) === "stale")) return "Historical readings are retained below. They do not describe current buying or refining activity.";
  if (imports.periodDate !== processing.periodDate || imports.meta?.periodStart !== processing.meta?.periodStart) return "Imports and processing cover different reporting periods. Compare the dated readings separately until both releases align.";
  const iy = chinaYoy(imports), py = chinaYoy(processing);
  if (iy === null || py === null) return `${chinaPeriod(imports)}: reported imports and processing are available; a comparable year-on-year reading is incomplete.`;
  const direction = (value: number) => value > 0 ? "above" : value < 0 ? "below" : "unchanged from";
  return `${chinaPeriod(imports)}: crude imports are ${direction(iy)} a year earlier (${iy > 0 ? "+" : ""}${iy.toFixed(1)}%); refinery processing is ${direction(py)} a year earlier (${py > 0 ? "+" : ""}${py.toFixed(1)}%).`;
}

export function chinaLead(metrics: CorridorMetricLatest[] | null, now = Date.now()) {
  const rows = chinaRows(metrics).map(x => x.row).filter((r): r is CorridorMetricLatest => !!r);
  return rows.find(r => metricFreshness(r, now) === "current") ?? rows[0];
}

export function chinaMapText(metrics: CorridorMetricLatest[] | null, compact = false, now = Date.now()) {
  const row = chinaLead(metrics, now);
  if (!row) return "MONTHLY DATA UNAVAILABLE";
  const name = row.metric === "crude_imports" ? "IMPORTS" : row.metric === "crude_processing" ? "PROCESSING" : "OUTPUT";
  const yoy = chinaYoy(row);
  if (compact) return `${metricFreshness(row, now) === "stale" ? "HIST. · " : ""}${name} ${row.value.toFixed(2)} MT · ${chinaPeriod(row).replace(/20(\d{2})$/, "$1").toUpperCase()}`;
  return `${metricFreshness(row, now) === "stale" ? "HISTORICAL · " : ""}${name} ${row.value.toFixed(2)} MT${yoy === null ? "" : ` · ${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}% YOY`} · ${chinaPeriod(row).toUpperCase()}`;
}

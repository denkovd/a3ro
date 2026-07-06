/* ────────────────────────────────────────────────────────────────
   IMF PortWatch corridor adapter — daily chokepoint transits from
   satellite AIS. Sibling to sources/eiaCorridor.ts (same corridor-
   metrics domain), but a different provider: no API key, a single
   ArcGIS FeatureServer query per chokepoint.

   Endpoint (public, no key, live-verified 2026-07-05):
     GET https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query
       ?where=portid='{CHOKEPOINT}'
       &outFields=date,n_tanker,capacity_tanker
       &orderByFields=date DESC
       &resultRecordCount=40
       &returnGeometry=false
       &f=json
   (params built via URLSearchParams, same as eiaCorridor's buildUrl.)

   Response shape:
     { objectIdFieldName, fields: [...], exceededTransferLimit?: boolean,
       features: [ { attributes: { date, n_tanker, capacity_tanker } } ] }
   `exceededTransferLimit: true` is NORMAL (resultRecordCount cap), not
   an error — do not treat it as one. Errors can also arrive as HTTP 200
   with `{ error: { code, message } }`; classified below by message text
   ("busy"/"timeout"/"limit" → rate_limited, else upstream_error).

   `date` is esriFieldTypeDateOnly → arrives as a plain STRING
   "YYYY-MM-DD" (NOT epoch milliseconds — do not add epoch-ms handling).
   Validated with the same calendar-date regex eiaCorridor uses;
   non-matching → bad_payload.

   `n_tanker` / `capacity_tanker` are integers and may be null — skip
   that day's row silently (gap, not an error), same convention as
   eiaCorridor's null-value handling.

   Data-quality caveat (from IMF): regional GPS jamming / AIS spoofing
   around the Strait of Hormuz can depress counts — read trends, not
   levels (surfaced to users in the frontend copy, not modeled here).

   Cadence: published weekly (Tuesdays) with a ~4-day processing lag;
   each publication carries daily datapoints. Daily values are noisy
   (e.g. 12→10→20 tankers/day at Hormuz), which is why this adapter
   also emits 7-day-average metrics alongside the daily ones.
──────────────────────────────────────────────────────────────── */

import { SourceErrorKind } from "../core/types";
import { CorridorId, CorridorMetricRecord } from "../core/corridorTypes";
import { CorridorBaseSource, CorridorSourceDescriptor } from "./CorridorSource";

const BASE_URL =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";
const RESULT_RECORD_COUNT = 40;

/** metric tons/day → million metric tons/day (canonical corridor volume unit). */
export function tonsToMegatons(mt: number): number {
  return mt / 1_000_000;
}

interface ChokepointConfig {
  corridor: CorridorId;
  portid: string;
  portname: string;
}

const CHOKEPOINTS: ChokepointConfig[] = [
  { corridor: "hormuz", portid: "chokepoint6", portname: "Strait of Hormuz" },
  { corridor: "singapore", portid: "chokepoint5", portname: "Malacca Strait" },
  { corridor: "suez", portid: "chokepoint1", portname: "Suez Canal" },
  { corridor: "bab_el_mandeb", portid: "chokepoint4", portname: "Bab el-Mandeb Strait" },
  { corridor: "cape", portid: "chokepoint7", portname: "Cape of Good Hope" },
  { corridor: "panama", portid: "chokepoint2", portname: "Panama Canal" },
];

interface PortWatchFeatureAttributes {
  date: string; // esriFieldTypeDateOnly → plain "YYYY-MM-DD" string
  n_tanker: number | null;
  capacity_tanker: number | null;
}

interface PortWatchFeature {
  attributes: PortWatchFeatureAttributes;
}

interface PortWatchResponse {
  objectIdFieldName?: string;
  fields?: unknown[];
  exceededTransferLimit?: boolean; // normal — resultRecordCount cap, not an error
  features?: PortWatchFeature[];
  error?: { code?: number; message?: string };
}

interface DayRow {
  date: string;
  n_tanker: number;
  capacity_tanker: number;
}

export class PortWatchSource extends CorridorBaseSource {
  readonly descriptor: CorridorSourceDescriptor = {
    id: "portwatch",
    name: "IMF PortWatch — daily chokepoint transits (satellite AIS)",
    confidence: "aggregator",
    corridors: ["hormuz", "singapore", "suez", "bab_el_mandeb", "cape", "panama"],
    expectedCadenceMs: 7 * 86_400_000, // published weekly
    rateLimit: {
      // Public service, no key — be polite regardless of published limits.
      minIntervalMs: 60_000,
    },
  };

  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    const records: CorridorMetricRecord[] = [];
    // Sequential is fine: two calls, weekly cadence, no rate pressure.
    for (const cfg of CHOKEPOINTS) {
      const rows = await this.request(cfg);
      records.push(...this.rowsToRecords(cfg, rows));
      // A chokepoint returning zero usable rows is not an error.
    }
    return records;
  }

  /* ── provider-specific plumbing (mirrors eiaCorridor.ts) ────────── */

  private buildUrl(cfg: ChokepointConfig): string {
    const p = new URLSearchParams();
    p.set("where", `portid='${cfg.portid}'`);
    p.set("outFields", "date,n_tanker,capacity_tanker");
    p.set("orderByFields", "date DESC");
    p.set("resultRecordCount", String(RESULT_RECORD_COUNT));
    p.set("returnGeometry", "false");
    p.set("f", "json");
    return `${BASE_URL}?${p.toString()}`;
  }

  private async request(cfg: ChokepointConfig): Promise<DayRow[]> {
    const url = this.buildUrl(cfg);
    const body = await this.getJson<PortWatchResponse>(url, {
      classifyHttpError: (status, text) => this.classify(text),
    });

    // PortWatch sometimes reports errors inside a 200 body.
    if (body.error) {
      const message = body.error.message ?? `code ${body.error.code ?? "?"}`;
      this.fail(this.textToKind(message), `PortWatch error body: ${message}`);
    }
    if (!Array.isArray(body.features)) {
      this.fail(
        "bad_payload",
        `unexpected PortWatch response shape: ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    // exceededTransferLimit: true is normal (resultRecordCount cap) — not an error.

    const rows: DayRow[] = [];
    for (const feature of body.features) {
      const attrs = feature.attributes;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(attrs.date)) {
        this.fail("bad_payload", `PortWatch date "${attrs.date}" is not a calendar date`);
      }
      // null n_tanker/capacity_tanker ⇒ skip that day's row silently.
      if (attrs.n_tanker === null || attrs.capacity_tanker === null) continue;
      rows.push({ date: attrs.date, n_tanker: attrs.n_tanker, capacity_tanker: attrs.capacity_tanker });
    }
    return rows;
  }

  private classify(text: string): SourceErrorKind | undefined {
    if (!text) return undefined;
    return this.textToKind(text);
  }

  private textToKind(text: string): SourceErrorKind {
    const t = text.toLowerCase();
    if (/(busy|timeout|limit)/.test(t)) return "rate_limited";
    return "upstream_error";
  }

  private rowsToRecords(cfg: ChokepointConfig, rows: DayRow[]): CorridorMetricRecord[] {
    const records: CorridorMetricRecord[] = [];
    const meta = { portid: cfg.portid, portname: cfg.portname };

    for (const row of rows) {
      records.push({
        corridor: cfg.corridor,
        metric: "tanker_transits",
        value: row.n_tanker,
        unit: "vessels/d",
        periodDate: row.date,
        observedAt: `${row.date}T00:00:00.000Z`,
        source: this.descriptor.id,
        confidence: this.descriptor.confidence,
        fetchedAt: new Date().toISOString(),
        raw: { value: row.n_tanker, unit: "vessels/d" },
        meta,
      });
      records.push({
        corridor: cfg.corridor,
        metric: "tanker_volume",
        value: tonsToMegatons(row.capacity_tanker),
        unit: "Mt/d",
        periodDate: row.date,
        observedAt: `${row.date}T00:00:00.000Z`,
        source: this.descriptor.id,
        confidence: this.descriptor.confidence,
        fetchedAt: new Date().toISOString(),
        raw: { value: row.capacity_tanker, unit: "mt/d" },
        meta,
      });
    }

    // 7-day-average metrics: mean of the 7 most recent VALID days
    // (rows here already excludes null days). Newest-first arrival
    // from the API means rows[0..6] are the most recent when present;
    // sort defensively in case a fixture/response isn't perfectly ordered.
    const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const window = sorted.slice(0, 7);
    if (window.length > 0) {
      const newestDate = window[0].date;
      const fetchedAt = new Date().toISOString();
      const windowMeta = { ...meta, window: "7d" };

      const transitMean = window.reduce((sum, r) => sum + r.n_tanker, 0) / window.length;
      records.push({
        corridor: cfg.corridor,
        metric: "tanker_transits_7d",
        value: Math.round(transitMean * 10) / 10,
        unit: "vessels/d",
        periodDate: newestDate,
        observedAt: `${newestDate}T00:00:00.000Z`,
        source: this.descriptor.id,
        confidence: this.descriptor.confidence,
        fetchedAt,
        raw: { value: transitMean, unit: "vessels/d" },
        meta: windowMeta,
      });

      const volumeMeanMt = window.reduce((sum, r) => sum + r.capacity_tanker, 0) / window.length;
      const volumeMean = tonsToMegatons(volumeMeanMt);
      records.push({
        corridor: cfg.corridor,
        metric: "tanker_volume_7d",
        value: Math.round(volumeMean * 100) / 100,
        unit: "Mt/d",
        periodDate: newestDate,
        observedAt: `${newestDate}T00:00:00.000Z`,
        source: this.descriptor.id,
        confidence: this.descriptor.confidence,
        fetchedAt,
        raw: { value: volumeMean, unit: "Mt/d" },
        meta: windowMeta,
      });
    }

    return records;
  }
}

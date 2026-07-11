/* ────────────────────────────────────────────────────────────────
   MPA Singapore corridor adapter — monthly port statistics from
   data.gov.sg (Maritime and Port Authority of Singapore). Roadmap P6.
   Keyless public API, sibling to eiaCorridor.ts in shape.

   Endpoint (live-verified 2026-07-11):
     GET https://data.gov.sg/api/action/datastore_search
       ?resource_id={RESOURCE}
       &limit=6
       &sort=month%20desc
     → { success: true, result: { fields: […],
         records: [ { month: "YYYY-MM", …string values… } ], total } }

   Datasets → metric mapping (ids live-verified):
   - d_89d2874dad74a273270369334f1e7d28 "Bunker Sales Total, Monthly"
       record { month, bunker_sales } — bunker_sales is THOUSAND
       tonnes (May 2026 = "4548.35" ≈ 4.55M tonnes; Singapore sells
       ~50M t/yr, so raw tonnes would be absurd) → metric
       "bunker_sales", canonical unit "Mt" (÷1000).
   - d_9adb5ace517591edd9a8c88291ac1f1c "Tanker Arrivals Total, Monthly"
       record { month, number_of_tankers, gross_tonnage } — tankers
       >75 GT; gross_tonnage is THOUSAND GT (May 2026 = "82280.92" ≈
       82.3M GT) → metrics "tanker_arrivals" (unit "vessels") and
       "tanker_arrivals_gt" (unit "M GT", ÷1000).

   Quirks:
   - All values arrive as STRINGS ("4548.35"); parse + skip
     null/empty/non-numeric rows (gap row, not an error).
   - `month` is "YYYY-MM"; periodDate is stored as the month's first
     day ("YYYY-MM-01"). Malformed months fail loud (bad_payload).
   - MPA marks the LATEST month as a preliminary estimate; meta
     carries `preliminaryLatest: true` on the newest record per
     dataset so the UI can caveat honestly if desired.
   - Publication lag is ~4–7 weeks (May data live in mid-July);
     expectedCadenceMs is one month and the staleness machinery's
     weekend/cadence tolerance absorbs the rest — monthly rows read
     "aging" rather than "dead" between publications.
──────────────────────────────────────────────────────────────── */

import { SourceErrorKind } from "../core/types";
import { CorridorMetricRecord } from "../core/corridorTypes";
import { CorridorBaseSource, CorridorSourceDescriptor } from "./CorridorSource";

const BASE_URL = "https://data.gov.sg/api/action/datastore_search";
const MAX_ROWS = 6; // rolling window of recent months, upserted each cycle

/** MPA publishes volumes in thousand tonnes / thousand GT; canonical
 *  display units are Mt / M GT. */
export function thousandTonnesToMt(thousandTonnes: number): number {
  return thousandTonnes / 1000;
}

interface MpaMetricSpec {
  /** Field on the record carrying the raw string value. */
  field: string;
  metric: string;
  rawUnit: string;
  toCanonical: (raw: number) => number;
  canonicalUnit: string;
}

interface MpaDatasetConfig {
  resourceId: string;
  name: string;
  metrics: MpaMetricSpec[];
}

export const MPA_DATASETS: MpaDatasetConfig[] = [
  {
    resourceId: "d_89d2874dad74a273270369334f1e7d28",
    name: "Bunker Sales Total, Monthly",
    metrics: [
      {
        field: "bunker_sales",
        metric: "bunker_sales",
        rawUnit: "kt",
        toCanonical: thousandTonnesToMt,
        canonicalUnit: "Mt",
      },
    ],
  },
  {
    resourceId: "d_9adb5ace517591edd9a8c88291ac1f1c",
    name: "Tanker Arrivals Total, Monthly",
    metrics: [
      {
        field: "number_of_tankers",
        metric: "tanker_arrivals",
        rawUnit: "vessels",
        toCanonical: (raw) => raw,
        canonicalUnit: "vessels",
      },
      {
        field: "gross_tonnage",
        metric: "tanker_arrivals_gt",
        rawUnit: "k GT",
        toCanonical: thousandTonnesToMt,
        canonicalUnit: "M GT",
      },
    ],
  },
];

interface MpaRecord {
  month?: string; // "YYYY-MM"
  [field: string]: unknown;
}

interface MpaResponse {
  success?: boolean;
  result?: { records?: MpaRecord[] };
  error?: unknown;
}

export class MpaSingaporeSource extends CorridorBaseSource {
  readonly descriptor: CorridorSourceDescriptor = {
    id: "mpa-singapore",
    name: "Maritime and Port Authority of Singapore — monthly port statistics (data.gov.sg)",
    confidence: "official",
    corridors: ["singapore"],
    expectedCadenceMs: 31 * 86_400_000, // monthly publication
    rateLimit: {
      // Keyless public API — stay polite, we only need 2 calls/day.
      maxPerHour: 60,
      minIntervalMs: 60_000,
    },
  };

  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    const records: CorridorMetricRecord[] = [];
    // Sequential: two small calls, monthly cadence, no rate pressure.
    for (const cfg of MPA_DATASETS) {
      const rows = await this.request(cfg);
      // Rows arrive newest-first (sort=month desc): index 0 is the
      // month MPA flags as a preliminary estimate.
      rows.forEach((row, i) => {
        for (const rec of this.rowToRecords(cfg, row, i === 0)) records.push(rec);
      });
      // A dataset returning zero usable rows is not an error.
    }
    return records;
  }

  /* ── provider plumbing ────────────────────────────────────────── */

  private buildUrl(cfg: MpaDatasetConfig): string {
    const p = new URLSearchParams();
    p.set("resource_id", cfg.resourceId);
    p.set("limit", String(MAX_ROWS));
    p.set("sort", "month desc");
    return `${BASE_URL}?${p.toString()}`;
  }

  private async request(cfg: MpaDatasetConfig): Promise<MpaRecord[]> {
    const url = this.buildUrl(cfg);
    const body = await this.getJson<MpaResponse>(url, {
      classifyHttpError: (status) => this.classifyStatus(status),
    });

    if (body.success !== true || !body.result || !Array.isArray(body.result.records)) {
      this.fail(
        "bad_payload",
        `unexpected data.gov.sg response shape for ${cfg.name}: ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    return body.result.records;
  }

  private classifyStatus(status: number): SourceErrorKind | undefined {
    if (status === 429) return "rate_limited";
    return undefined; // base default handles the rest
  }

  private rowToRecords(
    cfg: MpaDatasetConfig,
    row: MpaRecord,
    preliminaryLatest: boolean,
  ): CorridorMetricRecord[] {
    const month = typeof row.month === "string" ? row.month : "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      this.fail("bad_payload", `MPA month "${String(row.month)}" is not YYYY-MM`);
    }
    const periodDate = `${month}-01`;

    const out: CorridorMetricRecord[] = [];
    for (const spec of cfg.metrics) {
      const raw = row[spec.field];
      // null/empty/non-numeric values are gap rows — skip, not an error.
      if (raw === null || raw === undefined || raw === "") continue;
      const rawNumber = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(rawNumber)) continue;

      out.push({
        corridor: "singapore",
        metric: spec.metric,
        value: spec.toCanonical(rawNumber),
        unit: spec.canonicalUnit,
        periodDate,
        // Monthly publication timing is not modeled (same convention
        // as eiaCorridor.ts's WPSR handling).
        observedAt: `${periodDate}T00:00:00.000Z`,
        source: this.descriptor.id,
        confidence: this.descriptor.confidence,
        fetchedAt: new Date().toISOString(),
        raw: { value: rawNumber, unit: spec.rawUnit },
        meta: {
          resourceId: cfg.resourceId,
          dataset: cfg.name,
          // meta is Record<string, string> — flag as a string.
          ...(preliminaryLatest ? { preliminaryLatest: "true" } : {}),
        },
      });
    }
    return out;
  }
}

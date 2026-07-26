"use client";
/* ────────────────────────────────────────────────────────────────
   Event overlay — data layer (feeds EventOverlay.tsx and
   UpcomingEventsList.tsx).

   Curated events are static JSON in public/events/*.json, hand-
   written with real source URLs (see that directory's files) —
   never scraped, never invented. User-uploaded JSON/CSV in the same
   { id, date, label, category, importance, source_url } schema
   merges client-side and is stamped userAdded so the UI can label it
   distinctly from the sourced set (A3RO truth rule: nothing
   unverified shown as if it were the curated read).

   Category on/off state and uploaded rows both persist to
   localStorage so every chart/list on the page — and future page
   loads — agree on the same set without a shared React context.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";

export type EventImportance = "high" | "medium" | "low";

export type MarketEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  category: string;
  importance: EventImportance;
  sourceUrl: string | null;
  userAdded: boolean;
};

export const CATEGORY_LABEL: Record<string, string> = {
  fomc: "FOMC",
  cpi: "CPI",
  earnings: "Earnings",
  commodity: "Commodity",
};

const CURATED_FILES = ["fomc.json", "cpi.json", "earnings-windows.json", "commodity.json"];
const IMPORTANCES: EventImportance[] = ["high", "medium", "low"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeRaw(raw: unknown, userAdded: boolean): MarketEvent | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
  const date = typeof o.date === "string" && DATE_RE.test(o.date) ? o.date : null;
  const label = typeof o.label === "string" && o.label.length > 0 ? o.label : null;
  if (!id || !date || !label) return null;
  const category = typeof o.category === "string" && o.category.length > 0 ? o.category : "other";
  const importance = IMPORTANCES.includes(o.importance as EventImportance)
    ? (o.importance as EventImportance)
    : "medium";
  const sourceUrl =
    typeof o.source_url === "string" && o.source_url.length > 0
      ? o.source_url
      : typeof o.sourceUrl === "string" && o.sourceUrl.length > 0
        ? o.sourceUrl
        : null;
  return { id, date, label, category, importance, sourceUrl, userAdded };
}

/* ── curated static events, fetched once per page load ── */
type CuratedState = { status: "loading" | "live" | "error"; events: MarketEvent[] };

function useCuratedEvents(): CuratedState {
  const [state, setState] = useState<CuratedState>({ status: "loading", events: [] });

  useEffect(() => {
    let alive = true;
    Promise.all(
      CURATED_FILES.map((f) =>
        fetch(`/events/${f}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ),
    )
      .then((results) => {
        if (!alive) return;
        const events: MarketEvent[] = [];
        for (const arr of results) {
          if (!Array.isArray(arr)) continue;
          for (const raw of arr) {
            const ev = normalizeRaw(raw, false);
            if (ev) events.push(ev);
          }
        }
        setState({ status: "live", events });
      })
      .catch(() => {
        if (alive) setState({ status: "error", events: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/* ── user-uploaded events, persisted to localStorage ── */
const UPLOADED_KEY = "a3ro.events.uploaded.v1";

function readUploaded(): MarketEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(UPLOADED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => normalizeRaw(e, true)).filter((e): e is MarketEvent => e !== null);
  } catch {
    return [];
  }
}

function writeUploaded(events: MarketEvent[]) {
  try {
    window.localStorage.setItem(UPLOADED_KEY, JSON.stringify(events));
  } catch {
    // storage unavailable/full — uploaded events simply won't persist this session
  }
}

/** De-dupe by id; a re-uploaded row with the same id replaces the old one. */
function mergeById(curated: MarketEvent[], uploaded: MarketEvent[]): MarketEvent[] {
  const byId = new Map<string, MarketEvent>();
  for (const e of curated) byId.set(e.id, e);
  for (const e of uploaded) byId.set(e.id, e);
  return Array.from(byId.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export type MarketEventsState = {
  status: "loading" | "live" | "error";
  events: MarketEvent[]; // curated + uploaded, merged
  addUploaded: (events: MarketEvent[]) => void;
  clearUploaded: () => void;
};

/** The one data entry point every chart integration and the upcoming-
 *  events list should use, so they all read the same merged set. */
export function useMarketEvents(): MarketEventsState {
  const curated = useCuratedEvents();
  const [uploaded, setUploaded] = useState<MarketEvent[]>([]);

  useEffect(() => {
    setUploaded(readUploaded());
  }, []);

  const addUploaded = useCallback((events: MarketEvent[]) => {
    setUploaded((prev) => {
      const next = mergeById(prev, events).filter((e) => e.userAdded);
      writeUploaded(next);
      return next;
    });
  }, []);

  const clearUploaded = useCallback(() => {
    setUploaded([]);
    writeUploaded([]);
  }, []);

  return {
    status: curated.status,
    events: mergeById(curated.events, uploaded),
    addUploaded,
    clearUploaded,
  };
}

/* ── category on/off, persisted to localStorage — default ON ── */
const CATEGORIES_KEY = "a3ro.events.categories.v1";

function readToggles(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function useEventCategoryToggles() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setToggles(readToggles());
  }, []);

  const isEnabled = useCallback((category: string) => toggles[category] !== false, [toggles]);

  const toggle = useCallback((category: string) => {
    setToggles((prev) => {
      const next = { ...prev, [category]: prev[category] === false };
      try {
        window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — toggle still applies for this session
      }
      return next;
    });
  }, []);

  return { isEnabled, toggle };
}

/* ── upload parsing: JSON array or CSV, same schema as the curated
   files. CSV is parsed by hand rather than via the repo's xlsx
   dependency: xlsx's CSV reader auto-detects date-looking cells and
   silently rewrites them to Excel serial numbers / locale strings
   (e.g. "2026-08-15" → "8/15/26"), which would then fail the
   YYYY-MM-DD schema check below — the wrong tool for a plain
   6-column CSV, xlsx is for real spreadsheet binaries. ── */
export type UploadResult = { events: MarketEvent[]; errors: string[] };

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") pushRow();
    else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim().length > 0))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}

export async function parseUploadedEventsFile(file: File): Promise<UploadResult> {
  const text = await file.text();
  const errors: string[] = [];
  let rows: unknown[] = [];

  if (/\.json$/i.test(file.name)) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) rows = parsed;
      else errors.push("JSON file must contain an array of event objects");
    } catch (e) {
      return { events: [], errors: [`Could not parse JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  } else {
    rows = parseCsv(text);
  }

  const events: MarketEvent[] = [];
  rows.forEach((raw, i) => {
    const ev = normalizeRaw(raw, true);
    if (ev) events.push(ev);
    else errors.push(`Row ${i + 1}: missing or invalid id/date/label — skipped`);
  });
  return { events, errors };
}

/* ── position events against a chart's own index-spaced bars.

   These hand-rolled charts (BtcPriceChart, OilTrackerCore's Spark)
   plot bars at even INDEX spacing — x = pad + i*step — not true
   calendar spacing. Interpolating a calendar-accurate x for an event
   date would visually disagree with where the chart itself placed
   the nearest bar, so an event snaps to its nearest bar's x rather
   than a fabricated in-between position. Events outside the visible
   bar range are dropped rather than clamped to an edge, which would
   misrepresent them as being in range. ── */
export type PositionedEvent = { event: MarketEvent; x: number };

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.abs(a - b) / 86_400_000;
}

export function positionEvents(
  barDates: string[],
  events: MarketEvent[],
  opts: { width: number; pad: number },
): PositionedEvent[] {
  if (barDates.length < 2) return [];
  const { width, pad } = opts;
  const step = (width - pad * 2) / (barDates.length - 1);
  const first = barDates[0];
  const last = barDates[barDates.length - 1];

  const out: PositionedEvent[] = [];
  for (const event of events) {
    if (event.date < first || event.date > last) continue;
    let nearest = 0;
    let nearestDiff = Infinity;
    for (let i = 0; i < barDates.length; i++) {
      const diff = daysBetween(barDates[i], event.date);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearest = i;
      }
    }
    out.push({ event, x: pad + nearest * step });
  }
  // higher-importance markers drawn last (on top), so overlapping
  // markers give hover priority to the more important event
  const RANK: Record<EventImportance, number> = { low: 0, medium: 1, high: 2 };
  out.sort((a, b) => RANK[a.event.importance] - RANK[b.event.importance]);
  return out;
}

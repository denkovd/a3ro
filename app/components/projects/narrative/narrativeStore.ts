"use client";
/* ────────────────────────────────────────────────────────────────
   Narrative Rotation — attention datapoint store.
   Frontend-only per PLAN-frontend-intelligence-modules.md's hard
   constraints (no new backend/tables): user-fed datapoints (manual
   entry, CSV upload, curated JSON feed upload) persist in
   localStorage, keyed per browser. Normalisation accepts the
   documented wire schema `{ narrative_id, date, metric, value,
   source }` (snake_case — the spec's interchange format for curated
   feeds) and never throws on a malformed row.
──────────────────────────────────────────────────────────────── */
import type { AttentionDatapoint } from "./narrativeScoring";

export type StoredDatapoint = AttentionDatapoint & { id: string };

const STORAGE_KEY = "a3ro:narrative-rotation:datapoints:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function normalizeDatapoint(raw: unknown): AttentionDatapoint | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const narrativeId = isStr(o.narrative_id) ? o.narrative_id : isStr(o.narrativeId) ? o.narrativeId : null;
  const date = isStr(o.date) ? o.date : null;
  const metric = isStr(o.metric) ? o.metric : null;
  const value = isNum(o.value) ? o.value : null;
  const source = isStr(o.source) ? o.source : "manual";
  if (!narrativeId || !date || !DATE_RE.test(date) || !metric || value === null) return null;
  return { narrativeId, date, metric, value, source };
}

/** Accepts a bare array or `{ datapoints: [...] }` — the shape a
 *  hand-curated JSON feed file is likely to use. */
export function normalizeDatapoints(raw: unknown): AttentionDatapoint[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | null)?.datapoints)
      ? ((raw as Record<string, unknown>).datapoints as unknown[])
      : [];
  return list.map(normalizeDatapoint).filter((d): d is AttentionDatapoint => d !== null);
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const dedupeKey = (d: AttentionDatapoint) => `${d.narrativeId}|${d.date}|${d.metric}|${d.source}`;

/** Merge new datapoints into an existing stored log. A re-upload of the
 *  same (narrative, date, metric, source) replaces the stored value in
 *  place rather than duplicating it, so re-exporting the same Trends
 *  CSV is idempotent. */
export function mergeDatapoints(existing: StoredDatapoint[], incoming: AttentionDatapoint[]): StoredDatapoint[] {
  const byKey = new Map<string, StoredDatapoint>();
  for (const d of existing) byKey.set(dedupeKey(d), d);
  for (const d of incoming) {
    const key = dedupeKey(d);
    const id = byKey.get(key)?.id ?? makeId();
    byKey.set(key, { ...d, id });
  }
  return Array.from(byKey.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function removeDatapoint(list: StoredDatapoint[], id: string): StoredDatapoint[] {
  return list.filter((d) => d.id !== id);
}

export function loadDatapoints(): StoredDatapoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => {
        const d = normalizeDatapoint(r);
        const rid = (r as Record<string, unknown> | null)?.id;
        return d && isStr(rid) ? { ...d, id: rid } : null;
      })
      .filter((d): d is StoredDatapoint => d !== null);
  } catch {
    return [];
  }
}

export function saveDatapoints(list: StoredDatapoint[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage disabled — the session still works,
    // it just won't persist across reloads. Nothing to surface here;
    // the caller's next load() simply comes back empty.
  }
}

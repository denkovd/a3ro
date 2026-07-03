"use client";
/* ────────────────────────────────────────────────────────────────
   Gold Tracker — data layer
   One snapshot shape, swappable providers. The card renders a
   GoldSnapshot and nothing else, so moving from the mocked JSON
   feed to a real gold API is a provider change, not a UI change:

     1. Point NEXT_PUBLIC_GOLD_API_URL at a JSON endpoint, or
     2. call createHttpGoldProvider(url, mapFn) with a custom
        mapper from the API's payload to GoldSnapshot.

   Everything is normalised through normalizeSnapshot, so partial
   or malformed payloads degrade to the mock baseline field-by-field.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import rawMock from "./gold.mock.json";

/* ── palette: the module's disciplined gold ── */
export const GOLD_ACCENT = "#dcc689";
export const GOLD_BRIGHT = "#efdca4";

/* ── snapshot shape ── */
export type ChangeKey = "d1" | "w1" | "y1" | "y5" | "y10";
export type IndicatorKey =
  | "trend"
  | "momentum"
  | "volatility"
  | "usdPressure"
  | "realYieldPressure";

export type IndicatorReading = {
  state: string; // short word: "Rising", "Compressed", …
  score: number; // 0..1 intensity, drives the meter
  bias: -1 | 0 | 1; // headwind / neutral / tailwind for gold
};

export type GoldSnapshot = {
  source: "mock" | "live";
  asOf: string; // ISO timestamp
  price: { value: number; currency: string; unit: string };
  changes: Record<ChangeKey, number>; // percent
  indicators: Record<IndicatorKey, IndicatorReading>;
};

export interface GoldDataProvider {
  getSnapshot(): Promise<GoldSnapshot>;
  /* optional push updates; return an unsubscribe */
  subscribe?(onUpdate: (s: GoldSnapshot) => void): () => void;
}

/* ── normaliser: any payload → a safe GoldSnapshot ── */
const CHANGE_KEYS: ChangeKey[] = ["d1", "w1", "y1", "y5", "y10"];
const INDICATOR_KEYS: IndicatorKey[] = [
  "trend",
  "momentum",
  "volatility",
  "usdPressure",
  "realYieldPressure",
];

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v.length > 0 ? v : fallback;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toBias = (v: unknown): -1 | 0 | 1 =>
  num(v, 0) > 0 ? 1 : num(v, 0) < 0 ? -1 : 0;

export function normalizeSnapshot(raw: unknown): GoldSnapshot {
  const o = (raw ?? {}) as Record<string, unknown>;
  const price = (o.price ?? {}) as Record<string, unknown>;
  const changes = (o.changes ?? {}) as Record<string, unknown>;
  const indicators = (o.indicators ?? {}) as Record<string, unknown>;

  const outChanges = {} as Record<ChangeKey, number>;
  CHANGE_KEYS.forEach((k) => (outChanges[k] = num(changes[k], 0)));

  const outIndicators = {} as Record<IndicatorKey, IndicatorReading>;
  INDICATOR_KEYS.forEach((k) => {
    const r = (indicators[k] ?? {}) as Record<string, unknown>;
    outIndicators[k] = {
      state: str(r.state, "—"),
      score: clamp01(num(r.score, 0.5)),
      bias: toBias(r.bias),
    };
  });

  return {
    source: o.source === "live" ? "live" : "mock",
    asOf: str(o.asOf, "1970-01-01T00:00:00Z"),
    price: {
      value: num(price.value, 0),
      currency: str(price.currency, "USD"),
      unit: str(price.unit, "troy oz"),
    },
    changes: outChanges,
    indicators: outIndicators,
  };
}

/* ── mock provider: static JSON baseline + gentle simulated drift ── */
export const MOCK_SNAPSHOT: GoldSnapshot = normalizeSnapshot(rawMock);

export const mockGoldProvider: GoldDataProvider = {
  async getSnapshot() {
    return MOCK_SNAPSHOT;
  },
  subscribe(onUpdate) {
    let price = MOCK_SNAPSHOT.price.value;
    let d1 = MOCK_SNAPSHOT.changes.d1;
    const id = setInterval(() => {
      const step = (Math.random() - 0.485) * 1.6; // slight upward lean
      price = Math.max(1, price + step);
      d1 += (step / MOCK_SNAPSHOT.price.value) * 100;
      onUpdate({
        ...MOCK_SNAPSHOT,
        asOf: new Date().toISOString(),
        price: { ...MOCK_SNAPSHOT.price, value: price },
        changes: { ...MOCK_SNAPSHOT.changes, d1 },
      });
    }, 2800);
    return () => clearInterval(id);
  },
};

/* ── live provider: fetch a JSON endpoint, map, normalise ── */
export function createHttpGoldProvider(
  url: string,
  map: (raw: unknown) => GoldSnapshot = normalizeSnapshot
): GoldDataProvider {
  return {
    async getSnapshot() {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`gold api responded ${res.status}`);
      return { ...map(await res.json()), source: "live" };
    },
  };
}

export function getGoldProvider(): GoldDataProvider {
  const url = process.env.NEXT_PUBLIC_GOLD_API_URL;
  return url ? createHttpGoldProvider(url) : mockGoldProvider;
}

/* ── hook: the card's single data entry point ──
   Initial state is the static mock (SSR-safe, no hydration drift);
   the provider then refreshes and, if it can, pushes updates. */
export function useGoldSnapshot(): GoldSnapshot {
  const [snap, setSnap] = useState<GoldSnapshot>(MOCK_SNAPSHOT);
  useEffect(() => {
    const provider = getGoldProvider();
    let alive = true;
    provider
      .getSnapshot()
      .then((s) => alive && setSnap(s))
      .catch(() => {}); // keep last good snapshot on failure
    const un = provider.subscribe?.((s) => alive && setSnap(s));
    return () => {
      alive = false;
      un?.();
    };
  }, []);
  return snap;
}

/* ── display helpers (deterministic across server/client) ── */
export const formatPrice = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPct = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;

export const formatAsOf = (iso: string) => `${iso.slice(11, 16)} UTC`;

export const CHANGE_ROWS: { key: ChangeKey; label: string }[] = [
  { key: "d1", label: "1 Day" },
  { key: "w1", label: "1 Week" },
  { key: "y1", label: "1 Year" },
  { key: "y5", label: "5 Year" },
  { key: "y10", label: "10 Year" },
];

export const INDICATOR_ROWS: { key: IndicatorKey; label: string }[] = [
  { key: "trend", label: "Trend" },
  { key: "momentum", label: "Momentum" },
  { key: "volatility", label: "Volatility" },
  { key: "usdPressure", label: "USD Pressure" },
  { key: "realYieldPressure", label: "Real Yield Pressure" },
];

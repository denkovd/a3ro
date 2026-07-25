"use client";
/* ────────────────────────────────────────────────────────────────
   BTC Tracker — price data layer. Mirrors gold/goldData.ts, minus
   the indicator block (no Gold-style Trend/Momentum/… legs this
   phase). One snapshot shape, swappable providers: the card renders
   a BtcSnapshot and nothing else, so moving from the mocked JSON
   baseline to /api/btc/latest is a provider change, not a UI change.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import rawMock from "./btc.mock.json";

export type ChangeKey = "d1" | "w1" | "m1" | "y1";

export type BtcSnapshot = {
  source: "mock" | "live";
  asOf: string; // ISO timestamp
  price: { value: number; currency: string };
  changes: Record<ChangeKey, number>; // percent
};

export interface BtcDataProvider {
  getSnapshot(): Promise<BtcSnapshot>;
}

const CHANGE_KEYS: ChangeKey[] = ["d1", "w1", "m1", "y1"];

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v.length > 0 ? v : fallback;

export function normalizeSnapshot(raw: unknown): BtcSnapshot {
  const o = (raw ?? {}) as Record<string, unknown>;
  const price = (o.price ?? {}) as Record<string, unknown>;
  const changes = (o.changes ?? {}) as Record<string, unknown>;

  const outChanges = {} as Record<ChangeKey, number>;
  CHANGE_KEYS.forEach((k) => (outChanges[k] = num(changes[k], 0)));

  return {
    source: o.source === "live" ? "live" : "mock",
    asOf: str(o.asOf, "1970-01-01T00:00:00Z"),
    price: {
      value: num(price.value, 0),
      currency: str(price.currency, "USD"),
    },
    changes: outChanges,
  };
}

export const MOCK_SNAPSHOT: BtcSnapshot = normalizeSnapshot(rawMock);

export const mockBtcProvider: BtcDataProvider = {
  async getSnapshot() {
    return MOCK_SNAPSHOT;
  },
};

export function createHttpBtcProvider(
  url: string,
  map: (raw: unknown) => BtcSnapshot = normalizeSnapshot
): BtcDataProvider {
  return {
    async getSnapshot() {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`btc api responded ${res.status}`);
      return { ...map(await res.json()), source: "live" };
    },
  };
}

export function getBtcProvider(): BtcDataProvider {
  const url = process.env.NEXT_PUBLIC_BTC_API_URL ?? "/api/btc/latest";
  return createHttpBtcProvider(url);
}

/** Initial state is the static mock (SSR-safe, no hydration drift);
 *  the provider then fetches once and, on success, replaces it. */
export function useBtcSnapshot(): BtcSnapshot {
  const [snap, setSnap] = useState<BtcSnapshot>(MOCK_SNAPSHOT);
  useEffect(() => {
    const provider = getBtcProvider();
    let alive = true;
    provider
      .getSnapshot()
      .then((s) => alive && setSnap(s))
      .catch(() => {
        /* API missing or empty — keep mock baseline */
      });
    return () => {
      alive = false;
    };
  }, []);
  return snap;
}

/* ── display helpers (deterministic across server/client) ── */
export const formatBtcPrice = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const formatPct = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;

export const formatAsOf = (iso: string) => `${iso.slice(11, 16)} UTC`;

export const CHANGE_ROWS: { key: ChangeKey; label: string }[] = [
  { key: "d1", label: "1 Day" },
  { key: "w1", label: "1 Week" },
  { key: "m1", label: "1 Month" },
  { key: "y1", label: "1 Year" },
];

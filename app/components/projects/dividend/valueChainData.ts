"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMarketSnapshot } from "../marketFetch";
import type { ValueChainResponse } from "../../../../backend/src/dividend/valueChain/labs";

export function useValueChain() {
  const [data, setData] = useState<ValueChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketSnapshot("/api/dividend/value-chain").then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (payload?.version !== 1 || !Array.isArray(payload.layers) || !Array.isArray(payload.companies) || !Array.isArray(payload.labs)) throw new Error("unverified");
      if (active) { setData(payload); setError(null); }
    }).catch(() => { if (active) setError("Company figures could not be loaded. Try again shortly."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { data, loading, error, retry };
}

/** $ billions, or $ trillions from 1,000B. Negative values keep their sign in front. */
export function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  return abs >= 1e12 ? `${sign}$${(abs / 1e12).toFixed(2)}T` : `${sign}$${(abs / 1e9).toFixed(1)}B`;
}

export function pct(value: number | null | undefined, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = `${Math.abs(value * 100).toFixed(1)}%`;
  return value < 0 ? `−${text}` : signed && value > 0 ? `+${text}` : text;
}

export function monthYear(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
}

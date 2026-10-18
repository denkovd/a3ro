"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMarketSnapshot } from "../marketFetch";
import type { HorizonSnapshot } from "../../../../backend/src/horizon/types";

export const HORIZON_ROUTE = "/Projects/Macro-Horizon";
export const HORIZON_ACCENT = "#8b9dff";

export function horizonNumber(value: number | null, unit: string, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "usd2017") return "$" + Math.round(value).toLocaleString("en-AU");
  return value.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (unit === "percent" ? "%" : "");
}

export function horizonChange(value: number | null, type: string): string {
  if (value === null || !Number.isFinite(value)) return "Annual comparison unavailable";
  const rounded = Number(value.toFixed(2));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}${type === "percentage_points" ? " pp" : "%"} over one year`;
}

export function useHorizonBaseline() {
  const [snapshot, setSnapshot] = useState<HorizonSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketSnapshot("/api/horizon/latest").then(async response => {
      if (!response.ok) throw new Error("The baseline could not be loaded");
      const payload = await response.json();
      if (payload?.version !== 1 || !Array.isArray(payload.indicators) || !payload.coverage || !Array.isArray(payload.sources)) throw new Error("The baseline response could not be verified");
      if (active) { setSnapshot(payload); setError(null); }
    }).catch(() => { if (active) setError("The baseline could not be loaded. Try again shortly."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { snapshot, loading, error, retry };
}

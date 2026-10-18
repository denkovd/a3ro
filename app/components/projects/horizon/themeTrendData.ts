"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeBullSnapshot, type BullSnapshotState } from "../bull/bullData";
import { fetchMarketSnapshot } from "../marketFetch";

export function useThemeTrend() {
  const [snapshot, setSnapshot] = useState<BullSnapshotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketSnapshot("/api/bull/latest?strategy=ml-dw").then(async response => {
      if (!response.ok) throw new Error("Trend context could not be loaded.");
      const payload = await response.json();
      if (payload?.strategy !== "ml-dw" || !Array.isArray(payload.rows)) throw new Error("Trend context could not be verified.");
      const normalized = normalizeBullSnapshot(payload);
      if (active) { setSnapshot(normalized); setError(null); }
    }).catch(() => { if (active) setError("Trend context could not be verified. Company research remains available; no missing trend is treated as bearish or bullish."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { snapshot, loading, error, retry };
}

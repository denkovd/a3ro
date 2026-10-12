"use client";
import { useEffect, useState } from "react";
import type { BtcMarketResponse } from "./marketData";

export default function useBtcMarkets() {
  const [data, setData] = useState<BtcMarketResponse & { loading: boolean; now: number }>({
    markets: [], errors: {}, loading: true, now: Date.now(),
  });
  useEffect(() => {
    let alive = true, busy = false;
    const controller = new AbortController();
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/btc/markets", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("Market data unavailable");
        const body = await res.json() as BtcMarketResponse;
        if (!Array.isArray(body.markets) || !body.errors) throw new Error("Invalid market response");
        if (alive) setData((previous) => ({
          markets: ["coinbase", "bybit"].flatMap((id) => {
            const market = body.markets.find((m) => m.locus === id) ?? previous.markets.find((m) => m.locus === id);
            return market ? [market] : [];
          }), errors: body.errors, loading: false, now: Date.now(),
        }));
      } catch {
        if (alive) setData((previous) => ({ ...previous, loading: false, now: Date.now(),
          errors: { coinbase: "Market refresh failed. Retrying automatically.", bybit: "Market refresh failed. Retrying automatically." } }));
      } finally { busy = false; }
    };
    void load();
    const poll = setInterval(load, 60_000);
    const clock = setInterval(() => alive && setData((previous) => ({ ...previous, now: Date.now() })), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return data;
}

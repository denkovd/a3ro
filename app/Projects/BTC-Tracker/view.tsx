"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/BTC-Tracker — fullscreen experience shell
   Same handoff pattern as Oil: preview → lazy core, Esc → index.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import BtcTrackerPreview from "../../components/projects/BtcTrackerPreview";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import CommodityNav from "../../components/projects/commodity/CommodityNav";
import {
  ORANGE_CSS,
  BT_SESSION,
  BT_ATMOSPHERE,
  type BTView,
} from "../../components/projects/btcTrackerShared";
import { DataAsOf } from "../../components/DataAsOf";
import TradingViewWidget from "../../components/TradingViewWidget";
import { LockIcon } from "../../components/LockIcon";

/** Free visitors (#123): the TradingView chart, and what Premium adds. The globe's data is Premium-only. */
function FreeBtcView() {
  return <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col gap-3 overflow-y-auto p-4 md:bottom-10 md:top-14 md:flex-row md:items-start md:p-6">
    <div className="min-h-[420px] flex-1 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.6)] p-2">
      <TradingViewWidget widget="advanced-chart" height={600} label="Bitcoin in US dollars (BITSTAMP:BTCUSD) chart"
        config={{ symbol: "BITSTAMP:BTCUSD", interval: "D", style: "1", hide_side_toolbar: true, allow_symbol_change: false, details: false, calendar: false }} />
    </div>
    <aside className="flex shrink-0 flex-col gap-3 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.85)] p-5 md:w-[300px]">
      <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: ORANGE_CSS }}><LockIcon title="Premium" /> BTC globe · Premium</p>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">The chart is free. Premium adds the BTC globe: where bitcoin trades, how much the US spot ETFs hold and buy each day, where it&rsquo;s mined, and how bitcoin fits the macro backdrop.</p>
      <a href="/private?module=btc&next=/Projects/BTC-Tracker" className="self-start rounded-sm border border-[var(--line-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink)]">See Premium</a>
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">Free: bitcoin&rsquo;s fees and the apps built on it on the <a className="underline" href="/Projects/Crypto-Fundamentals?tab=btc">Crypto page</a>.</p>
    </aside>
  </div>;
}

const BtcTrackerCore = dynamic(
  () => import("../../components/projects/BtcTrackerCore"),
  { ssr: false, loading: () => null },
);

function readArrival(): BTView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BT_SESSION);
    if (!raw) return null;
    sessionStorage.removeItem(BT_SESSION);
    const p = JSON.parse(raw) as { v: BTView | null; ts: number };
    if (!p.v || Date.now() - p.ts > 15000) return null;
    return p.v;
  } catch {
    return null;
  }
}

export default function BtcTrackerView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [arrive, setArrive] = useState<BTView | null>(null);
  const [coreReady, setCoreReady] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [leaving, setLeaving] = useState(false);
  // Premium check (#123): the globe's data API answers 401/403 to free visitors. Anything else (even an
  // outage) counts as Premium, so a database hiccup never locks a subscriber out.
  const [access, setAccess] = useState<"checking" | "premium" | "free">("checking");
  useEffect(() => {
    let live = true;
    fetch("/api/btc/markets", { cache: "no-store" })
      .then((r) => live && setAccess(r.status === 401 || r.status === 403 ? "free" : "premium"))
      .catch(() => live && setAccess("premium"));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setArrive(readArrival());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!coreReady) return;
    const t = setTimeout(() => setShowPreview(false), 600);
    return () => clearTimeout(t);
  }, [coreReady]);

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) {
      router.push("/#modules");
      return;
    }
    setLeaving(true);
  }, [leaving, reduced, router]);

  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (leaving) router.push("/#modules");
      }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: BT_ATMOSPHERE }} />

      {mounted && access === "free" && <FreeBtcView />}

      {mounted && access === "premium" && arrive && showPreview && (
        <div className="absolute inset-0">
          <BtcTrackerPreview initialView={arrive} />
        </div>
      )}

      {mounted && access === "premium" && (
        <motion.div
          className="absolute inset-x-0 bottom-0 top-12 md:bottom-10 md:top-14"
          initial={{ opacity: 0 }}
          animate={{ opacity: coreReady ? 1 : 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <BtcTrackerCore
            className="h-full w-full"
            initialView={arrive}
            skipIntro={!!arrive}
            onExit={leave}
            onReady={() => setCoreReady(true)}
          />
        </motion.div>
      )}

      <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.72)] px-6 backdrop-blur-md md:h-14 md:px-10">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <button
            onClick={leave}
            className="sweep shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close BTC Tracker and return to the index"
          >
            ← Index
          </button>
          <ModuleSwitcher current="commodity" />
          <span aria-hidden className="text-[var(--ink-3)]">
            /
          </span>
          <p className="hidden truncate font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)] lg:block">
            A3RO Intelligence — Commodity Watch
          </p>
          <CommodityNav current="btc" />
        </div>
        <p className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          {!reduced ? (
            <motion.span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: ORANGE_CSS }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: ORANGE_CSS }}
            />
          )}
          <span className="hidden sm:inline">Terminal · location & flow</span>
        </p>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-10 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:flex md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·03 — BTC Tracker
          <DataAsOf module="btc" />
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Illustrative routes · live data where shown · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}

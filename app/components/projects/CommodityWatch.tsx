"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Commodity Watch · homepage module card
   Consolidates the three single-asset teasers (Oil Tracker P·01,
   Gold Tracker P·02, BTC Tracker P·03) into one tabbed card. Each
   asset keeps its own route, session key, preview component and
   accent — only the homepage teaser is merged. Switching tabs swaps
   the preview, copy, accent and P-number; the card still expands
   into whichever asset's dedicated route is active when clicked.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_INOUT } from "../motion";
import OilTrackerPreview from "./OilTrackerPreview";
import GoldTrackerPreview from "./GoldTrackerPreview";
import BtcTrackerPreview from "./BtcTrackerPreview";
import { AMBER_CSS, OT_ROUTE, OT_SESSION, type OTView } from "./oilTrackerShared";
import { GOLD_CSS, GT_ROUTE, GT_SESSION, GT_ATMOSPHERE, type GTView } from "./goldTrackerShared";
import { ORANGE_CSS, BT_ROUTE, BT_SESSION, BT_ATMOSPHERE, type BTView } from "./btcTrackerShared";
import { useGoldSnapshot, formatPrice, formatPct, formatAsOf } from "./gold/goldData";
import { useBtcSnapshot, formatBtcPrice } from "./btc/btcData";

const OIL_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #101313 0%, var(--depth-1) 55%, #070808 100%)";

type AssetKey = "oil" | "gold" | "btc";

const ASSETS: Record<
  AssetKey,
  {
    kicker: string;
    pNumber: string;
    ghostNumeral: string;
    accent: string;
    atmosphere: string;
    route: string;
    session: string;
    desc: string;
    footerMeta: string;
    cta: string;
    ariaDetail: string;
  }
> = {
  oil: {
    kicker: "Oil",
    pNumber: "P·01",
    ghostNumeral: "01",
    accent: AMBER_CSS,
    atmosphere: OIL_ATMOSPHERE,
    route: OT_ROUTE,
    session: OT_SESSION,
    desc: "Live corridor intelligence for crude, products, and price-sensitive flows.",
    footerMeta: "Corridor intelligence — live preview",
    cta: "Enter live platform",
    ariaDetail: "the live corridor intelligence preview",
  },
  gold: {
    kicker: "Gold",
    pNumber: "P·02",
    ghostNumeral: "02",
    accent: GOLD_CSS,
    atmosphere: GT_ATMOSPHERE,
    route: GT_ROUTE,
    session: GT_SESSION,
    desc: "Mines, holders, and metal/paper flows — where gold is produced and stock sits.",
    footerMeta: "Mines · Holders · Flows",
    cta: "Open",
    ariaDetail: "mines, holders and flows",
  },
  btc: {
    kicker: "BTC",
    pNumber: "P·03",
    ghostNumeral: "03",
    accent: ORANGE_CSS,
    atmosphere: BT_ATMOSPHERE,
    route: BT_ROUTE,
    session: BT_SESSION,
    desc: "Where known Bitcoin sits — exchanges, ETFs, mining — and how liquidity flows between hubs.",
    footerMeta: "Venues · ETFs · Mining · Flows",
    cta: "Open",
    ariaDetail: "known stock and liquidity flows",
  },
};

const TABS: AssetKey[] = ["oil", "gold", "btc"];

type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number };

function GoldPricePanel() {
  const snap = useGoldSnapshot();
  const d1 = snap.changes.d1;
  const d1Color = d1 > 0 ? GOLD_CSS : d1 < 0 ? "var(--ink-2)" : "var(--ink-3)";
  return (
    <div className="pointer-events-none absolute right-5 top-5 text-right md:right-7 md:top-7">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
        XAU · {snap.source === "live" ? "live" : "baseline"}
      </p>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-[var(--ink)] md:text-3xl">
        {formatPrice(snap.price.value)}
      </p>
      <p className="mt-0.5 font-mono text-[10px] tabular-nums" style={{ color: d1Color }}>
        {formatPct(d1)} · 1D
      </p>
      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        As of {formatAsOf(snap.asOf)}
      </p>
    </div>
  );
}

function BtcPricePanel() {
  const snap = useBtcSnapshot();
  const d1 = snap.changes.d1;
  const d1Color = d1 > 0 ? ORANGE_CSS : d1 < 0 ? "var(--ink-2)" : "var(--ink-3)";
  return (
    <div className="pointer-events-none absolute right-5 top-5 text-right md:right-7 md:top-7">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
        BTC · {snap.source === "live" ? "live" : "baseline"}
      </p>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-[var(--ink)] md:text-3xl">
        ${formatBtcPrice(snap.price.value)}
      </p>
      <p className="mt-0.5 font-mono text-[10px] tabular-nums" style={{ color: d1Color }}>
        {formatPct(d1)} · 1D
      </p>
      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        As of {formatAsOf(snap.asOf)}
      </p>
    </div>
  );
}

export default function CommodityWatch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const oilViewRef = useRef<OTView | null>(null);
  const goldViewRef = useRef<GTView | null>(null);
  const btcViewRef = useRef<BTView | null>(null);
  const [tab, setTab] = useState<AssetKey>("oil");
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);

  const active = ASSETS[tab];

  useEffect(() => {
    setMounted(true);
    router.prefetch(OT_ROUTE);
    router.prefetch(GT_ROUTE);
    router.prefetch(BT_ROUTE);
  }, [router]);

  const open = () => {
    if (box) return;
    try {
      const viewRef = tab === "oil" ? oilViewRef : tab === "gold" ? goldViewRef : btcViewRef;
      sessionStorage.setItem(active.session, JSON.stringify({ v: viewRef.current, ts: Date.now() }));
    } catch {
      /* private mode — route falls back to its own intro */
    }
    if (reduced) {
      router.push(active.route);
      return;
    }
    const r = cardRef.current!.getBoundingClientRect();
    setBox({
      top: r.top, left: r.left, width: r.width, height: r.height,
      vw: window.innerWidth, vh: window.innerHeight,
    });
  };

  const selectTab = (e: MouseEvent, k: AssetKey) => {
    e.preventDefault();
    e.stopPropagation();
    setTab(k);
  };

  return (
    <>
      <a
        ref={cardRef}
        href={active.route}
        onClick={(e) => { e.preventDefault(); open(); }}
        aria-label={`Open A3RO Intelligence — Commodity Watch, ${active.ariaDetail}`}
        className={`group/cw relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
      >
        <div className="relative flex-1 overflow-hidden">
          <div aria-hidden className="absolute inset-0" style={{ background: active.atmosphere }} />
          {tab === "oil" && <OilTrackerPreview viewRef={oilViewRef} />}
          {tab === "gold" && <GoldTrackerPreview viewRef={goldViewRef} />}
          {tab === "btc" && <BtcTrackerPreview viewRef={btcViewRef} />}

          {/* corner registration marks — directory grammar */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] group-hover/cw:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
          />

          {/* identity */}
          <div className="pointer-events-none absolute left-5 top-5 max-w-[50%] md:left-7 md:top-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              {active.pNumber} — <span style={{ color: active.accent }}>{active.kicker}</span>
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
              A3RO Intelligence
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
              Commodity Watch
            </h3>
            <p className="mt-3 max-w-[16rem] text-[13px] leading-relaxed text-[var(--ink-2)]">
              {active.desc}
            </p>

            {/* tab control — pointer-events must be re-enabled over the identity block */}
            <div className="pointer-events-auto mt-4 flex items-center gap-1">
              {TABS.map((k) => {
                const on = k === tab;
                const a = ASSETS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Show ${a.kicker} tracker`}
                    onClick={(e) => selectTab(e, k)}
                    className="rounded-[2px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-base)]"
                    style={{
                      borderColor: on ? a.accent : "var(--line)",
                      color: on ? a.accent : "var(--ink-3)",
                      background: on ? "var(--depth-2)" : "transparent",
                    }}
                  >
                    {a.kicker}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "gold" && <GoldPricePanel />}
          {tab === "btc" && <BtcPricePanel />}

          {/* ghost numeral — directory grammar, swaps with active tab */}
          <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(3.5rem,9vw,7rem)] font-medium leading-none text-[var(--depth-3)]">
            {active.ghostNumeral}
          </span>

          {/* the one affordance */}
          <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/cw:text-[var(--ink)] md:bottom-6 md:right-7">
            {active.cta}
            <span
              aria-hidden
              className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/cw:translate-x-1"
              style={{ color: active.accent }}
            >
              →
            </span>
          </p>
        </div>

        {/* card footer — matches the directory grammar */}
        <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
          <h3 className="text-sm font-medium text-[var(--ink)]">
            A3RO Intelligence — Commodity Watch
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {active.footerMeta}
          </p>
        </div>
      </a>

      {/* ── expansion: the card surface morphs into the active asset's route ── */}
      {mounted && box && createPortal(
        <motion.div
          className="fixed z-[100] overflow-hidden"
          style={{ background: active.atmosphere }}
          initial={{
            top: box.top, left: box.left, width: box.width, height: box.height,
            borderRadius: 2, opacity: 1,
          }}
          animate={{ top: 0, left: 0, width: box.vw, height: box.vh, borderRadius: 0 }}
          transition={{ duration: 0.6, ease: EASE_INOUT as unknown as number[] }}
          onAnimationComplete={() => router.push(active.route)}
        >
          {tab === "oil" && <OilTrackerPreview initialView={oilViewRef.current} labels={false} />}
          {tab === "gold" && <GoldTrackerPreview initialView={goldViewRef.current} labels={false} />}
          {tab === "btc" && <BtcTrackerPreview initialView={btcViewRef.current} labels={false} />}
        </motion.div>,
        document.body
      )}
    </>
  );
}

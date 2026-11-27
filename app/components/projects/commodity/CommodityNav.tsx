"use client";
/* ────────────────────────────────────────────────────────────────
   Commodity Watch — asset tab row (shared section template, #55)
   One list of commodity trackers, used in every tracker's header, so a
   new commodity is added here once instead of in each view.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from "react";
import { LockIcon } from "../../LockIcon";
import { useViewer } from "../../useViewer";
import { AMBER_CSS, OT_ROUTE } from "../oilTrackerShared";
import { GOLD_CSS, GT_ROUTE } from "../goldTrackerShared";
import { ORANGE_CSS, BT_ROUTE } from "../btcTrackerShared";
import { URANIUM_CSS, UT_ROUTE } from "../uraniumTrackerShared";
import { IRON_CSS, IT_ROUTE } from "../ironOreTrackerShared";
import { COPPER_CSS, CT_ROUTE } from "../copperTrackerShared";
import { LNG_CSS, LT_ROUTE } from "../lngTrackerShared";

export type CommodityId = "oil" | "gold" | "btc" | "uranium" | "ironore" | "copper" | "lng";

export const COMMODITY_TABS: readonly { id: CommodityId; label: string; title: string; route: string; color: string; premium: boolean }[] = [
  { id: "oil", label: "Oil", title: "Oil Tracker", route: OT_ROUTE, color: AMBER_CSS, premium: false },
  { id: "ironore", label: "Iron ore", title: "Iron Ore Tracker", route: IT_ROUTE, color: IRON_CSS, premium: false },
  { id: "copper", label: "Copper", title: "Copper Tracker", route: CT_ROUTE, color: COPPER_CSS, premium: false },
  { id: "lng", label: "LNG", title: "LNG Tracker", route: LT_ROUTE, color: LNG_CSS, premium: false },
  { id: "uranium", label: "Uranium", title: "Uranium Tracker", route: UT_ROUTE, color: URANIUM_CSS, premium: false },
  { id: "gold", label: "Gold", title: "Gold Tracker", route: GT_ROUTE, color: GOLD_CSS, premium: true },
  { id: "btc", label: "BTC", title: "BTC Tracker", route: BT_ROUTE, color: ORANGE_CSS, premium: true },
];

const tab = "inline-flex items-center gap-1 whitespace-nowrap px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors hover:opacity-100";

export default function CommodityNav({ current }: { current: CommodityId }) {
  const viewer = useViewer();
  const navRef = useRef<HTMLElement>(null);
  // On narrow screens the row scrolls sideways: bring the current tab into view.
  useEffect(() => {
    const nav = navRef.current, el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && el && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = el.offsetLeft - nav.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2;
  }, [current]);
  return (
    <nav ref={navRef} aria-label="Market surface" className="flex min-w-0 items-center gap-0.5 overflow-x-auto border-l border-[var(--line)] pl-2 sm:pl-3">
      {COMMODITY_TABS.map((t) => {
        if (t.id === current) return <span key={t.id} className={tab} style={{ color: t.color }} aria-current="page">{t.label}</span>;
        const locked = t.premium && !viewer.premium;
        return (
          <a key={t.id} href={t.route} className={tab} style={{ color: t.color, opacity: 0.55 }} title={locked ? `${t.title} · Premium` : `Open ${t.title}`}>
            {t.label}{locked ? <LockIcon title="Premium" /> : null}
          </a>
        );
      })}
    </nav>
  );
}

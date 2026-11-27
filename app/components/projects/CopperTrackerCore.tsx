"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Copper Tracker · globe (roadmap #56)
   Route-only: /Projects/Copper-Tracker. Built on the shared Commodity
   Watch template (commodity/CommodityGlobe, RailKit, ExportsBlock).
   Layers: mine output and refined output by country (USGS), major
   mines and Australian smelters, Australia's export flows (ABS, live).
   Live COMEX warehouse stocks (CME) sit in the rail.
──────────────────────────────────────────────────────────────── */
import { useMemo } from "react";
import CommodityGlobe, { type GlobeLayer, type GlobePalette, type GlobePreset } from "./commodity/CommodityGlobe";
import CopperIntelPanel from "./copper/CopperIntelPanel";
import { audBn, useJson } from "./commodity/ExportsBlock";
import { COPPER_CSS, CU, CU_HI, DEMAND, DEMAND_CSS, HOME } from "./copperTrackerShared";
import { COUNTRIES, DESTINATIONS, FLOW_ORIGIN, PRODUCTION_YEAR, SITES } from "../../../lib/copper/reference";
import type { CommodityExports } from "../../../lib/commodity/absExports";
import type { ComexCopperStocks } from "../../../lib/copper/comexStocks";

const PALETTE: GlobePalette = { supply: CU, supplyHi: CU_HI, supplyCss: COPPER_CSS, demand: DEMAND, demandCss: DEMAND_CSS, supplyRgb: "92,191,166" };

const PRESETS: GlobePreset[] = [
  { name: "Overview", layers: ["mining", "refining", "flows"], view: { lon: HOME.lon, lat: HOME.lat, zoom: 0.95 } },
  { name: "Mining", layers: ["mining", "mines"], view: { lon: -40, lat: -12, zoom: 0.95 } },
  { name: "Refining", layers: ["refining", "smelters"], view: { lon: 95, lat: 25, zoom: 0.95 } },
  { name: "Australia", layers: ["mines", "smelters", "flows"], view: { lon: 140, lat: -27, zoom: 2.6 } },
  { name: "Exports", layers: ["flows", "refining"], view: { lon: 125, lat: 10, zoom: 1.1 } },
];

const kt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} Mt` : `${Math.round(v)} kt`);

/** Destination shares for the arcs before the ABS answers, or if it can't be reached (ABS, 12 months to Sep 2026). */
const FALLBACK_SHARES: Record<string, number> = { CHIN: 0.31, JAP: 0.18, INIA: 0.1, MLAY: 0.1, USA: 0.1, RKOR: 0.08, INDO: 0.05, THAI: 0.03 };

export default function CopperTrackerCore({ onExit, onReady, className = "" }: { onExit?: () => void; onReady?: () => void; className?: string }) {
  const exportsState = useJson<CommodityExports>("/api/copper/exports", "copper exports");
  const comexState = useJson<ComexCopperStocks>("/api/copper/comex", "copper comex");

  const shares = useMemo<Record<string, number>>(() => (exportsState.status === "ok"
    ? Object.fromEntries(exportsState.data.destinations.map((d) => [d.code, d.share]))
    : FALLBACK_SHARES), [exportsState]);

  const layers = useMemo<GlobeLayer[]>(() => {
    const maxShare = Math.max(...Object.values(shares), 1e-9);
    return [
      { id: "mining", label: "Mine output", kind: "bubble", tone: "supply", labelTop: 5,
        items: COUNTRIES.filter((c) => (c.mine2025 ?? 0) > 50).map((c) => ({ id: `m:${c.id}`, lon: c.lon, lat: c.lat, value: c.mine2025!, label: `${c.name.toUpperCase()} · ${kt(c.mine2025!)} MINED` })) },
      { id: "refining", label: "Refined output", kind: "bubble", tone: "demand", labelTop: 3,
        items: COUNTRIES.filter((c) => (c.refined2025 ?? 0) > 0).map((c) => ({ id: `r:${c.id}`, lon: c.rlon ?? c.lon, lat: c.rlat ?? c.lat, value: c.refined2025!, label: `${c.name.toUpperCase()} · ${kt(c.refined2025!)} REFINED` })) },
      { id: "flows", label: "Australian exports", kind: "flow", tone: "supply",
        items: DESTINATIONS.filter((d) => (shares[d.code] ?? 0) > 0).map((d) => ({ id: `flow:${d.code}`, lon: FLOW_ORIGIN[0], lat: FLOW_ORIGIN[1], to: [d.lon, d.lat] as [number, number], value: (shares[d.code] ?? 0) / maxShare, label: d.name })) },
      { id: "mines", label: "Major mines", kind: "pin", tone: "supply", glyph: "circle", labelZoom: 2.2,
        items: SITES.filter((s) => s.kind === "mine").map((s) => ({ id: `site:${s.id}`, lon: s.lon, lat: s.lat, label: s.name.toUpperCase() })) },
      { id: "smelters", label: "Australian smelters", kind: "pin", tone: "demand", glyph: "square", labelZoom: 2.2,
        items: SITES.filter((s) => s.kind === "smelter").map((s) => ({ id: `site:${s.id}`, lon: s.lon, lat: s.lat, value: 1, label: s.name.toUpperCase() })) },
    ];
  }, [shares]);

  const hover = (id: string) => {
    const colon = id.indexOf(":");
    const kind = id.slice(0, colon), key = id.slice(colon + 1);
    if (kind === "m" || kind === "r") {
      const c = COUNTRIES.find((x) => x.id === key)!;
      return kind === "m"
        ? { title: c.name, lines: [`${kt(c.mine2025 ?? 0)} of copper mined, ${PRODUCTION_YEAR} (USGS estimate)`, c.refined2025 ? `${kt(c.refined2025)} refined` : ""], tone: "supply" as const }
        : { title: `${c.name} · refining`, lines: [`${kt(c.refined2025 ?? 0)} of refined copper, ${PRODUCTION_YEAR} (USGS estimate)`, c.mine2025 ? `${kt(c.mine2025)} mined at home` : "No copper mining"], tone: "demand" as const };
    }
    if (kind === "site") {
      const s = SITES.find((x) => x.id === key)!;
      return { title: s.name, lines: [s.owner, s.kind === "smelter" ? "Smelter / refinery" : "Mine"], tone: s.kind === "smelter" ? "demand" as const : "supply" as const };
    }
    if (kind === "flow") {
      const d = DESTINATIONS.find((x) => x.code === key)!;
      const live = exportsState.status === "ok" ? exportsState.data.destinations.find((x) => x.code === key) : null;
      return { title: `Australia → ${d.name}`, lines: [live ? `${audBn(live.last12AudM)} in the last 12 months · ${Math.round(live.share * 100)}%` : `About ${Math.round((FALLBACK_SHARES[key] ?? 0) * 100)}% of copper export value`, "Ores, concentrates and refined copper · ABS"], tone: "supply" as const };
    }
    return null;
  };

  return (
    <CommodityGlobe
      className={className}
      layers={layers}
      presets={PRESETS}
      palette={PALETTE}
      home={HOME}
      maxZoom={8}
      pinZoom={3}
      ariaLabel="Copper globe: mine and refined output by country, major mines, Australian smelters and Australia's export flows"
      hint="Drag · scroll to zoom · select a country, mine, smelter or flow"
      hover={hover}
      onExit={onExit}
      onReady={onReady}
      renderRail={(api) => <CopperIntelPanel {...api} exportsState={exportsState} comexState={comexState} />}
    />
  );
}

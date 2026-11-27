"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — LNG Tracker · globe (roadmap #57)
   Route-only: /Projects/LNG-Tracker. Built on the shared Commodity
   Watch template (commodity/CommodityGlobe, RailKit, ExportsBlock).
   Layers: exporters and importers (IGU 2025), Australia's ten LNG
   plants, the Strait of Hormuz, and Australia's export flows (ABS).
──────────────────────────────────────────────────────────────── */
import { useMemo } from "react";
import CommodityGlobe, { type GlobeLayer, type GlobePalette, type GlobePreset } from "./commodity/CommodityGlobe";
import LngIntelPanel from "./lng/LngIntelPanel";
import { useJson } from "./commodity/ExportsBlock";
import { BUYER, BUYER_CSS, HOME, LG, LG_HI, LNG_CSS } from "./lngTrackerShared";
import { DESTINATIONS, DESTINATION_PERIOD, DESTINATION_TOTAL_MT, EXPORTERS, FLOW_ORIGIN, HORMUZ, IMPORTERS, PLANTS, TRADE_YEAR } from "../../../lib/lng/reference";
import type { CommodityExports } from "../../../lib/commodity/absExports";

const PALETTE: GlobePalette = { supply: LG, supplyHi: LG_HI, supplyCss: LNG_CSS, demand: BUYER, demandCss: BUYER_CSS, supplyRgb: "111,168,255" };

const PRESETS: GlobePreset[] = [
  { name: "Overview", layers: ["exporters", "importers", "flows"], view: { lon: HOME.lon, lat: HOME.lat, zoom: 0.95 } },
  { name: "World trade", layers: ["exporters", "importers", "hormuz"], view: { lon: 60, lat: 25, zoom: 0.9 } },
  { name: "Australia", layers: ["plants", "flows"], view: { lon: 132, lat: -20, zoom: 2.6 } },
  { name: "Hormuz", layers: ["hormuz", "exporters"], view: { lon: 54.5, lat: 25.5, zoom: 5.5 } },
  { name: "Exports", layers: ["flows", "importers", "plants"], view: { lon: 125, lat: 10, zoom: 1.15 } },
];

/** Plants that sit together share one label, so the names don't pile up. */
const PLANT_LABEL: Record<string, string | undefined> = {
  nws: "KARRATHA · NWS + PLUTO", gorgon: "GORGON", wheatstone: "WHEATSTONE", prelude: "PRELUDE FLNG",
  ichthys: "DARWIN · ICHTHYS + DLNG", qclng: "CURTIS ISLAND · 3 PLANTS",
};

export default function LngTrackerCore({ onExit, onReady, className = "" }: { onExit?: () => void; onReady?: () => void; className?: string }) {
  const exportsState = useJson<CommodityExports>("/api/lng/exports", "lng exports");

  const layers = useMemo<GlobeLayer[]>(() => {
    const maxMt = Math.max(...DESTINATIONS.map((d) => d.mt));
    return [
      { id: "exporters", label: "Exporters", kind: "bubble", tone: "supply", labelTop: 3,
        items: EXPORTERS.map((e) => ({ id: `x:${e.id}`, lon: e.lon, lat: e.lat, value: e.mt, label: `${e.name.toUpperCase()} · ${Math.round(e.mt)} Mt OUT` })) },
      { id: "importers", label: "Importers", kind: "bubble", tone: "demand", labelTop: 3,
        items: IMPORTERS.map((i) => ({ id: i.id, lon: i.lon, lat: i.lat, value: i.mt, label: `${i.name.toUpperCase()} · ${Math.round(i.mt)} Mt IN` })) },
      { id: "flows", label: "Australian exports", kind: "flow", tone: "supply",
        items: DESTINATIONS.map((d) => ({ id: `flow:${d.code}`, lon: FLOW_ORIGIN[0], lat: FLOW_ORIGIN[1], to: [d.lon, d.lat] as [number, number], value: d.mt / maxMt, label: d.name })) },
      { id: "plants", label: "Australian LNG plants", kind: "pin", tone: "supply", glyph: "diamond", labelZoom: 2.4,
        items: PLANTS.map((p) => ({ id: `plant:${p.id}`, lon: p.lon, lat: p.lat, value: p.mtpa, label: PLANT_LABEL[p.id] })) },
      { id: "hormuz", label: "Strait of Hormuz", kind: "pin", tone: "demand", glyph: "triangle", labelZoom: 0,
        items: [{ id: "hormuz", lon: HORMUZ.lon, lat: HORMUZ.lat, value: 1, label: "STRAIT OF HORMUZ · RESTRICTED", labelAbove: true }] },
    ];
  }, []);

  const hover = (id: string) => {
    if (id === "hormuz") return { title: "Strait of Hormuz", lines: [`Restricted since ${HORMUZ.closedSince}`, `About ${Math.round(HORMUZ.supplyShare * 100)}% of world LNG supply cut off`], tone: "demand" as const };
    const colon = id.indexOf(":");
    const kind = colon > 0 ? id.slice(0, colon) : "", key = id.slice(colon + 1);
    if (kind === "x") { const e = EXPORTERS.find((x) => x.id === key)!; return { title: e.name, lines: [`${e.mt.toFixed(1)} Mt exported in ${TRADE_YEAR}`, "Exporter · IGU"], tone: "supply" as const }; }
    if (kind === "plant") { const p = PLANTS.find((x) => x.id === key)!; return { title: p.name, lines: [`${p.operator} · ${p.mtpa} Mtpa`, p.feed], tone: "supply" as const }; }
    if (kind === "flow") {
      const d = DESTINATIONS.find((x) => x.code === key)!;
      return { title: `Australia → ${d.name}`, lines: [`${d.mt} Mt, ${DESTINATION_PERIOD} · ${Math.round((d.mt / DESTINATION_TOTAL_MT) * 100)}%`, "Ship-tracking data"], tone: "supply" as const };
    }
    const imp = IMPORTERS.find((x) => x.id === id);
    if (imp) return { title: imp.name, lines: [`${imp.mt.toFixed(1)} Mt imported in ${TRADE_YEAR}`, "Importer · IGU"], tone: "demand" as const };
    return null;
  };

  return (
    <CommodityGlobe
      className={className}
      layers={layers}
      presets={PRESETS}
      palette={PALETTE}
      home={HOME}
      maxZoom={10}
      pinZoom={4}
      ariaLabel="LNG globe: exporters and importers, Australia's LNG plants, the Strait of Hormuz and Australia's export flows"
      hint="Drag · scroll to zoom · select a country, plant, flow or the strait"
      hover={hover}
      onExit={onExit}
      onReady={onReady}
      renderRail={(api) => <LngIntelPanel {...api} exportsState={exportsState} />}
    />
  );
}

"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Iron Ore Tracker · globe (roadmap #55)
   Route-only: /Projects/Iron-Ore-Tracker. First section built on the
   shared Commodity Watch template (commodity/CommodityGlobe + RailKit).
   Layers: producers (USGS), importers (WA Government), Pilbara ports
   and mines, and Australia's export flows by destination (ABS, live).
──────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import CommodityGlobe, { type GlobeLayer, type GlobePalette, type GlobePreset } from "./commodity/CommodityGlobe";
import IronOreIntelPanel from "./ironore/IronOreIntelPanel";
import { DEMAND, DEMAND_CSS, HOME, IRN, IRN_HI, IRON_CSS } from "./ironOreTrackerShared";
import { IMPORTERS, MINES, PORTS, PRODUCERS, PRODUCTION_YEAR, WA } from "../../../lib/ironore/reference";
import { DESTINATIONS, FLOW_ORIGIN, type IronOreExports } from "../../../lib/ironore/exports";

export type ExportsState = { status: "loading" } | { status: "ok"; data: IronOreExports } | { status: "error" };

const PALETTE: GlobePalette = { supply: IRN, supplyHi: IRN_HI, supplyCss: IRON_CSS, demand: DEMAND, demandCss: DEMAND_CSS, supplyRgb: "207,106,88" };

const PRESETS: GlobePreset[] = [
  { name: "Overview", layers: ["producers", "importers", "flows"], view: { lon: HOME.lon, lat: HOME.lat, zoom: 0.95 } },
  { name: "Producers", layers: ["producers", "mines"], view: { lon: 40, lat: 15, zoom: 0.95 } },
  { name: "Pilbara", layers: ["ports", "mines", "flows"], view: { lon: 117.6, lat: -21.9, zoom: 11 } },
  { name: "Exports", layers: ["flows", "importers", "ports"], view: { lon: 124, lat: 8, zoom: 1.15 } },
];

const fmtMt = (mt: number) => `${mt >= 100 ? Math.round(mt) : mt} Mt`;
const audBn = (audM: number) => `A$${(audM / 1000).toFixed(1)}bn`;

/** Shares to draw flows with before the ABS answers, or if it doesn't (WA profile, 2025-26 values). */
const FALLBACK_SHARES: Record<string, number> = { CHIN: 0.857, RKOR: 0.054, JAP: 0.054 };

export default function IronOreTrackerCore({ onExit, onReady, className = "" }: { onExit?: () => void; onReady?: () => void; className?: string }) {
  const [exportsState, setExportsState] = useState<ExportsState>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/ironore/exports", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: IronOreExports) => setExportsState({ status: "ok", data }))
      .catch((e) => { if (!ctrl.signal.aborted) { console.warn("[ironore] exports unavailable", e); setExportsState({ status: "error" }); } });
    return () => ctrl.abort();
  }, []);

  const shares = useMemo<Record<string, number>>(() => {
    if (exportsState.status !== "ok") return FALLBACK_SHARES;
    return Object.fromEntries(exportsState.data.destinations.map((d) => [d.code, d.share]));
  }, [exportsState]);

  const layers = useMemo<GlobeLayer[]>(() => {
    const maxShare = Math.max(...Object.values(shares), 1e-9);
    return [
      { id: "producers", label: "Producers", kind: "bubble", tone: "supply", labelTop: 5,
        items: PRODUCERS.map((p) => ({ id: `p:${p.id}`, lon: p.lon, lat: p.lat, value: p.mt2025, label: `${p.name.toUpperCase()} · ${fmtMt(p.mt2025)}` })) },
      { id: "importers", label: "Importers", kind: "bubble", tone: "demand", labelTop: 1,
        items: IMPORTERS.map((i) => ({ id: i.id, lon: i.lon, lat: i.lat, value: i.mt, label: `${i.name.toUpperCase()} IMPORTS · ${i.mt.toLocaleString("en-AU")} Mt` })) },
      { id: "flows", label: "Australian exports", kind: "flow", tone: "supply",
        items: DESTINATIONS.filter((d) => (shares[d.code] ?? 0) > 0).map((d) => ({ id: `flow:${d.code}`, lon: FLOW_ORIGIN[0], lat: FLOW_ORIGIN[1], to: [d.lon, d.lat] as [number, number], value: (shares[d.code] ?? 0) / maxShare, label: d.name })) },
      { id: "ports", label: "Export ports", kind: "pin", tone: "supply", glyph: "square", labelZoom: 4,
        items: PORTS.map((p) => ({ id: `port:${p.id}`, lon: p.lon, lat: p.lat, value: p.throughputMt ?? 0, label: p.name.toUpperCase() })) },
      { id: "mines", label: "Mines", kind: "pin", tone: "supply", glyph: "circle", labelZoom: 13,
        items: MINES.map((m) => ({ id: `mine:${m.id}`, lon: m.lon, lat: m.lat, label: m.name.toUpperCase() })) },
    ];
  }, [shares]);

  const hover = (id: string) => {
    const [kind, key] = [id.slice(0, id.indexOf(":") + 1) || id, id.slice(id.indexOf(":") + 1)];
    if (kind === "p:") {
      const p = PRODUCERS.find((x) => x.id === key)!;
      return { title: p.name, lines: [`${p.mt2025.toLocaleString("en-AU")} Mt usable ore, ${PRODUCTION_YEAR} (USGS estimate)`, p.mostlyDomestic ? "Most of it used at home" : "Producer"], tone: "supply" as const };
    }
    if (kind === "port:") {
      const p = PORTS.find((x) => x.id === key)!;
      return { title: p.name, lines: [p.operators, p.throughputMt !== null ? `${p.throughputMt} Mt throughput, 2025-26` : "Throughput not published here"], tone: "supply" as const };
    }
    if (kind === "mine:") {
      const m = MINES.find((x) => x.id === key)!;
      return { title: m.name, lines: [m.owner], tone: "supply" as const };
    }
    if (kind === "flow:") {
      const d = DESTINATIONS.find((x) => x.code === key)!;
      const live = exportsState.status === "ok" ? exportsState.data.destinations.find((x) => x.code === key) : null;
      return { title: `Australia → ${d.name}`, lines: [live ? `${audBn(live.last12AudM)} in the last 12 months · ${Math.round(live.share * 100)}%` : `${Math.round((FALLBACK_SHARES[key] ?? 0) * 100)}% of WA export value, ${WA.period}`, "Iron ore exports · ABS"], tone: "supply" as const };
    }
    const imp = IMPORTERS.find((x) => x.id === id);
    if (imp) return { title: imp.name, lines: [`${imp.mt.toLocaleString("en-AU")} Mt imported in 2025`, `${(imp.share * 100).toFixed(1)}% of world imports`], tone: "demand" as const };
    return null;
  };

  return (
    <CommodityGlobe
      className={className}
      layers={layers}
      presets={PRESETS}
      palette={PALETTE}
      home={HOME}
      maxZoom={16}
      pinZoom={9}
      ariaLabel="Iron ore globe: producing countries, importers, Pilbara mines and ports, and Australia's export flows"
      hint="Drag · scroll to zoom · select a country, port, mine or flow"
      hover={hover}
      onExit={onExit}
      onReady={onReady}
      renderRail={(api) => <IronOreIntelPanel {...api} exportsState={exportsState} />}
    />
  );
}

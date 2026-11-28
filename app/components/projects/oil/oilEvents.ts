/* ────────────────────────────────────────────────────────────────
   Oil globe red events (roadmap #95). Red on the oil globe means:
     · a refinery whose current condition is "outage" (a sourced outage,
       published within 14 days and verified within 7: refineryCondition)
     · a shipping gate whose 7-day traffic is "Well below" or "Severe"
       against its norm (gateTier ≥ 2, state "below")
   Nothing is red by assumption: both come from the live feeds.
──────────────────────────────────────────────────────────────── */
import type { GlobeEvent } from "../GlobeEventCards";
import { capacityLabel, mergeRefineryEvents, refineryCondition, type Refinery } from "./refineries";
import { gateTier, type GateSignal } from "./gateSignal";

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const approx = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1));

export function oilEvents(
  refineries: readonly Refinery[],
  gates: readonly { id: string; signal: GateSignal }[],
  gatePlaces: Readonly<Record<string, { lon: number; lat: number; title: string; focusId: string }>>,
  now = Date.now(),
): GlobeEvent[] {
  const out: GlobeEvent[] = [];
  for (const g of gates) {
    const place = gatePlaces[g.id];
    const s = g.signal;
    if (!place || s.state !== "below" || gateTier(s) < 2 || s.ratio === null || s.value === null) continue;
    out.push({
      id: `gate:${g.id}`, lon: place.lon, lat: place.lat, focusId: place.focusId,
      kicker: gateTier(s) >= 3 ? "Traffic severely below normal" : "Traffic well below normal", title: place.title,
      stats: [
        { label: "vs normal", value: `${Math.round(s.ratio * 100)}%` },
        { label: "Transits", value: `${approx(s.value)}/day` },
        ...(s.periodDate ? [{ label: "Week to", value: day(s.periodDate) }] : []),
      ],
    });
  }
  for (const r of refineries) {
    if (refineryCondition(r, now).status !== "outage") continue;
    const ev = mergeRefineryEvents(r).find((e) => e.kind === "outage" && Date.parse(e.date) <= now);
    if (!ev) continue;
    out.push({
      id: `ref:${r.id}`, lon: r.lon, lat: r.lat, focusId: `ref:${r.id}`,
      kicker: "Refinery outage", title: r.name,
      stats: [
        { label: "Since", value: day(ev.date) },
        { label: ev.affectedCapacityKbd ? "Affected" : "Capacity", value: ev.affectedCapacityKbd ? `${ev.affectedCapacityKbd.toLocaleString()} kb/d` : capacityLabel(r) },
        { label: "Restart", value: ev.expectedRestart ? day(ev.expectedRestart) : "Not given" },
      ],
    });
  }
  return out;
}

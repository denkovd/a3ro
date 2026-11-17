/* ────────────────────────────────────────────────────────────────
   Panel overlay: freshen one FRED series with a faster source.

   FRED's VIXCLS is published with a lag (often one to two sessions),
   so the liquidity model's "Equity vol (VIX)" leg could read 19.3
   while the market closed at 23.7. Yahoo's ^VIX daily bars land the
   same evening. This merges the faster observations into the FRED
   series by date — the faster source wins on any date both carry,
   FRED fills everything else — so the leg reads the latest close
   without throwing away FRED's history.

   Pure: no IO. The cycle fetches and isolates the Yahoo leg.
──────────────────────────────────────────────────────────────── */

import type { MacroObservation, MacroSeries } from "../sources/fredMacro";

export function overlayObservations(
  panel: MacroSeries[],
  key: string,
  fresher: MacroObservation[],
): MacroSeries[] {
  const usable = fresher.filter((o) => Number.isFinite(o.value) && /^\d{4}-\d{2}-\d{2}$/.test(o.date));
  if (usable.length === 0) return panel;
  return panel.map((series) => {
    if (series.key !== key) return series;
    const byDate = new Map<string, number>();
    for (const o of series.observations) byDate.set(o.date, o.value);
    for (const o of usable) byDate.set(o.date, o.value);
    const observations = [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { ...series, observations };
  });
}

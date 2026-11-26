/* ────────────────────────────────────────────────────────────────
   Copper Tracker — theme + route constants (roadmap #56)
   Palette: verdigris, the green of weathered copper, so it reads
   apart from iron ore's red and BTC's orange. Refining (where copper
   is turned into metal) uses the shared cool demand tone.
──────────────────────────────────────────────────────────────── */

export const CT_ROUTE = "/Projects/Copper-Tracker";

/** Opening composition: Australia and the Asian smelters its copper goes to. */
export const HOME = { lon: 132, lat: 2 };

export const COPPER_CSS = "#5cbfa6";
export const CU = (a: number) => `rgba(92,191,166,${a})`;
export const CU_HI = (a: number) => `rgba(150,226,206,${a})`;
/** Second colour for refined copper in stacked bars. */
export const CU_REFINED_CSS = "#2f7f6c";
export const DEMAND_CSS = "#96c8e6";
export const DEMAND = (a: number) => `rgba(150,200,230,${a})`;

export const CT_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0b1311 0%, var(--depth-1) 55%, #070808 100%)";

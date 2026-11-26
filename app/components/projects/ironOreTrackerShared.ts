/* ────────────────────────────────────────────────────────────────
   Iron Ore Tracker — theme + route constants (roadmap #55)
   Palette: a hematite red, one accent like the other trackers.
   Importers (demand) use the same cool tone as uranium reactors.
──────────────────────────────────────────────────────────────── */

export const IT_ROUTE = "/Projects/Iron-Ore-Tracker";

/** Opening composition: the Pilbara and the sea lanes north to China, Japan and Korea. */
export const HOME = { lon: 122, lat: 6 };

export const IRON_CSS = "#cf6a58";
export const IRN = (a: number) => `rgba(207,106,88,${a})`; // #cf6a58
export const IRN_HI = (a: number) => `rgba(236,150,128,${a})`; // #ec9680
export const DEMAND_CSS = "#96c8e6";
export const DEMAND = (a: number) => `rgba(150,200,230,${a})`;

export const IT_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #140d0b 0%, var(--depth-1) 55%, #070808 100%)";

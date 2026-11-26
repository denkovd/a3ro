/* ────────────────────────────────────────────────────────────────
   LNG Tracker — theme + route constants (roadmap #57)
   Palette: a gas-flame blue for supply (exporters, plants, flows);
   importers in a warm rose so supply and demand read apart.
──────────────────────────────────────────────────────────────── */

export const LT_ROUTE = "/Projects/LNG-Tracker";

/** Opening composition: Australia's plants and the Asian buyers they ship to. */
export const HOME = { lon: 128, lat: 4 };

export const LNG_CSS = "#6fa8ff";
export const LG = (a: number) => `rgba(111,168,255,${a})`;
export const LG_HI = (a: number) => `rgba(170,204,255,${a})`;
export const BUYER_CSS = "#e3a2c0";
export const BUYER = (a: number) => `rgba(227,162,192,${a})`;

export const LT_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0b0f17 0%, var(--depth-1) 55%, #070808 100%)";

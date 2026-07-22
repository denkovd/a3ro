/* ────────────────────────────────────────────────────────────────
   Gold Tracker — theme + route constants
   Reuses globe geometry from oilTrackerShared. Palette is gold.
──────────────────────────────────────────────────────────────── */

export {
  INK,
  DOT,
  bakeCorridor,
  getDots,
  rotator,
  vec,
  slerp,
  flowHealth,
  flowHealthBucket,
  type OTView as GTView,
  type Rot,
  D2R,
} from "./oilTrackerShared";

export const GT_ROUTE = "/Projects/Gold-Tracker";
export const GT_SESSION = "a3ro-gt-view";

/** Opening composition — North Atlantic vault / ETF belt. */
export const HOME = { lon: 0, lat: 35 };

/* ── palette: ink neutrals + disciplined gold ── */
export const GLD = (a: number) => `rgba(220,198,137,${a})`; // #dcc689
export const GLD_HI = (a: number) => `rgba(239,220,164,${a})`; // #efdca4
export const GOLD_CSS = "#dcc689";
export const GOLD_BRIGHT = "#efdca4";

export const GT_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #14120d 0%, var(--depth-1) 55%, #070808 100%)";

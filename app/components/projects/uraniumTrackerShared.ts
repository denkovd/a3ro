/* ────────────────────────────────────────────────────────────────
   Uranium Tracker — theme + route constants
   Reuses globe geometry from oilTrackerShared. Palette: a pale
   uranium-glass green, one accent like the other trackers.
──────────────────────────────────────────────────────────────── */

export {
  INK,
  DOT,
  getDots,
  rotator,
  vec,
  type OTView as UTView,
  type Rot,
} from "./oilTrackerShared";

export const UT_ROUTE = "/Projects/Uranium-Tracker";

/** Opening composition: Central Asia and Europe, where most mining and enrichment sit. */
export const HOME = { lon: 50, lat: 38 };

export const URN = (a: number) => `rgba(184,226,120,${a})`; // #b8e278
export const URN_HI = (a: number) => `rgba(214,244,166,${a})`; // #d6f4a6
export const URANIUM_CSS = "#b8e278";
/** Reactors (demand) sit in a cooler tone so supply and demand read apart. */
export const DEMAND = (a: number) => `rgba(150,200,230,${a})`; // #96c8e6
export const DEMAND_CSS = "#96c8e6";

export const UT_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0e130c 0%, var(--depth-1) 55%, #070808 100%)";

/* ────────────────────────────────────────────────────────────────
   Static annual reference data, clearly labeled in the UI — reserves
   are end-2024 proven (OPEC Annual Statistical Bulletin 2025);
   production is crude+condensate 2025 estimates (EIA). NOT live;
   update yearly. Marker positions are producing heartlands (Permian,
   Ghawar, W. Siberia, Athabasca, Orinoco…), not capitals.

   Client-safe: no backend imports at all — this module is pure data.
──────────────────────────────────────────────────────────────── */

export type ProducerLayerMode = "off" | "production" | "reserves";

export interface Producer {
  id: string;
  name: string; // mono caps display name
  lon: number;
  lat: number; // marker at producing heartland, not capital
  reservesBbl: number; // proven reserves, billion barrels (OPEC ASB 2025, end-2024)
  productionMbd: number; // crude + condensate, Mb/d (EIA 2025 est.)
}

export const PRODUCERS_SOURCE = "OPEC ASB 2025 · EIA 2025 est. · annual reference";

export const PRODUCERS: Producer[] = [
  { id: "us", name: "US", lon: -101, lat: 32, reservesBbl: 48, productionMbd: 13.6 },
  { id: "saudi_arabia", name: "SAUDI ARABIA", lon: 48.5, lat: 25.5, reservesBbl: 267, productionMbd: 9.6 },
  { id: "russia", name: "RUSSIA", lon: 76, lat: 62, reservesBbl: 80, productionMbd: 9.9 },
  { id: "canada", name: "CANADA", lon: -112, lat: 56.5, reservesBbl: 171, productionMbd: 4.9 },
  { id: "iraq", name: "IRAQ", lon: 47.5, lat: 30.5, reservesBbl: 145, productionMbd: 4.3 },
  { id: "china", name: "CHINA", lon: 105, lat: 36, reservesBbl: 26, productionMbd: 4.3 },
  { id: "brazil", name: "BRAZIL", lon: -41, lat: -23, reservesBbl: 16, productionMbd: 3.7 },
  { id: "uae", name: "UAE", lon: 54, lat: 24, reservesBbl: 113, productionMbd: 3.4 },
  { id: "iran", name: "IRAN", lon: 50.5, lat: 29.5, reservesBbl: 209, productionMbd: 3.3 },
  { id: "kuwait", name: "KUWAIT", lon: 47.8, lat: 29.2, reservesBbl: 102, productionMbd: 2.5 },
  { id: "kazakhstan", name: "KAZAKHSTAN", lon: 52.5, lat: 45.5, reservesBbl: 30, productionMbd: 1.9 },
  { id: "norway", name: "NORWAY", lon: 3, lat: 60.5, reservesBbl: 8, productionMbd: 1.8 },
  { id: "nigeria", name: "NIGERIA", lon: 6.5, lat: 4.8, reservesBbl: 37, productionMbd: 1.4 },
  { id: "libya", name: "LIBYA", lon: 20, lat: 29, reservesBbl: 48, productionMbd: 1.2 },
  { id: "venezuela", name: "VENEZUELA", lon: -64.5, lat: 9, reservesBbl: 303, productionMbd: 0.9 },
];

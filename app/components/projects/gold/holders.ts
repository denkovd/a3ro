/* ────────────────────────────────────────────────────────────────
   Gold Tracker — holder / stock loci
   Pins = economic loci (ETF HQ, warehouse hub, vault belt), not
   vault GPS. Status is honest: connecting / watchlist / reference.
   Client-safe: pure data.
──────────────────────────────────────────────────────────────── */

export type HolderKind = "central_bank" | "etf" | "warehouse" | "vault_hub";
export type HolderStatus = "connecting" | "watchlist" | "reference";

export interface Holder {
  id: string;
  name: string;
  label: string;
  lon: number;
  lat: number;
  kind: HolderKind;
  glyph: "ring" | "diamond";
  zoom: number;
  status: HolderStatus;
  title: string;
  note: string;
  rank: number;
}

export const HOLDERS: Holder[] = [
  {
    id: "etf_us",
    name: "US SPOT ETFS",
    label: "US ETF",
    lon: -74.0,
    lat: 40.7,
    kind: "etf",
    glyph: "diamond",
    zoom: 1.42,
    status: "connecting",
    title: "US / North America gold ETFs",
    note:
      "WGC North America gold-ETF holdings (tonnes) — regional aggregate including GLD/IAU-class funds, not a single-fund pin. Weekly free GoldHub feed; week-over-week Δ is the flow proxy.",
    rank: 1,
  },
  {
    id: "comex",
    name: "COMEX",
    label: "COMEX",
    lon: -87.63,
    lat: 41.88,
    kind: "warehouse",
    glyph: "ring",
    zoom: 1.4,
    status: "connecting",
    title: "COMEX warehouse stocks",
    note:
      "Registered / eligible gold in COMEX warehouses from CME’s free daily Gold Stocks report (troy oz). Pin is warehouse locus, not a vault GPS.",
    rank: 1,
  },
  {
    id: "lbma",
    name: "LONDON · LBMA",
    label: "LONDON",
    lon: -0.12,
    lat: 51.5,
    kind: "vault_hub",
    glyph: "ring",
    zoom: 1.45,
    status: "watchlist",
    title: "London vault / LBMA hub",
    note:
      "Primary OTC clearing and vault locus. LBMA monthly vault stats are reference cadence — not live vault telemetry.",
    rank: 1,
  },
  {
    id: "zurich",
    name: "ZURICH",
    label: "ZURICH",
    lon: 8.54,
    lat: 47.37,
    kind: "vault_hub",
    glyph: "ring",
    zoom: 1.35,
    status: "watchlist",
    title: "Zurich refining / vault belt",
    note:
      "Swiss refining and private vault locus. Physical throughput is opaque on free tier — watchlist until a published series is verified.",
    rank: 2,
  },
  {
    id: "shanghai",
    name: "SHANGHAI",
    label: "SHANGHAI",
    lon: 121.47,
    lat: 31.23,
    kind: "vault_hub",
    glyph: "ring",
    zoom: 1.35,
    status: "watchlist",
    title: "Shanghai gold hub",
    note:
      "SGE / China physical demand locus. Free import/customs figures lag; near-real-time demand is PRO-tier.",
    rank: 2,
  },
  {
    id: "dubai",
    name: "DUBAI",
    label: "DUBAI",
    lon: 55.27,
    lat: 25.2,
    kind: "vault_hub",
    glyph: "ring",
    zoom: 1.28,
    status: "watchlist",
    title: "Dubai bullion hub",
    note:
      "Middle East physical trading locus. Volume figures sparse on free tier — labeled watchlist, not live flow.",
    rank: 2,
  },
  {
    id: "cb_us",
    name: "US OFFICIAL",
    label: "US CB",
    lon: -77.03,
    lat: 38.9,
    kind: "central_bank",
    glyph: "ring",
    zoom: 1.25,
    status: "reference",
    title: "US official gold reserves",
    note:
      "Published official sector holdings (tonnes). Annual / irregular updates — reference only, not weekly buy/sell telemetry.",
    rank: 2,
  },
  {
    id: "cb_china",
    name: "CHINA OFFICIAL",
    label: "CN CB",
    lon: 116.4,
    lat: 39.9,
    kind: "central_bank",
    glyph: "ring",
    zoom: 1.25,
    status: "reference",
    title: "China official gold reserves",
    note:
      "PBoC / IMF IFS published figures lag months. Never invent weekly accumulation — only published tonnes + asOf.",
    rank: 2,
  },
  {
    id: "cb_india",
    name: "INDIA OFFICIAL",
    label: "IN CB",
    lon: 77.2,
    lat: 28.6,
    kind: "central_bank",
    glyph: "ring",
    zoom: 1.22,
    status: "reference",
    title: "India official gold reserves",
    note:
      "RBI published holdings. Reference lag; jewellery/import demand is a separate monthly story.",
    rank: 3,
  },
  {
    id: "cb_euro",
    name: "EURO AREA",
    label: "EA CB",
    lon: 8.68,
    lat: 50.11,
    kind: "central_bank",
    glyph: "ring",
    zoom: 1.22,
    status: "reference",
    title: "Euro-area official gold",
    note:
      "Aggregate euro-system published reserves. Reference cadence only.",
    rank: 3,
  },
];

export const PRIMARY_HOLDERS = HOLDERS.filter((h) => h.rank === 1);

"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 Regime Shift Finder — Macro Brief Overlay data layer.
   Translates longer-form macro commentary into a normalized,
   signal-first schema: regimeBase, horizons (near/medium/long),
   cycleScores (six cycles → tailwind/neutral/headwind), riskFlags,
   portfolioBias (per-asset directional tags). Growth, inflation and
   positioning are derived from the live FRED/CFTC snapshot; monetary,
   fiscal and liquidity are an editorial brief (dated, per-quadrant
   defaults) — each read carries its source so the UI can stay honest.
   No prose blocks: everything renders as badges, tiles and tags.
──────────────────────────────────────────────────────────────── */
import {
  MACRO_ACCENT,
  MACRO_AMBER,
  MACRO_PINK,
  type MacroQuadrant,
  type MacroSnapshot,
} from "./macroData";

/* regime mint — already in the site palette (see macroData palette note) */
export const BRIEF_GREEN = "#5fc9a4";

/* ── schema ── */
export type CycleKey = "growth" | "inflation" | "monetary" | "fiscal" | "liquidity" | "positioning";
export type CycleScore = "TAILWIND" | "NEUTRAL" | "HEADWIND";
export type HorizonKey = "near" | "medium" | "long";
export type HorizonTone = "BULLISH" | "CONSTRUCTIVE" | "VOLATILE" | "BEARISH" | "NEUTRAL";
export type AssetKey = "stocks" | "bonds" | "gold" | "bitcoin" | "energy";
export type AssetBias = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "INACTIVE";
export type ReadSource = "live" | "brief";

export type HorizonRead = {
  key: HorizonKey;
  window: string; // "0–3M" | "3–12M" | "12M+"
  tone: HorizonTone;
  tag: string; // ≤ 4 words, e.g. "bullish with policy risk"
};

export type CycleRead = {
  key: CycleKey;
  label: string;
  score: CycleScore;
  note: string; // ≤ 3 words, e.g. "accelerating" / "QT tapering"
  source: ReadSource;
};

export type AssetRead = {
  key: AssetKey;
  label: string;
  bias: AssetBias;
  tag: string; // concise, e.g. "risk-on, correction risk"
};

export type MacroBrief = {
  asOf: string; // editorial brief date (ISO)
  regimeBase: MacroQuadrant;
  horizons: HorizonRead[];
  cycleScores: CycleRead[];
  riskFlags: string[];
  portfolioBias: AssetRead[];
};

/* ── editorial brief: per-quadrant defaults, dated ──
   Only the fields the live feed can't observe (monetary, fiscal,
   liquidity), plus horizon tags, flags and asset tags. Revisit when
   the commentary changes. */
const BRIEF_AS_OF = "2026-07-14";

type QuadrantBrief = {
  horizons: HorizonRead[];
  monetary: { score: CycleScore; note: string };
  fiscal: { score: CycleScore; note: string };
  liquidity: { score: CycleScore; note: string };
  riskFlags: string[];
  assets: Record<AssetKey, { bias: AssetBias; tag: string }>;
};

const H = (key: HorizonKey, window: string, tone: HorizonTone, tag: string): HorizonRead => ({
  key,
  window,
  tone,
  tag,
});

const QUADRANT_BRIEF: Record<Exclude<MacroQuadrant, "PENDING">, QuadrantBrief> = {
  GOLDILOCKS: {
    horizons: [
      H("near", "0–3M", "CONSTRUCTIVE", "constructive"),
      H("medium", "3–12M", "BULLISH", "bullish"),
      H("long", "12M+", "BULLISH", "bullish, policy risk"),
    ],
    monetary: { score: "TAILWIND", note: "easing bias" },
    fiscal: { score: "NEUTRAL", note: "steady impulse" },
    liquidity: { score: "TAILWIND", note: "expanding" },
    riskFlags: ["valuation stretch"],
    assets: {
      stocks: { bias: "RISK_ON", tag: "risk-on" },
      bonds: { bias: "NEUTRAL", tag: "carry, range-bound" },
      gold: { bias: "NEUTRAL", tag: "hold, no catalyst" },
      bitcoin: { bias: "RISK_ON", tag: "risk-on beta" },
      energy: { bias: "NEUTRAL", tag: "demand-led, capped" },
    },
  },
  REFLATION: {
    horizons: [
      H("near", "0–3M", "VOLATILE", "volatile"),
      H("medium", "3–12M", "BULLISH", "bullish"),
      H("long", "12M+", "BULLISH", "bullish, policy risk"),
    ],
    monetary: { score: "NEUTRAL", note: "on hold" },
    fiscal: { score: "TAILWIND", note: "expansive" },
    liquidity: { score: "TAILWIND", note: "expanding" },
    riskFlags: ["rate repricing", "hot inflation prints"],
    assets: {
      stocks: { bias: "RISK_ON", tag: "risk-on, correction risk" },
      bonds: { bias: "RISK_OFF", tag: "bearish" },
      gold: { bias: "INACTIVE", tag: "bullish 3–12M, inactive now" },
      bitcoin: { bias: "INACTIVE", tag: "bullish 3–12M, inactive now" },
      energy: { bias: "RISK_ON", tag: "cyclical bid" },
    },
  },
  INFLATION: {
    horizons: [
      H("near", "0–3M", "BEARISH", "defensive"),
      H("medium", "3–12M", "VOLATILE", "choppy"),
      H("long", "12M+", "NEUTRAL", "await pivot"),
    ],
    monetary: { score: "HEADWIND", note: "tightening" },
    fiscal: { score: "NEUTRAL", note: "constrained" },
    liquidity: { score: "HEADWIND", note: "draining" },
    riskFlags: ["policy error", "margin squeeze"],
    assets: {
      stocks: { bias: "RISK_OFF", tag: "defensive tilt" },
      bonds: { bias: "RISK_OFF", tag: "bearish" },
      gold: { bias: "RISK_ON", tag: "bullish hedge" },
      bitcoin: { bias: "NEUTRAL", tag: "mixed, macro-led" },
      energy: { bias: "RISK_ON", tag: "inflation beta" },
    },
  },
  DEFLATION: {
    horizons: [
      H("near", "0–3M", "BEARISH", "risk-off"),
      H("medium", "3–12M", "VOLATILE", "base-building"),
      H("long", "12M+", "CONSTRUCTIVE", "recovery setup"),
    ],
    monetary: { score: "TAILWIND", note: "cuts coming" },
    fiscal: { score: "NEUTRAL", note: "lagging" },
    liquidity: { score: "HEADWIND", note: "contracting" },
    riskFlags: ["credit stress", "earnings downgrades"],
    assets: {
      stocks: { bias: "RISK_OFF", tag: "bearish, quality only" },
      bonds: { bias: "RISK_ON", tag: "bullish duration" },
      gold: { bias: "RISK_ON", tag: "bullish haven" },
      bitcoin: { bias: "RISK_OFF", tag: "bearish, liquidity-led" },
      energy: { bias: "RISK_OFF", tag: "demand headwind" },
    },
  },
};

/* pending fallback — everything neutral, no directional calls */
const PENDING_BRIEF: MacroBrief = {
  asOf: BRIEF_AS_OF,
  regimeBase: "PENDING",
  horizons: [
    H("near", "0–3M", "NEUTRAL", "awaiting read"),
    H("medium", "3–12M", "NEUTRAL", "awaiting read"),
    H("long", "12M+", "NEUTRAL", "awaiting read"),
  ],
  cycleScores: (
    [
      ["growth", "Growth"],
      ["inflation", "Inflation"],
      ["monetary", "Monetary"],
      ["fiscal", "Fiscal"],
      ["liquidity", "Liquidity"],
      ["positioning", "Positioning"],
    ] as [CycleKey, string][]
  ).map(([key, label]) => ({ key, label, score: "NEUTRAL" as CycleScore, note: "pending", source: "brief" as ReadSource })),
  riskFlags: [],
  portfolioBias: (
    [
      ["stocks", "Stocks"],
      ["bonds", "Bonds"],
      ["gold", "Gold"],
      ["bitcoin", "Bitcoin"],
      ["energy", "Energy"],
    ] as [AssetKey, string][]
  ).map(([key, label]) => ({ key, label, bias: "NEUTRAL" as AssetBias, tag: "pending" })),
};

const ASSET_LABEL: Record<AssetKey, string> = {
  stocks: "Stocks",
  bonds: "Bonds",
  gold: "Gold",
  bitcoin: "Bitcoin",
  energy: "Energy / Cmdty",
};

/* ── derivation: live snapshot + editorial brief → MacroBrief ── */
export function deriveMacroBrief(snap: MacroSnapshot): MacroBrief {
  if (snap.status !== "live" || snap.quadrant === "PENDING") return PENDING_BRIEF;
  const q = snap.quadrant as Exclude<MacroQuadrant, "PENDING">;
  const brief = QUADRANT_BRIEF[q];

  /* growth cycle — live: accelerating growth is a tailwind */
  const growth: CycleRead = {
    key: "growth",
    label: "Growth",
    score: snap.growthMomentum === null ? "NEUTRAL" : snap.growthMomentum >= 0 ? "TAILWIND" : "HEADWIND",
    note: snap.growthMomentum === null ? "pending" : snap.growthMomentum >= 0 ? "accelerating" : "decelerating",
    source: "live",
  };

  /* inflation cycle — live: accelerating inflation is a headwind */
  const inflation: CycleRead = {
    key: "inflation",
    label: "Inflation",
    score: snap.inflationMomentum === null ? "NEUTRAL" : snap.inflationMomentum >= 0 ? "HEADWIND" : "TAILWIND",
    note: snap.inflationMomentum === null ? "pending" : snap.inflationMomentum >= 0 ? "accelerating" : "cooling",
    source: "live",
  };

  /* positioning — live CFTC read, contrarian: crowded long = headwind */
  const stance = snap.positioning?.stance ?? "PENDING";
  const positioning: CycleRead = {
    key: "positioning",
    label: "Positioning",
    score: stance === "CROWDED_LONG" ? "HEADWIND" : stance === "CROWDED_SHORT" ? "TAILWIND" : "NEUTRAL",
    note:
      stance === "CROWDED_LONG"
        ? "crowded long"
        : stance === "CROWDED_SHORT"
          ? "crowded short"
          : stance === "NEUTRAL"
            ? "balanced"
            : "pending",
    source: stance === "PENDING" ? "brief" : "live",
  };

  const cycleScores: CycleRead[] = [
    growth,
    inflation,
    { key: "monetary", label: "Monetary", ...brief.monetary, source: "brief" },
    { key: "fiscal", label: "Fiscal", ...brief.fiscal, source: "brief" },
    { key: "liquidity", label: "Liquidity", ...brief.liquidity, source: "brief" },
    positioning,
  ];

  const riskFlags = [...brief.riskFlags];
  if (snap.diverging) riskFlags.unshift("macro divergence");

  const portfolioBias: AssetRead[] = (Object.keys(ASSET_LABEL) as AssetKey[]).map((key) => ({
    key,
    label: ASSET_LABEL[key],
    ...brief.assets[key],
  }));

  return { asOf: BRIEF_AS_OF, regimeBase: q, horizons: brief.horizons, cycleScores, riskFlags, portfolioBias };
}

/* ── display helpers ── */
export const scoreLabel = (s: CycleScore): string =>
  s === "TAILWIND" ? "Tailwind" : s === "HEADWIND" ? "Headwind" : "Neutral";

export const scoreColor = (s: CycleScore): string =>
  s === "TAILWIND" ? BRIEF_GREEN : s === "HEADWIND" ? MACRO_PINK : "var(--ink-3)";

export const toneColor = (t: HorizonTone): string =>
  t === "BULLISH"
    ? BRIEF_GREEN
    : t === "CONSTRUCTIVE"
      ? MACRO_ACCENT
      : t === "VOLATILE"
        ? MACRO_AMBER
        : t === "BEARISH"
          ? MACRO_PINK
          : "var(--ink-3)";

export const biasColor = (b: AssetBias): string =>
  b === "RISK_ON" ? BRIEF_GREEN : b === "RISK_OFF" ? MACRO_PINK : b === "INACTIVE" ? MACRO_AMBER : "var(--ink-3)";

export const biasLabel = (b: AssetBias): string =>
  b === "RISK_ON" ? "Long" : b === "RISK_OFF" ? "Short / avoid" : b === "INACTIVE" ? "Wait" : "Neutral";

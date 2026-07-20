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
export type AssetBias = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "SELECTIVE" | "INACTIVE";
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
  /** Secondary tag on top of the base quadrant, e.g. "AI Capex Stress".
   *  Growth/inflation (the quadrant) stay driven only by IP/CPI ROC —
   *  this never changes the quadrant itself, only annotates it. */
  regimeTag: string | null;
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
      stocks: { bias: "RISK_ON", tag: "earnings-led upside" },
      bonds: { bias: "NEUTRAL", tag: "clip coupon, range-bound" },
      gold: { bias: "NEUTRAL", tag: "no catalyst, hold" },
      bitcoin: { bias: "RISK_ON", tag: "liquidity beta working" },
      energy: { bias: "NEUTRAL", tag: "demand-led, supply caps" },
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
      stocks: { bias: "RISK_ON", tag: "cyclicals lead, buy dips" },
      bonds: { bias: "RISK_OFF", tag: "yields repricing higher" },
      gold: { bias: "INACTIVE", tag: "bullish 3–12M, wait" },
      bitcoin: { bias: "INACTIVE", tag: "needs liquidity turn" },
      energy: { bias: "RISK_ON", tag: "demand upswing bid" },
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
      stocks: { bias: "RISK_OFF", tag: "favor pricing power" },
      bonds: { bias: "RISK_OFF", tag: "real yields bite" },
      gold: { bias: "RISK_ON", tag: "inflation hedge bid" },
      bitcoin: { bias: "NEUTRAL", tag: "rate-hostage, no edge" },
      energy: { bias: "RISK_ON", tag: "supply-tight, long" },
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
      stocks: { bias: "RISK_OFF", tag: "quality balance sheets only" },
      bonds: { bias: "RISK_ON", tag: "long duration, cuts ahead" },
      gold: { bias: "RISK_ON", tag: "haven bid, yields falling" },
      bitcoin: { bias: "RISK_OFF", tag: "liquidity drain hurts" },
      energy: { bias: "RISK_OFF", tag: "demand rollover, avoid" },
    },
  },
};

/* ── AI capex stress — editorial overlay, dated. Growth/inflation can
   keep accelerating (Reflation stays Reflation) while a narrower risk —
   deep drawdowns in AI platform names vs broader indices, disappointing
   capex ROI, "manufactured AI race / capex bubble" narrative stress —
   turns the crowded mega-cap/AI-capex slice of "stocks" negative even
   as cyclicals and real assets stay bid. No live feed for this (no free
   series for capex ROI or narrative stress), so — same as monetary/
   fiscal/liquidity above — it's a manually-set, dated flag. Flip
   `active` by hand when the read changes. Scoped to REFLATION only per
   spec; extend the `if` in deriveMacroBrief if it should apply more
   broadly later. */
const AI_CAPEX_STRESS = {
  active: true,
  asOf: "2026-07-21",
  flag: "AI capex stress",
};

const REFLATION_STOCKS_AI_STRESS: { bias: AssetBias; tag: string } = {
  bias: "SELECTIVE",
  tag: "favor cyclicals/real assets, avoid crowded AI capex leaders",
};

/* pending fallback — everything neutral, no directional calls */
const PENDING_BRIEF: MacroBrief = {
  asOf: BRIEF_AS_OF,
  regimeBase: "PENDING",
  regimeTag: null,
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
  const aiCapexStress = q === "REFLATION" && AI_CAPEX_STRESS.active;

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
  if (aiCapexStress) riskFlags.unshift(AI_CAPEX_STRESS.flag);
  if (snap.diverging) riskFlags.unshift("macro divergence");

  const portfolioBias: AssetRead[] = (Object.keys(ASSET_LABEL) as AssetKey[]).map((key) => {
    const read = aiCapexStress && key === "stocks" ? REFLATION_STOCKS_AI_STRESS : brief.assets[key];
    return { key, label: ASSET_LABEL[key], ...read };
  });

  return {
    asOf: BRIEF_AS_OF,
    regimeBase: q,
    regimeTag: aiCapexStress ? "AI Capex Stress" : null,
    horizons: brief.horizons,
    cycleScores,
    riskFlags,
    portfolioBias,
  };
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
  b === "RISK_ON"
    ? BRIEF_GREEN
    : b === "RISK_OFF"
      ? MACRO_PINK
      : b === "INACTIVE" || b === "SELECTIVE"
        ? MACRO_AMBER
        : "var(--ink-3)";

export const biasLabel = (b: AssetBias): string =>
  b === "RISK_ON"
    ? "Long"
    : b === "RISK_OFF"
      ? "Short / avoid"
      : b === "INACTIVE"
        ? "Wait"
        : b === "SELECTIVE"
          ? "Selective"
          : "Neutral";

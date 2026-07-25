"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 — the EDITORIAL half of the macro brief.

   Scope changed with the macro refresh (docs/regime-macro-refresh.md).
   This file used to derive the six cycles in the browser, with
   monetary/fiscal/liquidity hard-coded per quadrant. They are now
   computed server-side from real series (macro/cycles.ts) and arrive
   on the snapshot, so all of that is gone.

   What remains here is only what has NO free feed and therefore has to
   be a dated, hand-maintained read:
     · cost of capital per market vs its long-run mean
     · horizon outlook tags
     · risk flags
     · per-asset directional bias

   Everything in this file carries BRIEF_AS_OF and renders unmarked in
   the UI (live reads carry a dot), so a stale editorial read can never
   pass as a live one.
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
export type HorizonKey = "near" | "medium" | "long";
export type HorizonTone = "BULLISH" | "CONSTRUCTIVE" | "VOLATILE" | "BEARISH" | "NEUTRAL";
export type AssetKey = "stocks" | "bonds" | "gold" | "bitcoin" | "energy";
export type AssetBias = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "SELECTIVE" | "INACTIVE";

export type HorizonRead = {
  key: HorizonKey;
  window: string; // "0–3M" | "3–12M" | "12M+"
  tone: HorizonTone;
  tag: string; // ≤ 4 words
};

export type AssetRead = {
  key: AssetKey;
  label: string;
  bias: AssetBias;
  tag: string;
};

/** Cost of capital = benchmark equity earnings yield + nominal 10y
 *  sovereign yield. No free feed for the earnings-yield half, so this
 *  is Dale's published table, dated. */
export type CostOfCapitalRead = {
  market: string;
  current: number;
  longRunMean: number;
  /** current − long-run mean, pp. Negative = capital too cheap. */
  gap: number;
};

export type MacroBrief = {
  asOf: string;
  regimeBase: MacroQuadrant;
  regimeTag: string | null;
  horizons: HorizonRead[];
  riskFlags: string[];
  portfolioBias: AssetRead[];
  costOfCapital: CostOfCapitalRead[];
  costOfCapitalNote: string;
};

/* ── the dated editorial read ──
   Source: Darius Dale, 42 Macro — Macro Minute, 24 Jul 2026.
   Revisit when the commentary changes. */
const BRIEF_AS_OF = "2026-07-24";

/** Dale's cost-of-capital table, verbatim. Gap is computed, not
 *  transcribed, so the arithmetic can't drift from the inputs. */
const COST_OF_CAPITAL_RAW: [string, number, number][] = [
  ["United States", 4.13, 4.46],
  ["China", 4.49, 5.47],
  ["Eurozone", 4.31, 4.35],
  ["Switzerland", 2.55, 3.39],
  ["Japan", 3.83, 2.71],
  ["United Kingdom", 5.69, 5.03],
];

export const COST_OF_CAPITAL: CostOfCapitalRead[] = COST_OF_CAPITAL_RAW.map(
  ([market, current, longRunMean]) => ({
    market,
    current,
    longRunMean,
    gap: Math.round((current - longRunMean) * 100) / 100,
  }),
);

const COST_OF_CAPITAL_NOTE =
  "Equity earnings yield + nominal 10y sovereign yield vs long-run mean. Below the mean = capital priced too cheaply for a world of above-trend nominal GDP and scarce savings.";

type QuadrantBrief = {
  horizons: HorizonRead[];
  riskFlags: string[];
  assets: Record<AssetKey, { bias: AssetBias; tag: string }>;
};

const H = (key: HorizonKey, window: string, tone: HorizonTone, tag: string): HorizonRead => ({
  key, window, tone, tag,
});

const QUADRANT_BRIEF: Record<Exclude<MacroQuadrant, "PENDING">, QuadrantBrief> = {
  GOLDILOCKS: {
    horizons: [
      H("near", "0–3M", "CONSTRUCTIVE", "constructive"),
      H("medium", "3–12M", "BULLISH", "bullish"),
      H("long", "12M+", "BULLISH", "bullish, policy risk"),
    ],
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
      H("near", "0–3M", "VOLATILE", "correction risk"),
      H("medium", "3–12M", "BULLISH", "bullish"),
      H("long", "12M+", "BULLISH", "bullish, policy risk"),
    ],
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

/* ── AI capex stress — editorial overlay, dated. Growth and inflation
   can keep accelerating (Reflation stays Reflation) while a narrower
   risk — capital competition between the AI capex bubble and
   structurally wide fiscal deficits, per the 24 Jul read — turns the
   crowded mega-cap/AI slice of "stocks" negative even as cyclicals and
   real assets stay bid. No free feed for capex ROI or narrative
   stress, so it is a hand-set flag. Flip `active` when the read
   changes. */
const AI_CAPEX_STRESS = {
  active: true,
  asOf: "2026-07-24",
  flag: "AI capex vs fiscal deficits",
};

const REFLATION_STOCKS_AI_STRESS: { bias: AssetBias; tag: string } = {
  bias: "SELECTIVE",
  tag: "favor cyclicals/real assets, avoid crowded AI capex leaders",
};

const ASSET_LABEL: Record<AssetKey, string> = {
  stocks: "Stocks",
  bonds: "Bonds",
  gold: "Gold",
  bitcoin: "Bitcoin",
  energy: "Energy / Cmdty",
};

const PENDING_BRIEF: MacroBrief = {
  asOf: BRIEF_AS_OF,
  regimeBase: "PENDING",
  regimeTag: null,
  horizons: [
    H("near", "0–3M", "NEUTRAL", "awaiting read"),
    H("medium", "3–12M", "NEUTRAL", "awaiting read"),
    H("long", "12M+", "NEUTRAL", "awaiting read"),
  ],
  riskFlags: [],
  portfolioBias: (Object.keys(ASSET_LABEL) as AssetKey[]).map((key) => ({
    key, label: ASSET_LABEL[key], bias: "NEUTRAL" as AssetBias, tag: "pending",
  })),
  costOfCapital: COST_OF_CAPITAL,
  costOfCapitalNote: COST_OF_CAPITAL_NOTE,
};

/* ── derivation ──
   Risk flags now pick up the LIVE signals too: the risk-premium alert
   and a market/economy regime disagreement are both things the feed
   can observe, and both belong next to the editorial flags. */
export function deriveMacroBrief(snap: MacroSnapshot): MacroBrief {
  if (snap.status !== "live" || snap.quadrant === "PENDING") return PENDING_BRIEF;
  const q = snap.quadrant as Exclude<MacroQuadrant, "PENDING">;
  const brief = QUADRANT_BRIEF[q];
  const aiCapexStress = q === "REFLATION" && AI_CAPEX_STRESS.active;

  const riskFlags = [...brief.riskFlags];
  if (aiCapexStress) riskFlags.unshift(AI_CAPEX_STRESS.flag);
  // live flags go first — they outrank a dated editorial note
  if (snap.cyclesHeadwinds >= 4) {
    riskFlags.unshift(`${snap.cyclesHeadwinds}/6 cycles headwind`);
  }
  if (
    snap.marketRegime !== "PENDING" &&
    snap.marketRegime !== snap.quadrant
  ) {
    riskFlags.unshift("market/economy regime split");
  }
  if (snap.riskPremiumAlert) riskFlags.unshift("risk-premium repricing");

  const portfolioBias: AssetRead[] = (Object.keys(ASSET_LABEL) as AssetKey[]).map((key) => {
    const read = aiCapexStress && key === "stocks" ? REFLATION_STOCKS_AI_STRESS : brief.assets[key];
    return { key, label: ASSET_LABEL[key], ...read };
  });

  return {
    asOf: BRIEF_AS_OF,
    regimeBase: q,
    regimeTag: aiCapexStress ? "Cost of capital too low" : null,
    horizons: brief.horizons,
    riskFlags,
    portfolioBias,
    costOfCapital: COST_OF_CAPITAL,
    costOfCapitalNote: COST_OF_CAPITAL_NOTE,
  };
}

/* ── display helpers ── */
export const scoreLabel = (s: "TAILWIND" | "NEUTRAL" | "HEADWIND"): string =>
  s === "TAILWIND" ? "Tailwind" : s === "HEADWIND" ? "Headwind" : "Neutral";

export const scoreColor = (s: "TAILWIND" | "NEUTRAL" | "HEADWIND"): string =>
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

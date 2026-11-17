/* ────────────────────────────────────────────────────────────────
   Macro Weather — the newsletter's one-word market reading.

   A fixed, mechanical mapping from the US regime brief, so the
   reading is reproducible and can be scored over time. Inputs are
   the fields already on the macro snapshot; nothing new is fetched.

     SUNNY          economy and market agree, and ≥ 60% of the
                    30-market universe is risk-on
     PARTLY_CLOUDY  economy and market agree (any other risk-on share)
     RAIN           economy and market disagree
     STORM          they disagree AND liquidity stress ≥ 60/100

   stormWatch flags a RAIN or calmer reading when any single liquidity
   leg sits at or above its 95th percentile / top of scale — one leg
   that stretched is a warning, not yet a storm.

   PENDING when either regime is pending or missing: no reading is
   better than a guessed one.

   Pure: no IO, no clock.
──────────────────────────────────────────────────────────────── */

export type WeatherReading = "SUNNY" | "PARTLY_CLOUDY" | "RAIN" | "STORM" | "PENDING";

export interface WeatherInput {
  /** Economic GRID quadrant (macro snapshot `quadrant`). */
  economicRegime: string | null | undefined;
  /** Market-priced regime (macro snapshot `marketRegime`). */
  marketRegime: string | null | undefined;
  /** Share of the universe that is risk-on, 0..1 (`marketRiskOn`). */
  riskOnShare: number | null | undefined;
  /** Liquidity stress, 0..100 (`liquidityScore`). */
  liquidityScore: number | null | undefined;
  /** Liquidity legs with 0..1 normalized readings (`liquidityLegs`). */
  liquidityLegs?: Array<{ key: string; label?: string; normalized: number | null }> | null;
}

export interface WeatherResult {
  reading: WeatherReading;
  emoji: string;
  label: string;
  agree: boolean | null;
  stormWatch: boolean;
  /** Legs that triggered stormWatch, by label (or key). */
  stretchedLegs: string[];
  reasons: string[];
}

export const WEATHER_RULES = {
  sunnyRiskOnMin: 0.6,
  stormLiquidityMin: 60,
  stretchedLegMin: 0.95,
} as const;

const DISPLAY: Record<WeatherReading, { emoji: string; label: string }> = {
  SUNNY: { emoji: "☀️", label: "Sunny" },
  PARTLY_CLOUDY: { emoji: "⛅", label: "Partly cloudy" },
  RAIN: { emoji: "🌧️", label: "Rain" },
  STORM: { emoji: "⛈️", label: "Storm" },
  PENDING: { emoji: "·", label: "Pending" },
};

const isLive = (r: string | null | undefined): r is string =>
  typeof r === "string" && r.length > 0 && r !== "PENDING";

export function computeMacroWeather(input: WeatherInput): WeatherResult {
  const stretchedLegs = (input.liquidityLegs ?? [])
    .filter((l) => typeof l.normalized === "number" && l.normalized >= WEATHER_RULES.stretchedLegMin)
    .map((l) => l.label ?? l.key);
  const stormWatchBase = stretchedLegs.length > 0;

  if (!isLive(input.economicRegime) || !isLive(input.marketRegime)) {
    return {
      reading: "PENDING", ...DISPLAY.PENDING, agree: null,
      stormWatch: stormWatchBase, stretchedLegs,
      reasons: ["Economic or market regime is pending — no reading."],
    };
  }

  const agree = input.economicRegime === input.marketRegime;
  const reasons: string[] = [
    agree
      ? `Economy and market agree: ${input.economicRegime}.`
      : `Economy reads ${input.economicRegime}; market prices ${input.marketRegime}.`,
  ];

  let reading: WeatherReading;
  if (!agree) {
    const liq = input.liquidityScore;
    if (typeof liq === "number" && liq >= WEATHER_RULES.stormLiquidityMin) {
      reading = "STORM";
      reasons.push(`Liquidity stress ${liq}/100 ≥ ${WEATHER_RULES.stormLiquidityMin}.`);
    } else {
      reading = "RAIN";
    }
  } else {
    const ro = input.riskOnShare;
    if (typeof ro === "number" && ro >= WEATHER_RULES.sunnyRiskOnMin) {
      reading = "SUNNY";
      reasons.push(`Risk-on ${Math.round(ro * 100)}% ≥ ${WEATHER_RULES.sunnyRiskOnMin * 100}%.`);
    } else {
      reading = "PARTLY_CLOUDY";
    }
  }

  // A storm already says it; the watch flag only qualifies calmer readings.
  const stormWatch = reading !== "STORM" && stormWatchBase;
  if (stormWatch) reasons.push(`Storm watch: ${stretchedLegs.join(", ")} at/above the 95th percentile.`);

  return { reading, ...DISPLAY[reading], agree, stormWatch, stretchedLegs, reasons };
}

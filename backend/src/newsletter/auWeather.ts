/* ────────────────────────────────────────────────────────────────
   Australian macro weather for the weekly newsletter. Open data only.

   Three views, like the US weather:
     economy    Australia Pulse quadrant (leading growth × price pressure)
     consensus  RBA Statement on Monetary Policy, set by hand in Admin
                after each Statement (Feb, May, Aug, Nov)
     market     RBA trade-weighted AUD (F11.1), 3-month change of the
                monthly average: ≥ +1% risk-on, ≤ −1% risk-off

   Fixed rule, so every reading can be scored later:
     SUNNY          economy and consensus agree, AUD TWI risk-on
     PARTLY_CLOUDY  economy and consensus agree
     RAIN           they disagree
     STORM          they disagree and AUD TWI is down 3% or more
   stormWatch flags a calmer reading when AUD TWI is down 2% or more.
   PENDING when the Pulse can't place the economy or no consensus is set.

   Pure: no IO, no clock.
──────────────────────────────────────────────────────────────── */
import type { WeatherReading } from "../macro/weather";

export type Quadrant = "GOLDILOCKS" | "REFLATION" | "INFLATION" | "DEFLATION";
export type Axis = "up" | "down" | "mixed" | null;

export const AU_WEATHER_RULES = { riskOnMin: 1, riskOffMax: -1, stormWatchMax: -2, stormMax: -3, lookbackMonths: 3 } as const;

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  GOLDILOCKS: "Goldilocks", REFLATION: "Reflation", INFLATION: "Stagflation", DEFLATION: "Slowdown",
};

const DISPLAY: Record<WeatherReading, { emoji: string; label: string }> = {
  SUNNY: { emoji: "☀️", label: "Sunny" }, PARTLY_CLOUDY: { emoji: "⛅", label: "Partly cloudy" },
  RAIN: { emoji: "🌧️", label: "Rain" }, STORM: { emoji: "⛈️", label: "Storm" }, PENDING: { emoji: "·", label: "Pending" },
};

/** Pulse axes → quadrant. Mixed or missing axes give null. */
export function pulseQuadrant(growth: Axis, inflation: Axis): Quadrant | null {
  if ((growth !== "up" && growth !== "down") || (inflation !== "up" && inflation !== "down")) return null;
  if (growth === "up") return inflation === "up" ? "REFLATION" : "GOLDILOCKS";
  return inflation === "up" ? "INFLATION" : "DEFLATION";
}

/** % change of the latest monthly value against `lookbackMonths` earlier. Values oldest first. */
export function twiChange(series: { period: string; value: number }[], lookbackMonths: number = AU_WEATHER_RULES.lookbackMonths): { pct: number; from: string; to: string } | null {
  const s = series.filter((p) => Number.isFinite(p.value) && p.value > 0);
  if (s.length <= lookbackMonths) return null;
  const last = s[s.length - 1], then = s[s.length - 1 - lookbackMonths];
  return { pct: Math.round((last.value / then.value - 1) * 1000) / 10, from: then.period, to: last.period };
}

export interface AuWeatherInput {
  economy: Quadrant | null;
  consensus: Quadrant | null;
  twi: { pct: number; from: string; to: string } | null;
}

export interface AuWeather {
  reading: WeatherReading;
  emoji: string;
  label: string;
  agree: boolean | null;
  stormWatch: boolean;
  market: "risk-on" | "risk-off" | "neutral" | null;
  reasons: string[];
}

export function marketRead(twiPct: number | null | undefined): AuWeather["market"] {
  if (typeof twiPct !== "number") return null;
  return twiPct >= AU_WEATHER_RULES.riskOnMin ? "risk-on" : twiPct <= AU_WEATHER_RULES.riskOffMax ? "risk-off" : "neutral";
}

export function computeAustraliaWeather(input: AuWeatherInput): AuWeather {
  const market = marketRead(input.twi?.pct);
  const twiLine = input.twi ? `AUD trade-weighted index ${input.twi.pct > 0 ? "+" : ""}${input.twi.pct}% over three months (${market}).` : "AUD trade-weighted index not available.";
  if (!input.economy || !input.consensus) {
    return { reading: "PENDING", ...DISPLAY.PENDING, agree: null, stormWatch: false, market,
      reasons: [input.economy ? "No RBA consensus set." : "The Pulse can't place the economy yet (mixed or too few readings).", twiLine] };
  }
  const agree = input.economy === input.consensus;
  const pct = input.twi?.pct;
  let reading: WeatherReading;
  if (agree) reading = market === "risk-on" ? "SUNNY" : "PARTLY_CLOUDY";
  else reading = typeof pct === "number" && pct <= AU_WEATHER_RULES.stormMax ? "STORM" : "RAIN";
  const stormWatch = reading !== "STORM" && typeof pct === "number" && pct <= AU_WEATHER_RULES.stormWatchMax;
  const reasons = [
    agree
      ? `Economy and RBA agree: ${QUADRANT_LABEL[input.economy]}.`
      : `Economy reads ${QUADRANT_LABEL[input.economy]}; the RBA expects ${QUADRANT_LABEL[input.consensus]}.`,
    twiLine,
    ...(stormWatch ? ["Storm watch: the AUD has fallen 2% or more in three months."] : []),
  ];
  return { reading, ...DISPLAY[reading], agree, stormWatch, market, reasons };
}

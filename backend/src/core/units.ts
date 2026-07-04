/* ────────────────────────────────────────────────────────────────
   Unit + currency normalization → USD per barrel.
   Adapters call toUsdPerBarrel() and never do arithmetic themselves.
──────────────────────────────────────────────────────────────── */

import { CANONICAL_CURRENCY, CANONICAL_UNIT } from "./types";

export class NormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormalizationError";
  }
}

/** Volume conversion factors: how many of <unit> are in one barrel. */
const PER_BARREL: Record<string, number> = {
  bbl: 1,
  barrel: 1,
  gal: 42, // US gallons
  gallon: 42,
  l: 158.9873,
  litre: 158.9873,
  liter: 158.9873,
};

/**
 * Metric tonnes need a density assumption (varies by crude grade).
 * 7.33 bbl/t is the industry convention for "average" crude; pass an
 * explicit factor when the grade is known.
 */
export const DEFAULT_BBL_PER_TONNE = 7.33;

export interface RawPrice {
  price: number;
  /** e.g. "$/BBL", "USD per barrel", "usd/gal", "EUR/t", "US cents/gal" */
  unit: string;
  /** ISO currency code if known; parsed from unit otherwise. */
  currency?: string;
  /** Required if currency !== USD: units of USD per 1 unit of currency. */
  fxToUsd?: number;
  /** Override for tonne conversions. */
  bblPerTonne?: number;
}

interface ParsedUnit {
  currency: string;
  cents: boolean;
  volume: string; // key into PER_BARREL, or "t"
}

/** Parse loose unit strings like "$/BBL", "US cents per gallon", "EUR/t". */
export function parseUnit(unit: string): ParsedUnit {
  const u = unit.trim().toLowerCase().replace(/\s+per\s+/g, "/");
  const [moneyPartRaw, volPartRaw] = u.split("/");
  if (!volPartRaw) throw new NormalizationError(`unit "${unit}" has no denominator`);

  const moneyPart = moneyPartRaw.trim();
  const cents = /cent/.test(moneyPart);
  let currency = "USD";
  if (/\$|usd|us cent|cent/.test(moneyPart)) currency = "USD";
  else if (/€|eur/.test(moneyPart)) currency = "EUR";
  else if (/£|gbp|penc/.test(moneyPart)) currency = "GBP";
  else if (moneyPart.length === 3) currency = moneyPart.toUpperCase();
  else throw new NormalizationError(`unrecognized currency in unit "${unit}"`);

  const volPart = volPartRaw.trim().replace(/s$/, "");
  const volume =
    volPart in PER_BARREL ? volPart :
    volPart === "t" || volPart === "tonne" || volPart === "mt" ? "t" :
    volPart === "bbl." || volPart === "b" ? "bbl" :
    (() => { throw new NormalizationError(`unrecognized volume in unit "${unit}"`); })();

  return { currency, cents, volume };
}

/**
 * Sanity bounds for a normalized USD/bbl crude price.
 * Lower bound is NEGATIVE on purpose: WTI settled at −$37.63/bbl on
 * 2020-04-20. A `price > 0` check would have rejected real data.
 */
export const PRICE_BOUNDS = { min: -200, max: 2000 } as const;

export function assertSanePrice(p: number, context: string): void {
  if (!Number.isFinite(p)) throw new NormalizationError(`${context}: price is not finite (${p})`);
  if (p < PRICE_BOUNDS.min || p > PRICE_BOUNDS.max) {
    throw new NormalizationError(
      `${context}: price ${p} outside sanity bounds [${PRICE_BOUNDS.min}, ${PRICE_BOUNDS.max}] USD/bbl`,
    );
  }
}

/**
 * Normalize any raw price to USD per barrel.
 * Throws NormalizationError rather than guessing:
 * a missing FX rate or unknown unit must fail loudly at the adapter.
 */
export function toUsdPerBarrel(raw: RawPrice): {
  price: number;
  unit: typeof CANONICAL_UNIT;
  currency: typeof CANONICAL_CURRENCY;
} {
  if (!Number.isFinite(raw.price)) {
    throw new NormalizationError(`raw price is not finite: ${raw.price}`);
  }
  const parsed = parseUnit(raw.unit);
  const currency = (raw.currency ?? parsed.currency).toUpperCase();

  let perUnitUsd = raw.price;
  if (parsed.cents) perUnitUsd /= 100;

  if (currency !== "USD") {
    if (raw.fxToUsd === undefined || !Number.isFinite(raw.fxToUsd) || raw.fxToUsd <= 0) {
      throw new NormalizationError(
        `price in ${currency} requires a valid fxToUsd rate (got ${raw.fxToUsd})`,
      );
    }
    perUnitUsd *= raw.fxToUsd;
  }

  const perBbl =
    parsed.volume === "t"
      ? perUnitUsd / (raw.bblPerTonne ?? DEFAULT_BBL_PER_TONNE)
      : perUnitUsd * PER_BARREL[parsed.volume];

  const rounded = Math.round(perBbl * 10000) / 10000;
  assertSanePrice(rounded, `toUsdPerBarrel(${raw.price} ${raw.unit})`);
  return { price: rounded, unit: CANONICAL_UNIT, currency: CANONICAL_CURRENCY };
}

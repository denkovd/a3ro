/* ────────────────────────────────────────────────────────────────
   GENERATED — do not edit by hand.
   Regenerate: npm run backtest:affinity

   Committed EMPTY. Until the backtest is run, every symbol falls
   through to the hand-written REGIME_AFFINITY in vams.ts, which is the
   correct behaviour for a fresh checkout — the file exists so the
   import is static rather than a dynamic optional load.

   After a run this holds one entry per asset that cleared the sample
   floor, each preceded by the lift and month count behind it, so the
   numbers are reviewable in the diff.

   See macro/affinityBacktest.ts for the method and its known bias.
──────────────────────────────────────────────────────────────── */

import { MacroQuadrant } from "./types";

type Q = Exclude<MacroQuadrant, "PENDING">;

export const AFFINITY_GENERATED_AT: string | null = null;

export const REGIME_AFFINITY_DERIVED: Record<string, { bullish: Q[]; bearish: Q[] }> = {};

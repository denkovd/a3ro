/* ────────────────────────────────────────────────────────────────
   Public view of the macro snapshot (roadmap #58 / #18).

   The snapshot mixes open data (FRED) with market data from Yahoo
   Finance: per-asset returns behind the market-regime matrix, the
   global government bond ETF read, and the same-day VIX close. Until
   that data is licensed, logged-out visitors get the derived reads
   (regimes, states, 0..1 scores) but not the raw market numbers.
──────────────────────────────────────────────────────────────── */
import type { MacroSnapshotRow } from "../storage/macroRepo";

/** Liquidity legs whose raw value is market data. Their normalized 0..1 score stays. */
const MARKET_DATA_LEGS = new Set(["global_bonds", "equity_vol"]);

export function publicMacroSnapshot(row: MacroSnapshotRow): MacroSnapshotRow {
  return {
    ...row,
    globalBonds: null,
    liquidityLegs: (row.liquidityLegs ?? []).map((leg) =>
      leg.source === "yahoo" || MARKET_DATA_LEGS.has(leg.key) ? { ...leg, value: null } : leg),
    vamsReads: (row.vamsReads ?? []).map((read) => ({ ...read, z: null, return63: null, spotReturn63: null })),
  };
}

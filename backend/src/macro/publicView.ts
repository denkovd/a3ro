/* ────────────────────────────────────────────────────────────────
   Public view of the macro snapshot (roadmap #58 / #18).

   The snapshot mixes open data (FRED) with market data from Yahoo
   Finance: per-asset returns behind the market-regime matrix, the
   global government bond ETF read, and the same-day VIX close. Until
   that data is licensed, logged-out visitors get the derived reads
   (regimes, states, 0..1 scores) but not the raw market numbers.
──────────────────────────────────────────────────────────────── */
import type { MacroSnapshotRow } from "../storage/macroRepo";

/**
 * Legs whose raw value is licensed data. Their normalized 0..1 score stays.
 * - global_bonds: Yahoo Finance ETF return
 * - equity_vol: VIX level (Cboe; FRED VIXCLS is copyrighted, plus a same-day Yahoo close)
 * - credit_hy_oas: ICE BofA HY OAS (FRED BAMLH0A0HYM2 is ICE-copyrighted)
 */
const LICENSED_LEGS = new Set(["global_bonds", "equity_vol", "credit_hy_oas"]);
const strip = <T extends { key: string; value: number | null; source?: string }>(leg: T): T =>
  leg.source === "yahoo" || LICENSED_LEGS.has(leg.key) ? { ...leg, value: null } : leg;

export function publicMacroSnapshot(row: MacroSnapshotRow): MacroSnapshotRow {
  return {
    ...row,
    globalBonds: null,
    liquidityLegs: (row.liquidityLegs ?? []).map(strip),
    components: (row.components ?? []).map(strip),
    vamsReads: (row.vamsReads ?? []).map((read) => ({ ...read, z: null, return63: null, spotReturn63: null })),
  };
}

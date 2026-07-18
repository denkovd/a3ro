/* ────────────────────────────────────────────────────────────────
   Bull Market Finder (Module 5, P·05) — domain types.
   Shares the Money Line engine with Module 4 (regime/) untouched;
   these types cover what P·05 adds: tiers, adapter chains, stored
   bars (raw + back-adjusted), futures rolls, strength v2, RS, and
   verdict transitions.
──────────────────────────────────────────────────────────────── */

import { RegimeBar, RegimeSnapshot } from "../regime/types";

/** Universe tiers — the UI tabs. */
export type BullTier = "macro" | "us_large" | "ndx_extra" | "crypto" | "etf";

/** Adapter ids, in the order they may appear in a per-symbol chain. */
export type AdapterId = "yahoo" | "stooq" | "binance" | "alphavantage";

export interface BullUniverseEntry {
  /** Canonical symbol, Yahoo notation (BRK-B, GC=F, BTC-USD, ^GSPC). */
  symbol: string;
  displayName: string;
  tier: BullTier;
  /** Regime-style asset class, drives benchmarks + default chains. */
  assetClass:
    | "crypto" | "metals" | "energy" | "index"
    | "fx" | "rates" | "equity" | "ags" | "etf";
  /** Fallback order. First = primary. */
  adapters: AdapterId[];
  /** Set for continuous futures that get roll back-adjustment. */
  futures?: {
    /** Contract root, e.g. "CL", "GC". */
    root: string;
    /** Yahoo dated-contract suffix, e.g. ".NYM", ".CMX". */
    suffix: string;
    /** Active contract month codes (subset of FGHJKMNQUVXZ). */
    months: string;
  };
  /** Symbol translations for non-Yahoo adapters (e.g. stooq: brk-b.us). */
  altSymbols?: Partial<Record<AdapterId, string>>;
}

/* ── adapter layer ────────────────────────────────────────────── */

/**
 * Common adapter contract. Implementations normalize INTO
 * RegimeBar[] (oldest → newest); downstream never sees a native
 * payload. `range` is advisory — adapters map it onto their own
 * request vocabulary and may return more than asked.
 */
export interface BarSourceAdapter {
  readonly id: AdapterId;
  fetchDailyBars(symbol: string, range: BarRange): Promise<RegimeBar[]>;
}

export type BarRange = "5y" | "1mo";

/** Which adapter served a symbol on a run — the outage audit trail. */
export interface AdapterHealthEntry {
  runDate: string;
  symbol: string;
  adapterUsed: AdapterId | null; // null = every adapter in the chain failed
  fallbackReason: string | null; // why the primary was bypassed, if it was
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

/* ── futures rolls ────────────────────────────────────────────── */

export interface RollEvent {
  symbol: string;         // continuous symbol, e.g. CL=F
  rollDate: string;       // first date the continuous tracked the new contract
  oldContract: string;    // e.g. CLQ26.NYM
  newContract: string;    // e.g. CLU26.NYM
  /** newFrontClose − oldFrontClose on the roll date. Prior history is
   *  shifted by +gap so the series is continuous at the new level. */
  gap: number;
  /** Sum of all gaps applied so far, including this one. */
  cumAdjustment: number;
}

/** Result of the post-roll verification probe. */
export interface RollProbeResult {
  ok: boolean;
  checkedDate: string;
  rawClose: number;
  adjClose: number;
  expectedDelta: number;
  actualDelta: number;
  detail: string;
}

/* ── snapshots ────────────────────────────────────────────────── */

/**
 * P·05 snapshot = Module 4 snapshot + tier + strength v2 + RS.
 * Verdict enums are shared; the DISPLAY names differ:
 *   BULLISH         → "Double Confirmed"
 *   CONFLICT_DAILY  → "Conflicted Early Bullish"
 *   CONFLICT_WEEKLY → "Conflicted Lagging Bullish"
 */
export interface BullSnapshot extends RegimeSnapshot {
  tier: BullTier;
  /** 14-bar ATR as % of last close (daily, adjusted series). */
  atrPct: number | null;
  /** (cushion% + sinceFlip%) ÷ ATR% — volatility-normalized strength. */
  strengthVol: number | null;
  /** 63-bar % change minus benchmark's 63-bar % change (null when
   *  the asset class has no natural benchmark). */
  rs63: number | null;
  /** True when the engine ran on the back-adjusted series. */
  adjusted: boolean;
}

/** A verdict change between consecutive runs — the transitions feed.
 *  Diffed PER STRATEGY since the unified-module merge: a weekly-lens
 *  flip and a D×W verdict change are separate rows. */
export interface BullTransition {
  runDate: string;
  symbol: string;
  displayName: string;
  tier: BullTier;
  /** Lens the diff belongs to (strategies.ts). Optional at the type
   *  level for pre-merge callers; storage defaults it to 'ml-dw'. */
  strategy?: string;
  fromVerdict: string | null; // null = first ever scan of the symbol
  toVerdict: string;
}

export type { RegimeBar };

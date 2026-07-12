/* ────────────────────────────────────────────────────────────────
   Repository for portfolio_positions — the only module that writes
   SQL for the trader's book (P·07 Portfolio Risk Audit).

   Marking happens HERE (markPositions) because it is a storage
   concern: which store carries a live price for a symbol. Sources,
   in priority order, each labeled on the way out:
     1. latest_quotes            — WTI / BRENT resolved quotes
     2. bull_snapshots.last_close — the ~650-symbol daily scan
     3. manual_mark              — user-entered, labeled "manual"
     4. entry_price              — LAST resort, labeled entry_fallback
   The risk engine flags 3 as it sees fit and always flags 4 — a
   position is never silently priced (house truth rule).
──────────────────────────────────────────────────────────────── */

import { Queryable } from "./db";
import { MarkedPosition, PositionInput } from "../thesis/types";

export interface PositionWrite {
  symbol: string;
  displayName?: string | null;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  manualMark?: number | null;
  thesisId?: number | null;
  notes?: string | null;
  openedAt?: string | null;
}

const rowToPosition = (r: Record<string, unknown>): PositionInput => ({
  id: Number(r.id),
  symbol: String(r.symbol),
  displayName: r.display_name != null ? String(r.display_name) : null,
  side: r.side === "short" ? "short" : "long",
  quantity: Number(r.quantity),
  entryPrice: Number(r.entry_price),
  manualMark: r.manual_mark != null ? Number(r.manual_mark) : null,
  thesisId: r.thesis_id != null ? Number(r.thesis_id) : null,
  notes: r.notes != null ? String(r.notes) : null,
  openedAt: r.opened_at != null ? toDateStr(r.opened_at) : null,
});

export async function insertPosition(db: Queryable, p: PositionWrite): Promise<number> {
  const res = await db.query(
    `insert into portfolio_positions
       (symbol, display_name, side, quantity, entry_price, manual_mark, thesis_id, notes, opened_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      p.symbol.trim(),
      p.displayName ?? null,
      p.side,
      p.quantity,
      p.entryPrice,
      p.manualMark ?? null,
      p.thesisId ?? null,
      p.notes ?? null,
      p.openedAt ?? null,
    ],
  );
  return Number(res.rows[0]?.id);
}

export async function updatePosition(db: Queryable, id: number, p: Partial<PositionWrite>): Promise<number> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (p.symbol !== undefined) add("symbol", p.symbol.trim());
  if (p.displayName !== undefined) add("display_name", p.displayName);
  if (p.side !== undefined) add("side", p.side);
  if (p.quantity !== undefined) add("quantity", p.quantity);
  if (p.entryPrice !== undefined) add("entry_price", p.entryPrice);
  if (p.manualMark !== undefined) add("manual_mark", p.manualMark);
  if (p.thesisId !== undefined) add("thesis_id", p.thesisId);
  if (p.notes !== undefined) add("notes", p.notes);
  if (p.openedAt !== undefined) add("opened_at", p.openedAt);
  if (sets.length === 0) return 0;
  params.push(id);
  const res = await db.query(
    `update portfolio_positions set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`,
    params,
  );
  return res.rowCount ?? 0;
}

export async function deletePosition(db: Queryable, id: number): Promise<number> {
  const res = await db.query(`delete from portfolio_positions where id = $1`, [id]);
  return res.rowCount ?? 0;
}

export async function listPositions(db: Queryable): Promise<PositionInput[]> {
  const res = await db.query(`select * from portfolio_positions order by created_at asc`);
  return res.rows.map(rowToPosition);
}

/* ── marking ──────────────────────────────────────────────────── */

interface LiveMark {
  value: number;
  asOf: string;
  source: MarkedPosition["markSource"];
  atrPct: number | null;
  trendVerdict: string | null;
}

/** One pass over the live stores → symbol-keyed marks. */
async function liveMarks(db: Queryable, symbols: string[]): Promise<Map<string, LiveMark>> {
  const out = new Map<string, LiveMark>();
  const wanted = new Set(symbols);

  // latest_quotes (WTI/BRENT)
  try {
    const res = await db.query(`select benchmark, price, observed_at from latest_quotes`);
    for (const r of res.rows) {
      const sym = String(r.benchmark);
      if (!wanted.has(sym)) continue;
      out.set(sym, {
        value: Number(r.price),
        asOf: r.observed_at instanceof Date ? r.observed_at.toISOString().slice(0, 10) : String(r.observed_at).slice(0, 10),
        source: "latest_quotes",
        atrPct: null,
        trendVerdict: null,
      });
    }
  } catch { /* isolated — store may be empty */ }

  // bull_snapshots latest run (whole-market scan)
  try {
    const res = await db.query(
      `select symbol, last_close, last_close_date, atr_pct, verdict from bull_snapshots
        where run_date = (select max(run_date) from bull_snapshots) and symbol = any($1::text[])`,
      [symbols],
    );
    for (const r of res.rows) {
      const sym = String(r.symbol);
      const close = r.last_close != null ? Number(r.last_close) : null;
      const existing = out.get(sym);
      const atrPct = r.atr_pct != null ? Number(r.atr_pct) : null;
      const verdict = r.verdict != null ? String(r.verdict) : null;
      if (existing) {
        // keep the quote mark, enrich with scan vol/trend
        existing.atrPct = existing.atrPct ?? atrPct;
        existing.trendVerdict = existing.trendVerdict ?? verdict;
        continue;
      }
      if (close !== null && close > 0) {
        out.set(sym, {
          value: close,
          asOf: r.last_close_date != null ? toDateStr(r.last_close_date) : "",
          source: "bull_snapshots",
          atrPct,
          trendVerdict: verdict,
        });
      }
    }
  } catch { /* isolated */ }

  // regime_snapshots verdict enrich (macro-30 trend for e.g. CL=F/GC=F)
  try {
    const res = await db.query(
      `select symbol, verdict from regime_snapshots
        where run_date = (select max(run_date) from regime_snapshots) and symbol = any($1::text[])`,
      [symbols],
    );
    for (const r of res.rows) {
      const sym = String(r.symbol);
      const m = out.get(sym);
      if (m && m.trendVerdict === null) m.trendVerdict = String(r.verdict);
    }
  } catch { /* isolated */ }

  return out;
}

/** Positions + live marks → MarkedPosition[] (exposure, pnl, vol proxy).
 *  Every fallback is labeled; nothing is silently priced. */
export async function markPositions(db: Queryable, positions: PositionInput[]): Promise<MarkedPosition[]> {
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const marks = symbols.length > 0 ? await liveMarks(db, symbols) : new Map<string, LiveMark>();

  return positions.map((p) => {
    const live = marks.get(p.symbol) ?? null;
    let mark: number | null = null;
    let markSource: MarkedPosition["markSource"] = "none";
    let markAsOf: string | null = null;

    if (live) {
      mark = live.value;
      markSource = live.source;
      markAsOf = live.asOf || null;
    } else if (p.manualMark !== null && p.manualMark > 0) {
      mark = p.manualMark;
      markSource = "manual";
    } else if (p.entryPrice > 0) {
      mark = p.entryPrice;
      markSource = "entry_fallback";
    }

    const exposure = mark !== null ? Math.abs(p.quantity * mark) : null;
    const pnlPct =
      mark !== null && p.entryPrice > 0
        ? ((mark - p.entryPrice) / p.entryPrice) * 100 * (p.side === "short" ? -1 : 1)
        : null;

    const atrPct = live?.atrPct ?? null;
    return {
      ...p,
      mark,
      markSource,
      markAsOf,
      exposure: exposure !== null ? Math.round(exposure * 100) / 100 : null,
      weight: null, // the risk engine sets weights once gross is known
      pnlPct: pnlPct !== null ? Math.round(pnlPct * 100) / 100 : null,
      atrPct,
      trendVerdict: live?.trendVerdict ?? null,
      dailyVol: atrPct !== null ? atrPct / 100 : null,
      volSource: atrPct !== null ? "bull_snapshots.atr_pct" : "no ATR on file",
    };
  });
}

function toDateStr(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

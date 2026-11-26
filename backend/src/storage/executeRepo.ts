import { EXECUTE_ARM_HOURS, EXECUTE_STRATEGY_VERSION, type ExecuteEvent, type ExecuteEventKind, type ExecuteMode, type ExecuteRecord, type ExecuteSignal, type ExecuteStats, type ExecuteTrade, type ExecuteUpcoming } from "../execute/types";
import type { Queryable } from "./db";

// Reads for the Execute module. Tables are written only by execute-engine/ (GitHub Action).

const iso = (v: unknown): string => new Date(String(v)).toISOString();
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

function toEvent(row: Record<string, unknown>): ExecuteEvent {
  const eventTime = iso(row.event_time);
  return { id: Number(row.id), kind: row.kind as ExecuteEventKind, eventTime, armTime: new Date(Date.parse(eventTime) - EXECUTE_ARM_HOURS * 3_600_000).toISOString() };
}

/** Events from `fromHoursAgo` hours back to `aheadDays` ahead (calendar only — safe for the public peek). */
export async function listExecuteEvents(db: Queryable, now: Date, aheadDays: number, fromHoursAgo = 0): Promise<ExecuteEvent[]> {
  const { rows } = await db.query(
    `select id, kind, event_time from public.execute_events
     where event_time >= $1 and event_time <= $2 order by event_time`,
    [new Date(now.getTime() - fromHoursAgo * 3_600_000).toISOString(), new Date(now.getTime() + aheadDays * 86_400_000).toISOString()],
  );
  return rows.map(toEvent);
}

export async function listExecuteUpcoming(db: Queryable, now: Date): Promise<ExecuteUpcoming[]> {
  // Include events up to 100h back so an event whose trade is still running stays on the timeline.
  const events = await listExecuteEvents(db, now, 30, 100);
  if (!events.length) return [];
  const { rows } = await db.query(
    `select distinct on (event_id) event_id, snapshot_at, as_of_bar, state, btc_price, move_7d_pct, z, z_threshold, lean, checklist
     from public.execute_signals where event_id = any($1::bigint[]) and strategy_version = $2
     order by event_id, snapshot_at desc`,
    [events.map(e => e.id), EXECUTE_STRATEGY_VERSION],
  );
  const signals = new Map<number, ExecuteSignal>(rows.map(r => [Number(r.event_id), {
    eventId: Number(r.event_id), snapshotAt: iso(r.snapshot_at), asOfBar: iso(r.as_of_bar), state: r.state as ExecuteSignal["state"],
    btcPrice: num(r.btc_price), move7dPct: num(r.move_7d_pct), z: num(r.z), zThreshold: Number(r.z_threshold),
    lean: r.lean as ExecuteSignal["lean"], checklist: (r.checklist as ExecuteSignal["checklist"]) ?? null,
  }]));
  return events.map(e => ({ ...e, signal: signals.get(e.id) ?? null }));
}

function toTrade(r: Record<string, unknown>): ExecuteTrade {
  return {
    mode: r.mode as ExecuteMode, eventKind: r.event_kind as ExecuteEventKind, eventTime: iso(r.event_time), armedAt: iso(r.armed_at),
    side: r.side as ExecuteTrade["side"], riskPct: num(r.risk_pct), z: num(r.z), move7dPct: num(r.move_7d_pct),
    levels: (r.levels as ExecuteTrade["levels"]) ?? null, entries: (r.entries as ExecuteTrade["entries"]) ?? [], exits: (r.exits as ExecuteTrade["exits"]) ?? [],
    stop: num(r.stop), pnlPct: num(r.pnl_pct), status: r.status as ExecuteTrade["status"], skipReason: (r.skip_reason as string) ?? null,
    openedAt: isoOrNull(r.opened_at), closedAt: isoOrNull(r.closed_at),
  };
}

export async function getExecuteRecord(db: Queryable, mode: ExecuteMode): Promise<ExecuteRecord> {
  const [trades, stats] = await Promise.all([
    db.query(
      `select mode, event_kind, event_time, armed_at, side, risk_pct, z, move_7d_pct, levels, entries, exits, stop, pnl_pct, status, skip_reason, opened_at, closed_at
       from public.execute_trades where mode = $1 and strategy_version = $2 order by event_time desc`,
      [mode, EXECUTE_STRATEGY_VERSION],
    ),
    db.query(
      `select mode, as_of, trades, net_pct, profit_factor, win_rate, max_dd_pct, by_year, equity
       from public.execute_stats where mode = $1 and strategy_version = $2`,
      [mode, EXECUTE_STRATEGY_VERSION],
    ),
  ]);
  const s = stats.rows[0];
  const parsed: ExecuteStats | null = s ? {
    mode, asOf: iso(s.as_of), trades: Number(s.trades), netPct: num(s.net_pct), profitFactor: num(s.profit_factor), winRate: num(s.win_rate),
    maxDdPct: num(s.max_dd_pct), byYear: (s.by_year as ExecuteStats["byYear"]) ?? {}, equity: (s.equity as ExecuteStats["equity"]) ?? [],
  } : null;
  return { stats: parsed, trades: trades.rows.map(toTrade) };
}

export async function getExecuteLastRun(db: Queryable): Promise<{ lastRunAt: string | null; ok: boolean | null }> {
  const { rows } = await db.query(`select ran_at, ok from public.execute_runs order by ran_at desc limit 1`);
  return rows[0] ? { lastRunAt: iso(rows[0].ran_at), ok: Boolean(rows[0].ok) } : { lastRunAt: null, ok: null };
}

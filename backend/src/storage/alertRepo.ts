/* ────────────────────────────────────────────────────────────────
   Alert persistence: rules, latch state, fired events.
──────────────────────────────────────────────────────────────── */

import { Benchmark } from "../core/types";
import { AlertRule, AlertState } from "../alerts/rules";
import { Queryable } from "./db";

export interface AlertEvent {
  id: string;
  ruleId: string;
  firedAt: string; // ISO 8601
  payload: Record<string, unknown>;
}

export async function getEnabledRules(db: Queryable): Promise<AlertRule[]> {
  const res = await db.query(
    `select id, benchmark, type, params from alert_rules where enabled`,
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    benchmark: r.benchmark as Benchmark,
    type: r.type,
    params: (typeof r.params === "string" ? JSON.parse(r.params) : r.params) ?? {},
  })) as AlertRule[];
}

export async function getAlertState(db: Queryable, ruleId: string): Promise<AlertState> {
  const res = await db.query(
    `select status, last_value from alert_state where rule_id = $1`,
    [ruleId],
  );
  const r = res.rows[0];
  if (!r) return { status: "armed", lastValue: null };
  return {
    status: r.status as AlertState["status"],
    lastValue: r.last_value === null || r.last_value === undefined ? null : Number(r.last_value),
  };
}

export async function saveAlertState(
  db: Queryable,
  ruleId: string,
  state: AlertState,
  fired: boolean,
): Promise<void> {
  await db.query(
    `insert into alert_state (rule_id, status, last_value, last_fired_at, updated_at)
     values ($1, $2, $3, case when $4 then now() else null end, now())
     on conflict (rule_id) do update
       set status = excluded.status,
           last_value = excluded.last_value,
           last_fired_at = case when $4 then now() else alert_state.last_fired_at end,
           updated_at = now()`,
    [ruleId, state.status, state.lastValue, fired],
  );
}

export async function insertAlertEvent(
  db: Queryable,
  ruleId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into alert_events (rule_id, payload) values ($1, $2)`,
    [ruleId, JSON.stringify(payload)],
  );
}

export async function getUndeliveredAlertEvents(
  db: Queryable,
  limit = 50,
): Promise<AlertEvent[]> {
  const res = await db.query(
    `select id, rule_id, fired_at, payload from alert_events
     where delivered_at is null
     order by fired_at asc
     limit $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    ruleId: String(r.rule_id),
    firedAt: toIso(r.fired_at),
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload ?? {},
  }));
}

export async function markAlertEventDelivered(db: Queryable, id: string): Promise<void> {
  await db.query(
    `update alert_events set delivered_at = now() where id = $1`,
    [id],
  );
}

/** A fired event enriched with its rule's benchmark + type (for the UI). */
export interface AlertEventView {
  id: string;
  ruleId: string;
  firedAt: string; // ISO 8601
  delivered: boolean;
  benchmark: string | null;
  type: string | null;
  payload: Record<string, unknown>;
}

/** Recent fired events, newest first — the read model behind
 *  /api/oil/alerts (roadmap P8). Left-joins alert_rules so the UI can
 *  show the benchmark + rule type even for payloads that omit them
 *  (e.g. pct_move / stale_benchmark). Optionally filtered by benchmark. */
export async function getRecentAlertEvents(
  db: Queryable,
  opts: { limit?: number; benchmark?: string } = {},
): Promise<AlertEventView[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const params: unknown[] = [];
  let where = "";
  if (opts.benchmark) {
    params.push(opts.benchmark);
    where = `where r.benchmark = $${params.length}`;
  }
  params.push(limit);
  const res = await db.query(
    `select e.id, e.rule_id, e.fired_at, e.delivered_at, e.payload, r.benchmark, r.type
       from alert_events e
       left join alert_rules r on r.id = e.rule_id
       ${where}
       order by e.fired_at desc
       limit $${params.length}`,
    params,
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    ruleId: String(r.rule_id),
    firedAt: toIso(r.fired_at),
    delivered: r.delivered_at != null,
    benchmark: r.benchmark != null ? String(r.benchmark) : null,
    type: r.type != null ? String(r.type) : null,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : (r.payload ?? {}),
  }));
}

/**
 * Idempotent starter-rule seed (docs/RULES.md §4). Safe to call every
 * ingest cycle — only inserts missing rule ids.
 */
export async function ensureDefaultAlertRules(db: Queryable): Promise<number> {
  const res = await db.query(
    `insert into alert_rules (id, benchmark, type, params) values
       ('wti-above-100',     'WTI',   'level_cross',         '{"direction":"above","level":100}'::jsonb),
       ('wti-below-50',      'WTI',   'level_cross',         '{"direction":"below","level":50}'::jsonb),
       ('wti-daily-5pct',    'WTI',   'pct_move',            '{"basis":"daily_close","windowDays":1,"thresholdPct":5}'::jsonb),
       ('wti-stale-7d',      'WTI',   'stale_benchmark',     '{"maxAgeHours":168}'::jsonb),
       ('wti-src-disagree',  'WTI',   'source_disagreement', '{}'::jsonb),
       ('brent-above-100',   'BRENT', 'level_cross',         '{"direction":"above","level":100}'::jsonb),
       ('brent-below-50',    'BRENT', 'level_cross',         '{"direction":"below","level":50}'::jsonb),
       ('brent-daily-5pct',  'BRENT', 'pct_move',            '{"basis":"daily_close","windowDays":1,"thresholdPct":5}'::jsonb),
       ('brent-stale-7d',    'BRENT', 'stale_benchmark',     '{"maxAgeHours":168}'::jsonb),
       ('brent-src-disagree','BRENT','source_disagreement',  '{}'::jsonb)
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into alert_state (rule_id, status)
       select id, 'armed' from alert_rules
     on conflict (rule_id) do nothing`,
  );
  return res.rowCount ?? 0;
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

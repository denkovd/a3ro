/* ────────────────────────────────────────────────────────────────
   Alert persistence: rules, latch state, fired events.
──────────────────────────────────────────────────────────────── */

import { Benchmark } from "../core/types";
import { AlertRule, AlertState } from "../alerts/rules";
import { Queryable } from "./db";

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

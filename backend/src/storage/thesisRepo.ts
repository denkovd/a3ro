/* ────────────────────────────────────────────────────────────────
   Repository for theses — the only module that writes SQL for saved
   thesis analyses (P·07). The analyze route computes ThesisAnalysis +
   ScenarioSet and persists them together as one jsonb document; list
   reads return a light summary (no jsonb decode of the full body for
   the index view). Mirrors macroRepo's conventions.
──────────────────────────────────────────────────────────────── */

import { Queryable } from "./db";
import { ScenarioSet, ThesisAnalysis } from "../thesis/types";

export interface ThesisRow {
  id: number;
  title: string;
  body: string;
  direction: string | null;
  instrument: string | null;
  horizonDays: number | null;
  analysis: { analysis: ThesisAnalysis; scenarios: ScenarioSet };
  engineVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThesisSummary {
  id: number;
  title: string;
  direction: string | null;
  instrument: string | null;
  strength: number | null;
  verdict: string | null;
  createdAt: string;
}

export async function insertThesis(
  db: Queryable,
  input: {
    title: string;
    body: string;
    direction: string | null;
    instrument: string | null;
    horizonDays: number | null;
    analysis: ThesisAnalysis;
    scenarios: ScenarioSet;
    engineVersion: number;
  },
): Promise<number> {
  const res = await db.query(
    `insert into theses (title, body, direction, instrument, horizon_days, analysis, engine_version)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      input.title,
      input.body,
      input.direction,
      input.instrument,
      input.horizonDays,
      JSON.stringify({ analysis: input.analysis, scenarios: input.scenarios }),
      input.engineVersion,
    ],
  );
  return Number(res.rows[0]?.id);
}

export async function deleteThesis(db: Queryable, id: number): Promise<number> {
  const res = await db.query(`delete from theses where id = $1`, [id]);
  return res.rowCount ?? 0;
}

/** Light summaries, newest first. Strength/verdict are read from the
 *  stored analysis jsonb via Postgres path ops (no full decode). */
export async function listTheses(db: Queryable, limit = 50): Promise<ThesisSummary[]> {
  const res = await db.query(
    `select id, title, direction, instrument, created_at,
            (analysis #>> '{analysis,strength}') as strength,
            (analysis #>> '{analysis,verdict}') as verdict
       from theses
      order by created_at desc
      limit $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    direction: r.direction != null ? String(r.direction) : null,
    instrument: r.instrument != null ? String(r.instrument) : null,
    strength: r.strength != null ? Number(r.strength) : null,
    verdict: r.verdict != null ? String(r.verdict) : null,
    createdAt: toIso(r.created_at),
  }));
}

export async function getThesis(db: Queryable, id: number): Promise<ThesisRow | null> {
  const res = await db.query(`select * from theses where id = $1`, [id]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    title: String(r.title),
    body: String(r.body),
    direction: r.direction != null ? String(r.direction) : null,
    instrument: r.instrument != null ? String(r.instrument) : null,
    horizonDays: r.horizon_days != null ? Number(r.horizon_days) : null,
    analysis: typeof r.analysis === "string" ? JSON.parse(r.analysis) : (r.analysis as ThesisRow["analysis"]),
    engineVersion: Number(r.engine_version),
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

/** Strength/verdict/title for a set of thesis ids — the risk report's
 *  size-vs-conviction join. One query, id-keyed map out. */
export async function getThesisMeta(
  db: Queryable,
  ids: number[],
): Promise<Map<number, { strength: number; verdict: string; title: string }>> {
  const out = new Map<number, { strength: number; verdict: string; title: string }>();
  if (ids.length === 0) return out;
  const res = await db.query(
    `select id, title,
            (analysis #>> '{analysis,strength}') as strength,
            (analysis #>> '{analysis,verdict}') as verdict
       from theses where id = any($1::bigint[])`,
    [ids],
  );
  for (const r of res.rows) {
    const strength = r.strength != null ? Number(r.strength) : null;
    const verdict = r.verdict != null ? String(r.verdict) : null;
    if (strength !== null && verdict !== null) {
      out.set(Number(r.id), { strength, verdict, title: String(r.title) });
    }
  }
  return out;
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

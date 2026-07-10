/* ────────────────────────────────────────────────────────────────
   Repository layer for composite scores — sibling to regimeRepo /
   corridorRepo. The only module that writes SQL for score_snapshots.
   The score cycle (ingest/scorePipeline.ts) calls upsertScoreSnapshots;
   /api/oil/scores reads via getLatestScoreSnapshots (newest run_date
   PER score_id, so a score that failed on the latest run doesn't hide
   the others' last good reading).
──────────────────────────────────────────────────────────────── */

import { ScoreComponent, ScoreSnapshot, isScoreId } from "../core/scoreTypes";
import { Queryable } from "./db";

export async function upsertScoreSnapshots(
  db: Queryable,
  snapshots: ScoreSnapshot[],
): Promise<number> {
  let written = 0;
  for (const s of snapshots) {
    const res = await db.query(
      `insert into score_snapshots
         (run_date, score_id, score, status, label, headline, components,
          coverage_available, coverage_total, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       on conflict (run_date, score_id) do update set
         score = excluded.score,
         status = excluded.status,
         label = excluded.label,
         headline = excluded.headline,
         components = excluded.components,
         coverage_available = excluded.coverage_available,
         coverage_total = excluded.coverage_total,
         updated_at = now()`,
      [
        s.runDate,
        s.scoreId,
        s.score,
        s.status,
        s.label,
        s.headline,
        JSON.stringify(s.components),
        s.coverage.available,
        s.coverage.total,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

export async function getLatestScoreSnapshots(db: Queryable): Promise<ScoreSnapshot[]> {
  const res = await db.query(
    `select distinct on (score_id)
            run_date, score_id, score, status, label, headline, components,
            coverage_available, coverage_total
       from score_snapshots
      order by score_id, run_date desc`,
  );
  return res.rows.map(rowToSnapshot).filter((s): s is ScoreSnapshot => s !== null);
}

/* ── row mapping ──────────────────────────────────────────────── */

function toDateStr(v: unknown): string {
  // node-postgres parses `date` to a JS Date at LOCAL midnight; format
  // from local components so a UTC+ machine doesn't shift the day back
  // (same fix as priceRepo.ts's toDateStr).
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function toComponents(v: unknown): ScoreComponent[] {
  // jsonb comes back parsed from node-postgres; tolerate a string too.
  const arr = Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v) : [];
  return Array.isArray(arr) ? (arr as ScoreComponent[]) : [];
}

function rowToSnapshot(r: Record<string, unknown>): ScoreSnapshot | null {
  const id = String(r.score_id);
  if (!isScoreId(id)) return null; // stale id from a removed score — skip
  return {
    scoreId: id,
    runDate: toDateStr(r.run_date),
    score: r.score == null ? null : Number(r.score),
    status: String(r.status) as ScoreSnapshot["status"],
    label: String(r.label),
    headline: String(r.headline),
    components: toComponents(r.components),
    coverage: {
      available: Number(r.coverage_available ?? 0),
      total: Number(r.coverage_total ?? 0),
    },
  };
}

import { createHash } from "node:crypto";
import type { Queryable } from "./db";

export interface AppErrorInput { source: string; message: string; status?: number | null }
export interface AppErrorRow { source: string; message: string; status: number | null; firstSeen: string; lastSeen: string; count: number }

const MAX_MESSAGE = 500;

/** Strips credentials before anything is stored: connection strings, bearer tokens and key-like query params. */
export function redactErrorMessage(message: string): string {
  return message
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@[^\s]+/gi, "[redacted-url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:api[_-]?key|apikey|token|key|secret|password|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:sk|pk|eyJ)[A-Za-z0-9_-]{20,}\b/g, "[redacted-key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

/** Groups repeats of the same error: numbers of 4+ digits, ISO timestamps and UUIDs are treated as noise. */
export function errorFingerprint(message: string): string {
  const normalized = message
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<ts>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\d{4,}/g, "<n>");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export async function recordAppError(db: Queryable, input: AppErrorInput): Promise<void> {
  const message = redactErrorMessage(input.message) || "Unknown error";
  await db.query(
    `insert into app_errors (source, fingerprint, message, status) values ($1, $2, $3, $4)
     on conflict (source, fingerprint) do update set last_seen = now(), count = app_errors.count + 1,
       message = excluded.message, status = excluded.status`,
    [input.source.slice(0, 120), errorFingerprint(message), message, input.status ?? null],
  );
}

export async function getRecentAppErrors(db: Queryable, limit = 100): Promise<AppErrorRow[]> {
  const res = await db.query(`select source, message, status, first_seen, last_seen, count from app_errors order by last_seen desc limit $1`, [limit]);
  return res.rows.map((r) => ({
    source: String(r.source), message: String(r.message), status: r.status == null ? null : Number(r.status),
    firstSeen: new Date(String(r.first_seen)).toISOString(), lastSeen: new Date(String(r.last_seen)).toISOString(), count: Number(r.count),
  }));
}

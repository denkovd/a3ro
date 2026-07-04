/* ────────────────────────────────────────────────────────────────
   DB access. Everything downstream depends on the minimal Queryable
   interface, not on `pg` — so the repo layer is testable with a stub
   and the driver is swappable (node-postgres, Neon serverless, …).
──────────────────────────────────────────────────────────────── */

export interface QueryResultLike {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
}

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResultLike>;
}

/**
 * Default wiring: node-postgres pool from DATABASE_URL.
 * (Vercel + Neon: use the pooled connection string.)
 *
 * RUNTIME CONSTRAINT: `pg` needs raw TCP → Node.js runtime only.
 * Any Vercel route/cron handler importing this must declare
 * `export const runtime = "nodejs"`. For Edge, replace this factory
 * with Neon's `@neondatabase/serverless` driver (same Queryable
 * shape; `@vercel/postgres` is deprecated — avoid).
 */
export async function createDb(connectionString = process.env.DATABASE_URL): Promise<Queryable> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (see backend/.env.example)");
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 5 });
  return pool;
}

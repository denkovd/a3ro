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
  // Memoize pools per connection string on globalThis: every API route
  // calls createDb() per request, and without this each warm serverless
  // invocation would stack fresh pools against the PG pooler (connection
  // churn + eventual exhaustion). Survives module re-evaluation in dev.
  const g = globalThis as typeof globalThis & { __a3roPgPools?: Map<string, Queryable> };
  g.__a3roPgPools ??= new Map();
  const existing = g.__a3roPgPools.get(connectionString);
  if (existing) return existing;
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 5 });
  g.__a3roPgPools.set(connectionString, pool);
  return pool;
}

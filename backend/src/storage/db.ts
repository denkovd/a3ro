import { pgConnectionConfig } from "./pgConfig";

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
  // Prefer IPv4: GitHub-hosted runners often cannot route to the
  // Supabase AAAA record (ENETUNREACH). Harmless on Vercel/local.
  const { setDefaultResultOrder } = await import("node:dns");
  setDefaultResultOrder("ipv4first");
  const { Pool } = await import("pg");
  const pool = new Pool({ ...pgConnectionConfig(connectionString), max: 5 });
  g.__a3roPgPools.set(connectionString, pool);
  return pool;
}

/**
 * A Postgres `date` value as YYYY-MM-DD. node-postgres turns a `date` column into a JS Date at
 * LOCAL midnight, so toISOString() moves it back a day on any machine east of UTC (a local run
 * in Sydney read every stored bar one day early, roadmap #104). Local components give the stored
 * date everywhere; on UTC machines (Vercel, GitHub Actions) the result is unchanged.
 */
export function dateOnly(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return String(v).slice(0, 10);
}

/* ────────────────────────────────────────────────────────────────
   Cross-platform migration runner — replaces `psql "$DATABASE_URL"
   -f migrations/*.sql` for machines without psql on PATH (e.g.
   Windows). Reads DATABASE_URL from the environment, or falls back
   to the repo-root .env.local (same file `next dev` reads), and
   runs the given migration file as a single simple-query batch
   (pg supports multi-statement strings this way, same as psql -f).

   Usage:  cd backend && npx tsx scripts/migrate.ts migrations/009_macro.sql
──────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDatabaseUrl } from "./loadEnv";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/migrate.ts <path-to-migration.sql>");
    process.exit(1);
  }
  const sqlPath = resolve(process.cwd(), arg);
  const sql = readFileSync(sqlPath, "utf8");

  ensureDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set and not found in ../.env.local — set it in the environment or pass it explicitly.",
    );
  }
  // Dynamic import (matches storage/db.ts's convention) rather than a
  // static `import pg from "pg"` default import: @types/pg 8.20 has no
  // `export =`/default export, so under this project's
  // moduleResolution:"bundler" tsconfig a static default import types as
  // the bare module namespace and loses the `Client` member — a
  // pre-existing, earnings-unrelated typecheck break fixed in passing
  // because it blocked `npm run typecheck` for the whole workspace.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log(`Running ${arg} ...`);
    await client.query(sql);
    console.log("OK — migration applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});

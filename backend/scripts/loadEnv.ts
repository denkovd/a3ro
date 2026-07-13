/* ────────────────────────────────────────────────────────────────
   Shared helper for standalone scripts (migrate.ts, run-macro.ts, …):
   if DATABASE_URL isn't already in the environment, pull it from the
   repo-root .env.local (the same file `vercel env pull` writes and
   `next dev` reads). Windows PowerShell has no `DATABASE_URL=... npx
   tsx ...` inline-env idiom, so scripts can't rely on the shell to
   supply it — this makes `npx tsx scripts/foo.ts` just work.
──────────────────────────────────────────────────────────────── */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;

  const envPath = resolve(here, "../../.env.local");
  if (!existsSync(envPath)) return; // let createDb() throw its own error

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env.DATABASE_URL = v;
      return;
    }
  }
}

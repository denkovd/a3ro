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

/** Reads a single `NAME=value` line out of the repo-root .env.local and
 *  sets it on process.env if not already present. Generic version of the
 *  DATABASE_URL lookup below, for other server-only keys (e.g. GOLDAPI_KEY). */
export function ensureEnvVar(name: string): void {
  if (process.env[name]) return;

  const envPath = resolve(here, "../../.env.local");
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[name] = v;
      return;
    }
  }
}

export function ensureDatabaseUrl(): void {
  ensureEnvVar("DATABASE_URL");
}

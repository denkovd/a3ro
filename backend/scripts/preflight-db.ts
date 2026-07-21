/* ────────────────────────────────────────────────────────────────
   GitHub Actions preflight: validate DATABASE_URL without leaking
   credentials. Catches the classic mis-paste that yields hostname
   "base" (or any non-Supabase host) before the 700-symbol scan burns
   minutes failing every query.
──────────────────────────────────────────────────────────────── */

import pg from "pg";

function main(): void {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) {
    console.error(
      "::error::DATABASE_URL is not set — add the pooled Supabase URI under Settings → Secrets and variables → Actions.",
    );
    process.exit(1);
  }

  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    console.error(
      "::error::DATABASE_URL is not a valid URL (check quotes/newlines in the repo secret).",
    );
    process.exit(1);
  }

  if (!host || host === "base" || host.length < 4) {
    console.error(
      `::error::DATABASE_URL hostname looks wrong: "${host}". Re-set the secret to the full Supabase *pooled* URI (host like *.pooler.supabase.com).`,
    );
    process.exit(1);
  }

  console.log("DATABASE_URL host ok:", host);

  const pool = new pg.Pool({
    connectionString: raw,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  pool
    .query("select 1 as ok")
    .then((r) => {
      console.log("DATABASE_URL connect ok:", r.rows[0]);
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch(async (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("::error::DATABASE_URL present but connection failed:", msg);
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}

main();

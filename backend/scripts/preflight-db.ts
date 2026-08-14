/* ────────────────────────────────────────────────────────────────
   GitHub Actions preflight: validate DATABASE_URL without leaking
   credentials. Catches the classic mis-paste that yields hostname
   "base" (or the IPv6-only direct db.*.supabase.co host) before the
   700-symbol scan burns minutes failing every query.

   GitHub-hosted runners cannot reach Supabase's IPv6-only direct
   connection (ENETUNREACH on 2406:…). Use the Transaction pooler
   URI (*.pooler.supabase.com:6543) and prefer IPv4.
──────────────────────────────────────────────────────────────── */

import { lookup } from "node:dns/promises";
import { setDefaultResultOrder } from "node:dns";
import pg from "pg";

// GHA ubuntu-latest often has broken IPv6 routing. Prefer A records
// so the pooler (dual-stack) connects over IPv4 instead of ENETUNREACH.
setDefaultResultOrder("ipv4first");

const POOLER_HINT =
  "Re-set the GitHub secret DATABASE_URL to the Supabase *Transaction pooler* URI (Connect → ORMs → Transaction pooler). Host must be *.pooler.supabase.com and port 6543 — not db.*.supabase.co:5432.";

async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) {
    console.error(
      "::error::DATABASE_URL is not set — add the pooled Supabase URI under Settings → Secrets and variables → Actions.",
    );
    process.exit(1);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(
      "::error::DATABASE_URL is not a valid URL (check quotes/newlines in the repo secret).",
    );
    process.exit(1);
  }

  const host = parsed.hostname;
  const port = parsed.port || "5432";

  if (!host || host === "base" || host.length < 4) {
    console.error(
      `::error::DATABASE_URL hostname looks wrong: "${host}". ${POOLER_HINT}`,
    );
    process.exit(1);
  }

  // Direct connections on newer Supabase projects are IPv6-only.
  // GitHub Actions cannot route to them — fail before the TCP attempt.
  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    console.error(
      `::error::DATABASE_URL is the IPv6-only *direct* host (${host}:${port}). ${POOLER_HINT}`,
    );
    process.exit(1);
  }

  if (!host.includes("pooler.supabase.com")) {
    console.error(
      `::error::DATABASE_URL host "${host}" is not the Supabase pooler. ${POOLER_HINT}`,
    );
    process.exit(1);
  }

  console.log("DATABASE_URL host ok:", `${host}:${port}`);

  try {
    const v4 = await lookup(host, { family: 4 });
    console.log("DATABASE_URL IPv4:", v4.address);
  } catch {
    console.error(
      `::error::Host ${host} has no IPv4 address. ${POOLER_HINT}`,
    );
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: raw,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  try {
    const r = await pool.query("select 1 as ok");
    console.log("DATABASE_URL connect ok:", r.rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENETUNREACH|EHOSTUNREACH/i.test(msg) && /:/.test(msg)) {
      console.error(
        `::error::DATABASE_URL present but IPv6 path is unreachable (${msg}). ${POOLER_HINT}`,
      );
    } else {
      console.error("::error::DATABASE_URL present but connection failed:", msg);
    }
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }
}

main();

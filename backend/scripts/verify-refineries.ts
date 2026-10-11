import { ensureDatabaseUrl } from "./loadEnv";
import { Client } from "pg";
ensureDatabaseUrl();
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const rows = await client.query(`select c.relname,c.relrowsecurity,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_access,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_access
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('oil_refinery_events','oil_refinery_source_checks')`);
  if (rows.rows.length !== 2 || rows.rows.some(r => !r.relrowsecurity || r.anon_access || r.authenticated_access)) throw new Error("Refinery evidence access checks failed");
  for (const role of ["anon","authenticated"]) {
    await client.query("begin");
    try {
      await client.query(`set local role ${role}`);
      let denied = false;
      try { await client.query("select * from public.oil_refinery_events limit 1"); }
      catch (e) { denied = (e as { code: string }).code === "42501"; }
      if (!denied) throw new Error(`${role} unexpectedly has direct event access`);
    } finally { await client.query("rollback"); }
  }
  const count = await client.query("select count(*)::int events,count(distinct refinery_id)::int facilities from public.oil_refinery_events");
  console.log(JSON.stringify({ accessChecks: "passed", data: count.rows[0] }));
} finally { await client.end(); }

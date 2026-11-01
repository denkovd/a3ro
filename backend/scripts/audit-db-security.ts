/** Read-only catalog audit. Never prints credentials or application row data. */
import { setDefaultResultOrder } from "node:dns";
import { Client } from "pg";
import { ensureDatabaseUrl } from "./loadEnv";
import { pgConnectionConfig } from "../src/storage/pgConfig";

ensureDatabaseUrl();
setDefaultResultOrder("ipv4first");

async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not configured");
  const configured = new Client(pgConnectionConfig(raw));
  const ssl = (configured as unknown as { connectionParameters: { ssl: boolean | { rejectUnauthorized?: boolean } } }).connectionParameters.ssl;
  console.log(JSON.stringify({ configuredTransport: { tls: Boolean(ssl), verifiesCertificate: Boolean(ssl) && (typeof ssl !== "object" || ssl.rejectUnauthorized !== false) } }));

  const client = new Client({ ...pgConnectionConfig(raw), query_timeout: 15_000 });
  await client.connect();
  try {
    await client.query("begin read only");
    const identity = await client.query(`select current_user as role, r.rolsuper as superuser,
      r.rolbypassrls as bypass_rls, s.ssl as postgres_hop_encrypted, s.version as postgres_hop_tls_version
      from pg_roles r left join pg_stat_ssl s on s.pid = pg_backend_pid()
      where r.rolname = current_user`);
    const tables = await client.query(`select n.nspname as schema, c.relname as relation,
      c.relkind as kind, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
      c.reloptions as options, pg_get_userbyid(c.relowner) as owner,
      r.rolname as client_role,
      has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
      has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert,
      has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
      has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete,
      has_table_privilege(r.oid, c.oid, 'TRUNCATE') as can_truncate
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join pg_roles r
      where n.nspname = 'public' and c.relkind in ('r','p','v','m')
        and r.rolname in ('anon','authenticated') order by c.relname, r.rolname`);
    const policies = await client.query(`select schemaname, tablename, policyname, roles, cmd,
      qual, with_check from pg_policies where schemaname = 'public'
      order by tablename, policyname`);
    const functions = await client.query(`select p.proname as function, p.prosecdef as security_definer,
      p.proconfig as settings, r.rolname as client_role,
      has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join pg_roles r
      where n.nspname = 'public' and r.rolname in ('anon','authenticated')
      and p.prosecdef order by p.proname, r.rolname`);
    const defaults = await client.query(`select pg_get_userbyid(d.defaclrole) as owner,
      n.nspname as schema, d.defaclobjtype as kind, d.defaclacl::text as privileges
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = 'public' or d.defaclnamespace = 0`);
    const exposed = tables.rows.filter((row) => !row.rls_enabled && row.kind !== "v" &&
      (row.can_select || row.can_insert || row.can_update || row.can_delete));
    const clientWriteGrants = tables.rows.filter((row) =>
      row.can_insert || row.can_update || row.can_delete || row.can_truncate);
    const unexpectedReadGrants = tables.rows.filter((row) => row.can_select &&
      !["watchlist", "earnings_surprises"].includes(row.relation));
    console.log(JSON.stringify({ identity: identity.rows, tableCount: tables.rows.length / 2,
      exposedTables: exposed, clientWriteGrants, unexpectedReadGrants, policies: policies.rows,
      securityDefinerFunctions: functions.rows, defaultPrivileges: defaults.rows }, null, 2));
    await client.query("rollback");
    if (exposed.length || clientWriteGrants.length || unexpectedReadGrants.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Only a code is emitted: arbitrary driver messages can contain connection details.
  console.error("Database security audit failed", (error as { code?: string }).code ?? "connection-or-query-error");
  process.exitCode = 1;
});

/** Transactional remediation. Default is a rollback-only rehearsal. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { ensureDatabaseUrl } from "./loadEnv";
import { pgConnectionConfig } from "../src/storage/pgConfig";

const migration = new URL("../../supabase/migrations/20261029072536_restrict_public_data_api_access.sql", import.meta.url);
const rollbackFile = new URL("../../docs/security-db-rollback-2026-10-29.sql", import.meta.url);
const apply = process.argv.includes("--apply");
ensureDatabaseUrl();

async function main() {
  const client = new Client(pgConnectionConfig());
  await client.connect();
  try {
    await client.query("begin; set local lock_timeout = '5s'; set local statement_timeout = '30s'");
    const identity = await client.query("select current_user as role");
    if (identity.rows[0].role !== "postgres") throw new Error("Unexpected migration role");
    // Capture only ACL/RLS metadata, never credentials or application rows.
    const restoreObjects = await client.query(`
      select format('revoke all privileges on %s public.%I from anon, authenticated, public;',
        case when c.relkind = 'S' then 'sequence' else 'table' end, c.relname) as sql
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relowner = current_user::regrole
        and c.relkind in ('r','p','v','m','S')
      union all
      select format('alter table public.%I %s row level security;', c.relname,
        case when c.relrowsecurity then 'enable' else 'disable' end)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relowner = current_user::regrole and c.relkind in ('r','p')`);
    const restoreGrants = await client.query(`
      select format('grant %s on %s public.%I to %s%s;', a.privilege_type,
        case when c.relkind = 'S' then 'sequence' else 'table' end, c.relname,
        case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
        case when a.is_grantable then ' with grant option' else '' end) as sql
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relowner = current_user::regrole
        and c.relkind in ('r','p','v','m','S')
        and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))`);
    const restoreDefaults = await client.query(`
      select format('alter default privileges for role postgres in schema public grant %s on %s to %s%s;',
        a.privilege_type, case when d.defaclobjtype = 'S' then 'sequences' else 'tables' end,
        case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
        case when a.is_grantable then ' with grant option' else '' end) as sql
      from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      where n.nspname = 'public' and d.defaclrole = current_user::regrole
        and d.defaclobjtype in ('r','S')
        and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))`);
    await client.query(readFileSync(migration, "utf8"));
    const violations = await client.query(`
      select c.relname, r.rolname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace cross join pg_roles r
      where n.nspname = 'public' and c.relkind in ('r','p','v','m')
        and r.rolname in ('anon','authenticated') and (
          (c.relkind in ('r','p') and not c.relrowsecurity) or
          has_table_privilege(r.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or
          (c.relname not in ('watchlist','earnings_surprises') and has_table_privilege(r.oid,c.oid,'SELECT'))
        )`);
    if (violations.rows.length) throw new Error("Post-migration access assertions failed");
    // Validate server access without reading or changing application records.
    const serverTables = await client.query(`select format('select 1 from public.%I limit 0', c.relname) as sql
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p') and c.relowner = current_user::regrole`);
    for (const row of serverTables.rows) await client.query(row.sql);
    for (const role of ["anon", "authenticated"]) {
      await client.query("savepoint role_probe");
      await client.query(`set local role ${role}`);
      let denied = false;
      try { await client.query("select 1 from public.portfolio_positions limit 0"); }
      catch (error) { denied = (error as { code?: string }).code === "42501"; }
      await client.query("rollback to savepoint role_probe; release savepoint role_probe");
      if (!denied) throw new Error("Sensitive table access was not denied");
    }
    if (apply) {
      const rollback = [
        "-- Emergency rollback restores the PREVIOUS INSECURE permissions. Review before use.",
        "begin;", "set local lock_timeout = '5s';",
        ...restoreObjects.rows.map((r) => r.sql), ...restoreGrants.rows.map((r) => r.sql),
        "alter default privileges for role postgres in schema public revoke all privileges on tables from anon, authenticated, public;",
        "alter default privileges for role postgres in schema public revoke all privileges on sequences from anon, authenticated, public;",
        ...restoreDefaults.rows.map((r) => r.sql), "commit;", "",
      ].join("\n");
      writeFileSync(rollbackFile, rollback, { flag: "wx" });
      await client.query("commit");
    } else {
      await client.query("rollback");
    }
    console.log(JSON.stringify({ applied: apply, serverTablesVerified: serverTables.rows.length,
      deniedRolesVerified: 2, accessViolations: 0,
      rollbackFile: apply ? fileURLToPath(rollbackFile) : null }));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error: unknown) => {
  console.error("Database hardening failed; transaction rolled back", (error as { code?: string }).code ?? "validation-error");
  process.exitCode = 1;
});

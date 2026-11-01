-- A3RO uses server-side PostgreSQL connections for all reads and writes.
-- Retain only the two intentionally public earnings/watchlist SELECT APIs.
-- No data is changed. Apply in a transaction; see harden-db-security.ts.
do $$
declare item record;
begin
  for item in
    select c.relname, c.relkind from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relowner = current_user::regrole
      and c.relkind in ('r', 'p', 'v', 'm', 'S')
  loop
    if item.relkind = 'S' then
      execute format('revoke all privileges on sequence public.%I from anon, authenticated, public', item.relname);
    else
      execute format('revoke all privileges on table public.%I from anon, authenticated, public', item.relname);
      if item.relkind in ('r', 'p') then
        execute format('alter table public.%I enable row level security', item.relname);
      end if;
    end if;
  end loop;
end $$;

grant select on public.watchlist, public.earnings_surprises to anon, authenticated;
-- pipeline_runs includes internal provider errors; expose only its derived
-- timestamp through the existing server API, not direct anonymous row access.

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated, public;

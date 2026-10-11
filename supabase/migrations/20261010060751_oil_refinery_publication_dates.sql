-- Operator location pages can confirm an event month without a publication date.
begin;
alter table public.oil_refinery_events alter column published_at drop not null;
update public.oil_refinery_events
set published_at = null, payload = jsonb_set(payload, '{publishedAt}', 'null'::jsonb)
where id in ('grangemouth:closure:2025-04', 'benicia-idled-2026');
commit;

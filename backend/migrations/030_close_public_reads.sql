-- ────────────────────────────────────────────────────────────────
-- Close direct public reads (roadmap #92, 26 Nov 2026).
--   014_earnings_v2 gave anon/authenticated a SELECT policy on
--   watchlist, earnings_surprises and pipeline_runs. The app reads
--   these only on the server (pg, service connection), so the policies
--   just let anyone holding the browser's publishable key read the
--   Premium Earnings Beat data (Finnhub, personal-use licence) straight
--   from the Supabase API, around the Premium gate. RLS stays on with
--   no policies, like every other table.
-- ────────────────────────────────────────────────────────────────

begin;

drop policy if exists watchlist_read on public.watchlist;
drop policy if exists earnings_read on public.earnings_surprises;
drop policy if exists runs_read on public.pipeline_runs;

revoke all on public.watchlist, public.earnings_surprises, public.pipeline_runs from anon, authenticated;

commit;

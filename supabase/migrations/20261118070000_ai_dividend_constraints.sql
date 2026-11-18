begin;

-- AI Dividend build step 4: constraint gauges reuse the signal archive.
-- New sources: EIA electricity, FRED commodity prices, Epoch data centres, US Drought Monitor.
alter table public.dividend_signal_vintages drop constraint if exists dividend_signal_vintages_source_key_check;
alter table public.dividend_signal_vintages add constraint dividend_signal_vintages_source_key_check
  check (source_key in ('epoch', 'btos', 'indeed', 'eia', 'fred', 'datacentres', 'drought'));

alter table public.dividend_signal_runs drop constraint if exists dividend_signal_runs_source_key_check;
alter table public.dividend_signal_runs add constraint dividend_signal_runs_source_key_check
  check (source_key in ('epoch', 'btos', 'indeed', 'eia', 'fred', 'datacentres', 'drought'));

commit;

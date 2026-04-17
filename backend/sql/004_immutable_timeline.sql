do $$
begin
  if to_regclass('legal_advisor.crawl_events') is null then
    return;
  end if;

  execute 'alter table legal_advisor.crawl_events add column if not exists sequence_no bigserial';
  execute 'create unique index if not exists idx_crawl_events_sequence_unique on legal_advisor.crawl_events (sequence_no)';
  execute 'create index if not exists idx_crawl_events_run_sequence on legal_advisor.crawl_events (run_id, sequence_no asc)';
end $$;
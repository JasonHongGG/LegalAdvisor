create table if not exists legal_advisor.crawl_work_item_stages (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  work_item_id text not null references legal_advisor.crawl_work_items(id) on delete cascade,
  stage_name text not null,
  status text not null default 'running',
  message text not null default '',
  progress numeric(5,2) not null default 0,
  items_processed integer not null default 0,
  items_total integer not null default 0,
  source_locator text,
  sequence_no serial,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_work_item_stages_run
  on legal_advisor.crawl_work_item_stages (run_id, sequence_no asc);

create index if not exists idx_work_item_stages_work_item
  on legal_advisor.crawl_work_item_stages (work_item_id, sequence_no asc);

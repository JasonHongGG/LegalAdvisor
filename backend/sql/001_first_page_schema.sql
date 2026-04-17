create schema if not exists legal_advisor;
create schema if not exists legal_advisor_queue;

create table if not exists legal_advisor.crawl_sources (
  id text primary key,
  name text not null,
  short_name text not null,
  source_type text not null,
  implementation_mode text not null,
  base_url text not null,
  description text not null,
  notes text not null,
  health_status text not null default 'unknown',
  rate_limit_status text not null default 'unknown',
  today_request_count integer not null default 0,
  recommended_concurrency integer not null default 1,
  last_checked_at timestamptz,
  last_error_message text,
  capabilities jsonb not null default '[]'::jsonb,
  run_builder_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_runs (
  id text primary key,
  source_id text not null references legal_advisor.crawl_sources(id),
  status text not null,
  summary text not null default '',
  overall_progress numeric(5,2) not null default 0,
  target_count integer not null default 0,
  total_work_items integer not null default 0,
  completed_work_items integer not null default 0,
  failed_work_items integer not null default 0,
  queued_work_items integer not null default 0,
  running_work_items integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  eta_seconds integer,
  manifest_artifact_id text,
  started_at timestamptz,
  finished_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_run_targets (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  target_kind text not null,
  label text not null,
  config jsonb not null,
  order_index integer not null,
  created_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_work_items (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  run_target_id text references legal_advisor.crawl_run_targets(id) on delete set null,
  sequence_no integer not null,
  label text not null,
  status text not null,
  progress numeric(5,2) not null default 0,
  current_stage text not null default 'pending',
  source_locator text,
  cursor jsonb,
  last_message text not null default '',
  retry_count integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  items_processed integer not null default 0,
  items_total integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_events (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  event_type text not null,
  level text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_artifacts (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  artifact_kind text not null,
  file_name text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null,
  hash_sha256 text not null,
  schema_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_checkpoints (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  checkpoint_key text not null,
  cursor jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_rate_limits (
  id text primary key,
  source_id text not null references legal_advisor.crawl_sources(id) on delete cascade,
  rate_limit_status text not null,
  message text,
  suggested_retry_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_run_summaries (
  id text primary key,
  run_id text not null unique references legal_advisor.crawl_runs(id) on delete cascade,
  manifest_artifact_id text references legal_advisor.crawl_artifacts(id) on delete set null,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  warning_count integer not null default 0,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_crawl_runs_source_updated on legal_advisor.crawl_runs (source_id, updated_at desc);
create index if not exists idx_crawl_runs_status_updated on legal_advisor.crawl_runs (status, updated_at desc);
create index if not exists idx_crawl_run_targets_run on legal_advisor.crawl_run_targets (run_id, order_index);
create index if not exists idx_crawl_work_items_run_status on legal_advisor.crawl_work_items (run_id, status, sequence_no);
create index if not exists idx_crawl_work_items_updated on legal_advisor.crawl_work_items (updated_at desc);
create index if not exists idx_crawl_events_run_time on legal_advisor.crawl_events (run_id, occurred_at desc);
create index if not exists idx_crawl_events_work_item_time on legal_advisor.crawl_events (work_item_id, occurred_at desc);
create index if not exists idx_crawl_artifacts_run on legal_advisor.crawl_artifacts (run_id, created_at desc);
create index if not exists idx_crawl_artifacts_storage on legal_advisor.crawl_artifacts (storage_path);
create unique index if not exists idx_crawl_checkpoints_unique on legal_advisor.crawl_checkpoints (run_id, work_item_id, checkpoint_key);
create unique index if not exists idx_crawl_rate_limits_source on legal_advisor.crawl_rate_limits (source_id);

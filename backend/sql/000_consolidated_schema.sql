-- Consolidated schema for LegalAdvisor
-- Represents the final state after migrations 001-007.
-- For fresh installs only. Existing databases should run incremental migrations.

create schema if not exists legal_advisor;
create schema if not exists legal_advisor_queue;

-- ============================================================
-- Core crawl tables
-- ============================================================

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

create table if not exists legal_advisor.crawl_events (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  event_type text not null,
  level text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  sequence_no bigserial,
  occurred_at timestamptz not null default now()
);

-- ============================================================
-- Canonical law storage
-- ============================================================

create table if not exists legal_advisor.canonical_law_documents (
  id text primary key,
  source_id text not null references legal_advisor.crawl_sources(id),
  law_name text not null,
  normalized_law_name text not null,
  english_name text,
  law_level text,
  category text,
  law_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, normalized_law_name)
);

create table if not exists legal_advisor.canonical_law_versions (
  id text primary key,
  law_document_id text not null references legal_advisor.canonical_law_documents(id) on delete cascade,
  source_id text not null references legal_advisor.crawl_sources(id),
  law_name text not null,
  modified_date text,
  effective_date text,
  source_update_date text,
  version_fingerprint text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (law_document_id, version_fingerprint)
);

-- ============================================================
-- Artifact storage (content-addressed)
-- ============================================================

create table if not exists legal_advisor.artifact_contents (
  id text primary key,
  hash_sha256 text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  encoding text,
  content bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists legal_advisor.artifacts (
  id text primary key,
  canonical_document_id text references legal_advisor.canonical_law_documents(id) on delete cascade,
  canonical_version_id text references legal_advisor.canonical_law_versions(id) on delete cascade,
  artifact_kind text not null,
  artifact_role text not null,
  file_name text not null,
  content_id text not null references legal_advisor.artifact_contents(id) on delete cascade,
  content_type text not null,
  size_bytes bigint not null,
  hash_sha256 text not null,
  schema_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists legal_advisor.crawl_run_artifact_links (
  id text primary key,
  run_id text not null references legal_advisor.crawl_runs(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  artifact_id text not null references legal_advisor.artifacts(id) on delete cascade,
  content_status text not null,
  created_at timestamptz not null default now(),
  unique (run_id, work_item_id, artifact_id)
);

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists idx_crawl_runs_source_updated on legal_advisor.crawl_runs (source_id, updated_at desc);
create index if not exists idx_crawl_runs_status_updated on legal_advisor.crawl_runs (status, updated_at desc);
create index if not exists idx_crawl_run_targets_run on legal_advisor.crawl_run_targets (run_id, order_index);
create index if not exists idx_crawl_work_items_run_status on legal_advisor.crawl_work_items (run_id, status, sequence_no);
create index if not exists idx_crawl_work_items_updated on legal_advisor.crawl_work_items (updated_at desc);
create index if not exists idx_work_item_stages_run on legal_advisor.crawl_work_item_stages (run_id, sequence_no asc);
create index if not exists idx_work_item_stages_work_item on legal_advisor.crawl_work_item_stages (work_item_id, sequence_no asc);
create index if not exists idx_crawl_events_run_time on legal_advisor.crawl_events (run_id, occurred_at desc);
create index if not exists idx_crawl_events_work_item_time on legal_advisor.crawl_events (work_item_id, occurred_at desc);
create unique index if not exists idx_crawl_events_sequence_unique on legal_advisor.crawl_events (sequence_no);
create index if not exists idx_crawl_events_run_sequence on legal_advisor.crawl_events (run_id, sequence_no asc);
create index if not exists idx_artifact_contents_hash on legal_advisor.artifact_contents (hash_sha256);
create index if not exists idx_artifacts_canonical_version on legal_advisor.artifacts (canonical_version_id, created_at desc);
create unique index if not exists idx_artifacts_canonical_kind_unique on legal_advisor.artifacts (canonical_version_id, artifact_kind);
create index if not exists idx_crawl_run_artifact_links_run on legal_advisor.crawl_run_artifact_links (run_id, created_at desc);
create index if not exists idx_canonical_law_documents_lookup on legal_advisor.canonical_law_documents (source_id, normalized_law_name);
create index if not exists idx_canonical_law_versions_lookup on legal_advisor.canonical_law_versions (law_document_id, version_fingerprint);

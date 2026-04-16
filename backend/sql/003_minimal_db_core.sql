alter table if exists legal_advisor.crawl_sources
  drop column if exists rate_limit_status,
  drop column if exists today_request_count;

drop table if exists legal_advisor.crawl_rate_limits;
drop table if exists legal_advisor.crawl_checkpoints;
drop table if exists legal_advisor.crawl_run_summaries;

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

create table if not exists legal_advisor.crawl_task_artifact_links (
  id text primary key,
  task_id text not null references legal_advisor.crawl_tasks(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  artifact_id text not null references legal_advisor.artifacts(id) on delete cascade,
  content_status text not null,
  created_at timestamptz not null default now(),
  unique (task_id, work_item_id, artifact_id)
);

create index if not exists idx_artifact_contents_hash
  on legal_advisor.artifact_contents (hash_sha256);

create index if not exists idx_artifacts_canonical_version
  on legal_advisor.artifacts (canonical_version_id, created_at desc);

create unique index if not exists idx_artifacts_canonical_kind_unique
  on legal_advisor.artifacts (canonical_version_id, artifact_kind)
  where canonical_version_id is not null;

create index if not exists idx_crawl_task_artifact_links_task
  on legal_advisor.crawl_task_artifact_links (task_id, created_at desc);

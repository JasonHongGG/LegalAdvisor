alter table if exists legal_advisor.crawl_tasks
  drop column if exists manifest_artifact_id;

alter table if exists legal_advisor.crawl_run_summaries
  drop column if exists manifest_artifact_id;

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

create table if not exists legal_advisor.canonical_law_version_artifacts (
  id text primary key,
  law_document_id text not null references legal_advisor.canonical_law_documents(id) on delete cascade,
  law_version_id text not null references legal_advisor.canonical_law_versions(id) on delete cascade,
  artifact_kind text not null,
  artifact_role text not null,
  file_name text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null,
  hash_sha256 text not null,
  schema_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (law_version_id, artifact_kind)
);

create table if not exists legal_advisor.crawl_task_artifact_refs (
  id text primary key,
  task_id text not null references legal_advisor.crawl_tasks(id) on delete cascade,
  work_item_id text references legal_advisor.crawl_work_items(id) on delete cascade,
  law_document_id text not null references legal_advisor.canonical_law_documents(id) on delete cascade,
  law_version_id text not null references legal_advisor.canonical_law_versions(id) on delete cascade,
  canonical_artifact_id text not null references legal_advisor.canonical_law_version_artifacts(id) on delete cascade,
  content_status text not null,
  created_at timestamptz not null default now(),
  unique (task_id, work_item_id, canonical_artifact_id)
);

create index if not exists idx_canonical_law_documents_lookup
  on legal_advisor.canonical_law_documents (source_id, normalized_law_name);

create index if not exists idx_canonical_law_versions_lookup
  on legal_advisor.canonical_law_versions (law_document_id, version_fingerprint);

create index if not exists idx_canonical_law_version_artifacts_version
  on legal_advisor.canonical_law_version_artifacts (law_version_id, artifact_kind);

create index if not exists idx_crawl_task_artifact_refs_task
  on legal_advisor.crawl_task_artifact_refs (task_id, created_at desc);
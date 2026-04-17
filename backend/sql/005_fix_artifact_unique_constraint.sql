drop index if exists legal_advisor.idx_artifacts_canonical_kind_unique;

create unique index if not exists idx_artifacts_canonical_kind_unique
  on legal_advisor.artifacts (canonical_version_id, artifact_kind);
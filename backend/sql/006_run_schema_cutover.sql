do $$
begin
  if to_regclass('legal_advisor.crawl_tasks') is not null and to_regclass('legal_advisor.crawl_runs') is null then
    execute 'alter table legal_advisor.crawl_tasks rename to crawl_runs';
  end if;

  if to_regclass('legal_advisor.crawl_task_targets') is not null and to_regclass('legal_advisor.crawl_run_targets') is null then
    execute 'alter table legal_advisor.crawl_task_targets rename to crawl_run_targets';
  end if;

  if to_regclass('legal_advisor.crawl_task_artifact_links') is not null and to_regclass('legal_advisor.crawl_run_artifact_links') is null then
    execute 'alter table legal_advisor.crawl_task_artifact_links rename to crawl_run_artifact_links';
  end if;

  if to_regclass('legal_advisor.crawl_task_artifact_refs') is not null and to_regclass('legal_advisor.crawl_run_artifact_refs') is null then
    execute 'alter table legal_advisor.crawl_task_artifact_refs rename to crawl_run_artifact_refs';
  end if;

  if to_regclass('legal_advisor.crawl_sources') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'legal_advisor'
        and table_name = 'crawl_sources'
        and column_name = 'task_builder_fields'
    ) then
      execute 'alter table legal_advisor.crawl_sources rename column task_builder_fields to run_builder_fields';
    end if;
  end if;

  if to_regclass('legal_advisor.crawl_run_targets') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'legal_advisor'
        and table_name = 'crawl_run_targets'
        and column_name = 'task_id'
    ) then
      execute 'alter table legal_advisor.crawl_run_targets rename column task_id to run_id';
    end if;
  end if;

  if to_regclass('legal_advisor.crawl_work_items') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'legal_advisor'
        and table_name = 'crawl_work_items'
        and column_name = 'task_id'
    ) then
      execute 'alter table legal_advisor.crawl_work_items rename column task_id to run_id';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'legal_advisor'
        and table_name = 'crawl_work_items'
        and column_name = 'task_target_id'
    ) then
      execute 'alter table legal_advisor.crawl_work_items rename column task_target_id to run_target_id';
    end if;
  end if;

  if to_regclass('legal_advisor.crawl_events') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'legal_advisor'
        and table_name = 'crawl_events'
        and column_name = 'task_id'
    ) then
      execute 'alter table legal_advisor.crawl_events rename column task_id to run_id';
    end if;
  end if;

  if to_regclass('legal_advisor.crawl_run_artifact_links') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'legal_advisor'
        and table_name = 'crawl_run_artifact_links'
        and column_name = 'task_id'
    ) then
      execute 'alter table legal_advisor.crawl_run_artifact_links rename column task_id to run_id';
    end if;
  end if;
end $$;

update legal_advisor.crawl_events
set event_type = 'run-created'
where event_type = 'task-created';

update legal_advisor.crawl_events
set event_type = 'run-status'
where event_type = 'task-status';

update legal_advisor.crawl_run_artifact_links
set content_status = 'run-only'
where content_status = 'task-only';

update legal_advisor.artifacts
set metadata = jsonb_set(metadata, '{contentStatus}', to_jsonb('run-only'::text), true)
where metadata ->> 'contentStatus' = 'task-only';

drop index if exists legal_advisor.idx_crawl_tasks_source_updated;
drop index if exists legal_advisor.idx_crawl_tasks_status_updated;
drop index if exists legal_advisor.idx_crawl_run_targets_task;
drop index if exists legal_advisor.idx_crawl_work_items_task_status;
drop index if exists legal_advisor.idx_crawl_events_task_time;
drop index if exists legal_advisor.idx_crawl_run_artifact_links_task;
drop index if exists legal_advisor.idx_crawl_events_task_sequence;

create index if not exists idx_crawl_runs_source_updated
  on legal_advisor.crawl_runs (source_id, updated_at desc);

create index if not exists idx_crawl_runs_status_updated
  on legal_advisor.crawl_runs (status, updated_at desc);

create index if not exists idx_crawl_run_targets_run
  on legal_advisor.crawl_run_targets (run_id, order_index);

create index if not exists idx_crawl_work_items_run_status
  on legal_advisor.crawl_work_items (run_id, status, sequence_no);

create index if not exists idx_crawl_events_run_time
  on legal_advisor.crawl_events (run_id, occurred_at desc);

create index if not exists idx_crawl_run_artifact_links_run
  on legal_advisor.crawl_run_artifact_links (run_id, created_at desc);

create index if not exists idx_crawl_events_run_sequence
  on legal_advisor.crawl_events (run_id, sequence_no asc);
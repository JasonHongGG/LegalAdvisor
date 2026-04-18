# SQL Migrations

## 結構說明

| 檔案 | 用途 |
|------|------|
| `000_consolidated_schema.sql` | 完整結構（僅供全新安裝使用） |
| `001_first_page_schema.sql` | 初始 crawl 表結構 |
| `002_canonical_law_storage.sql` | 法律正典儲存（canonical law） |
| `003_minimal_db_core.sql` | 精簡核心：移除 rate_limits/checkpoints/summaries，新增 content-addressed artifacts |
| `004_immutable_timeline.sql` | Events 加入 sequence_no |
| `005_fix_artifact_unique_constraint.sql` | 修正 artifact unique index |
| `006_run_schema_cutover.sql` | task → run 重新命名 |
| `007_work_item_stages.sql` | WorkItem 階段追蹤表 |

## 使用方式

- **全新安裝**：執行 `000_consolidated_schema.sql`
- **增量升級**：依序執行 `001` ~ `007`（migrate.ts 會自動處理）

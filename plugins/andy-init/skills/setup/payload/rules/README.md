# 語言 rules

> 由 `tools/sync-rules.mjs` 產生，**不要手改**；要調整擷取方式就改那支腳本後重跑。

| 項目 | 值 |
|---|---|
| 上游 | https://github.com/affaan-m/ECC（原 everything-claude-code，MIT License, Copyright (c) 2026 Affaan Mustafa） |
| commit | `c70874fae9eb0e5ad0365beb7e2955899fd1d30f` |
| 擷取日期 | 2026-09-30 |
| 語言 | python、typescript、golang、rust、vue、web |

每個檔案開頭的 `paths:` frontmatter 保留原樣：只有碰到對應副檔名時才會載入。

## 與上游的差異

- 不帶 `common/`：通用層由 `~/.claude/AGENTS.md` 擔任。
- 不帶 `hooks.md`：描述的是未安裝的 ECC 自動化 hook。
- 逐項移除：

| 檔案 | 移除內容與原因 |
|---|---|
| `python/coding-style.md` | 刪除「See skill: `python-patterns` for comprehensive Python idioms and patterns.」：指向 ECC skill |
| `python/fastapi.md` | 刪除「See skill: `fastapi-patterns`.」：指向 ECC skill |
| `python/patterns.md` | 刪除「See skill: `python-patterns` for comprehensive patterns including decorators, concurrency, and package organization.」：指向 ECC skill |
| `python/security.md` | 刪除「See skill: `django-security` for Django-specific security guidelines (if applicable).」：指向 ECC skill |
| `python/testing.md` | 刪除「See skill: `python-testing` for detailed pytest patterns and fixtures.」：指向 ECC skill |
| `typescript/coding-style.md` | 刪除「- See hooks for automatic detection」：指向未安裝的 ECC hook |
| `typescript/security.md` | 刪除段落「## Agent Support」：推薦 ECC agent |
| `typescript/testing.md` | 刪除段落「## Agent Support」：推薦 ECC agent |
| `golang/coding-style.md` | 刪除「See skill: `golang-patterns` for comprehensive Go idioms and patterns.」：指向 ECC skill |
| `golang/patterns.md` | 刪除「See skill: `golang-patterns` for comprehensive Go patterns including concurrency, error handling, and package organization.」：指向 ECC skill |
| `golang/testing.md` | 刪除「See skill: `golang-testing` for detailed Go testing patterns and helpers.」：指向 ECC skill |
| `rust/coding-style.md` | 刪除「See skill: `rust-patterns` for comprehensive Rust idioms and patterns.」：指向 ECC skill |
| `rust/patterns.md` | 刪除「See skill: `rust-patterns` for comprehensive patterns including ownership, traits, generics, concurrency, and async.」：指向 ECC skill |
| `rust/security.md` | 刪除「See skill: `rust-patterns` for unsafe code guidelines and ownership patterns.」：指向 ECC skill |
| `rust/security.md` | 刪除「See skill: `security-review` for general security checklists.」：指向 ECC skill |
| `rust/testing.md` | 刪除「- Target 80%+ line coverage」：覆蓋率硬指標與 AGENTS.md §1「證據優先於綠燈」衝突 |
| `rust/testing.md` | 刪除「See skill: `rust-testing` for comprehensive testing patterns including property-based testing, fixtures, and benchmarking with Criterion.」：指向 ECC skill |
| `vue/coding-style.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `vue/patterns.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `vue/security.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `vue/testing.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `web/design-quality.md` | 刪除「5. Use ECC design/frontend skills where relevant.」：指向 ECC skill |

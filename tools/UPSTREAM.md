# 上游擷取紀錄

> 由 `tools/sync-upstream.mjs` 產生，**不要手改**；要調整擷取方式就改那支腳本後重跑。

| 項目 | 值 |
|---|---|
| 上游 | https://github.com/affaan-m/ECC（原 everything-claude-code，MIT License, Copyright (c) 2026 Affaan Mustafa） |
| commit | `c70874fae9eb0e5ad0365beb7e2955899fd1d30f` |
| 擷取日期 | 2026-09-30 |
| rules | python、typescript、golang、rust、vue、web → `plugins/andy-init/skills/setup/payload/rules/`（由 setup 裝到 `~/.claude/rules/`） |
| agents | python-reviewer、typescript-reviewer、go-reviewer、rust-reviewer、database-reviewer、security-reviewer → `plugins/andy-init/agents/`（plugin 直接載入） |

## 與上游的差異

- rules 不帶 `common/`：通用層由 `~/.claude/AGENTS.md` 擔任；不帶 `hooks.md`：描述的是未安裝的 ECC hook。
- rules 保留 `paths:` frontmatter，只有碰到對應副檔名時才載入。
- agents 只收唯讀工具（Read、Grep、Glob、Bash）的審查者；有 Write/Edit 的一律不帶。
- agents 在 frontmatter 後加上本地前言：只審查不動手、以 AGENTS.md 為準、繁體中文回報。
- 逐項移除：

| 檔案 | 移除內容與原因 |
|---|---|
| `rules/python/coding-style.md` | 刪除「See skill: `python-patterns` for comprehensive Python idioms and patterns.」：指向 ECC skill |
| `rules/python/fastapi.md` | 刪除「See skill: `fastapi-patterns`.」：指向 ECC skill |
| `rules/python/patterns.md` | 刪除「See skill: `python-patterns` for comprehensive patterns including decorators, concurrency,」：指向 ECC skill |
| `rules/python/security.md` | 刪除「See skill: `django-security` for Django-specific security guidelines (if applicable).」：指向 ECC skill |
| `rules/python/testing.md` | 刪除「See skill: `python-testing` for detailed pytest patterns and fixtures.」：指向 ECC skill |
| `rules/typescript/coding-style.md` | 刪除「- See hooks for automatic detection」：指向未安裝的 ECC hook |
| `rules/typescript/security.md` | 刪除段落「## Agent Support」：推薦 ECC agent |
| `rules/typescript/testing.md` | 刪除段落「## Agent Support」：推薦 ECC agent |
| `rules/golang/coding-style.md` | 刪除「See skill: `golang-patterns` for comprehensive Go idioms and patterns.」：指向 ECC skill |
| `rules/golang/patterns.md` | 刪除「See skill: `golang-patterns` for comprehensive Go patterns including concurrency, error ha」：指向 ECC skill |
| `rules/golang/testing.md` | 刪除「See skill: `golang-testing` for detailed Go testing patterns and helpers.」：指向 ECC skill |
| `rules/rust/coding-style.md` | 刪除「See skill: `rust-patterns` for comprehensive Rust idioms and patterns.」：指向 ECC skill |
| `rules/rust/patterns.md` | 刪除「See skill: `rust-patterns` for comprehensive patterns including ownership, traits, generic」：指向 ECC skill |
| `rules/rust/security.md` | 刪除「See skill: `rust-patterns` for unsafe code guidelines and ownership patterns.」：指向 ECC skill |
| `rules/rust/security.md` | 刪除「See skill: `security-review` for general security checklists.」：指向 ECC skill |
| `rules/rust/testing.md` | 刪除「- Target 80%+ line coverage」：覆蓋率硬指標與 AGENTS.md §1「證據優先於綠燈」衝突 |
| `rules/rust/testing.md` | 刪除「See skill: `rust-testing` for comprehensive testing patterns including property-based test」：指向 ECC skill |
| `rules/vue/coding-style.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `rules/vue/patterns.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `rules/vue/security.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `rules/vue/testing.md` | 刪除「- ECC skills: `frontend-patterns`, `vite-patterns`.」：指向 ECC skill |
| `rules/web/design-quality.md` | 刪除「5. Use ECC design/frontend skills where relevant.」：指向 ECC skill |
| `agents/python-reviewer.md` | 刪除「For detailed Python patterns, security examples, and code samples, see skill: `python-patt」：指向 ECC skill |
| `agents/typescript-reviewer.md` | 刪除「> **For React-specific review, prefer `react-reviewer` via `/react-review`.** This block r」：指向未帶入的 react-reviewer agent |
| `agents/typescript-reviewer.md` | 刪除「This repo does not yet ship a dedicated `typescript-patterns` skill. For detailed TypeScri」：指向 ECC skill |
| `agents/go-reviewer.md` | 刪除「For detailed Go code examples and anti-patterns, see `skill: golang-patterns`.」：指向 ECC skill |
| `agents/rust-reviewer.md` | 刪除「For detailed Rust code examples and anti-patterns, see `skill: rust-patterns`.」：指向 ECC skill |
| `agents/database-reviewer.md` | 刪除「For detailed index patterns, schema design examples, connection management, concurrency st」：指向 ECC skill |
| `agents/security-reviewer.md` | 刪除「For detailed vulnerability patterns, code examples, report templates, and PR review templa」：指向 ECC skill |

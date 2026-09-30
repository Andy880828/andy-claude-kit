# project-docs 偏好

**最後更新：2026-09-30**（由 andy-init 初始建立；之後屬於你，setup 不會覆蓋）

## 文件結構

| 檔案 | 要不要 | 備註 |
|---|---|---|
| `AGENTS.md` | 要 | 規則本體，不可砍 |
| `CLAUDE.md` | 要 | 只放 `@AGENTS.md` 與 Claude 專屬設定，不可砍 |
| `docs/PRD.md` | 要 | |
| `docs/ARCHITECTURE.md` | 要 | |
| `docs/ROADMAP.md` | 要 | |
| `docs/PROGRESS.md` | 要 | 開頭為 `§0 接手速覽` |

## 文件同步 hook

要。init／migrate／audit 時安裝 `.claude/hooks/docs-sync.js`（本輪有程式變更才擋下）。

## 工程習慣

來源：`~/.claude/AGENTS.md`，由 `~/.claude/CLAUDE.md` import。
**跨專案共用，不複製進 repo。** 專案 AGENTS.md 只留一行指針。

本 skill 的預設中，已被上述習慣覆蓋的條目：
- 「實作計畫不要落成檔案」→ 改為複雜多階段任務在 `docs/` 建實體追蹤檔（完成後 `git rm`）

## 每次都要做的

- 一律繁體中文；技術識別字保留原文
- 動手前先確認要哪幾份，不要直接開檔

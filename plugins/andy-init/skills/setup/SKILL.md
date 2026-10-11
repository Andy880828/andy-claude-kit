---
name: setup
description: 初始化或更新這台電腦的 Claude Code 全域環境——安裝全域 AGENTS.md（工程習慣）、CLAUDE.md 的 import 殼、語言 rules（Python/TS/JS/Go/Rust/Vue/Web）、繁體中文語言設定、project-docs 偏好檔，並選裝 LSP 與 claude-hud。Use when the user says 初始化環境、setup、新電腦、重裝 Claude、更新 andy-init、同步全域設定.
argument-hint: "[--force] [--subagent-mode=investigate|implement]"
disable-model-invocation: true
allowed-tools: Read AskUserQuestion Bash(node *) Bash(claude plugin *)
---

# andy-init 環境安裝

所有檔案操作都交給 `scripts/setup.mjs`（決定性、冪等、可重跑）。**不要自己手寫 `~/.claude` 底下的檔案**，
腳本做不到的事就回報，不要繞過。

下文的 `<SKILL_DIR>` 指本 skill 的 base directory（載入時會告訴你）。

## 1. 選項 → 預覽 → 確認 → 套用

先用一次 `AskUserQuestion` 問可選的規則變體（目前只有一個；預覽報告第二行「選項：」會顯示目前的選擇）：

- `subagent-mode`：子 agent 只負責調查（`investigate`，預設），或可實作邊界清楚的工作包、最終驗證與 commit 留在主線（`implement`）

使用者的選擇以 `--subagent-mode=<值>` 帶給下面兩個指令；不想改就不帶（沿用 manifest 記的值）。

```bash
node "<SKILL_DIR>/scripts/setup.mjs" --dry-run [--subagent-mode=<值>]
```

把報告**原樣**給使用者看，特別指出：

- **跳過**的項目與原因。常見的是「既有檔案不是 andy-init 建立的」——例如舊的 `~/.claude/AGENTS.md` 或
  `~/.claude/rules/python/*.md`。問使用者要不要用 `--force`（會先備份成 `.bak-<時間戳>` 再覆蓋）。
- **警告**：`rules/<語言>/` 底下不是 andy-init 管理、但仍會被載入的檔案。列出來讓使用者決定要不要刪；
  **不要自己刪**。
- **錯誤**（例如 `settings.json` 不是合法 JSON）：整批不會寫入，請使用者先修正。

使用者同意後執行（有 `$ARGUMENTS` 就照帶）：

```bash
node "<SKILL_DIR>/scripts/setup.mjs" $ARGUMENTS [--subagent-mode=<值>]
```

## 2. LSP（可選）

```bash
node "<SKILL_DIR>/scripts/setup.mjs" --check-lsp
```

輸出是 JSON：每個 LSP 的 `binaryFound`（語言伺服器在不在 PATH）與 `pluginInstalled`。
用 **一次** `AskUserQuestion` 問兩題（都是 multiSelect）：

1. 「你的技術棧」群組（`groups[id=stack]`）——選項標籤帶上狀態，例如「pyright-lsp（Python）✅ 已裝」
2. 「其他語言」群組（`groups[id=other]`）——選項超過 4 個時挑使用者最可能用到的 3 個，
   其餘提示可從 Other 輸入 plugin 名

對每個選到、且 `pluginInstalled` 為 false 的項目：

- `binaryFound` 為 true → `claude plugin install <id>`
- `binaryFound` 為 false → **不要安裝 binary**，把 `installBinary` 指令列給使用者，
  告訴他裝好後重跑 `/andy-init:setup` 就會接著裝 plugin。
  （沒有 binary 的 LSP plugin 裝了也不會動，那是假旋鈕。）

最後提一句 `knownGaps`（例如 `.vue` 沒有 LSP）。

## 3. claude-hud

`--check-lsp` 的 `claudeHudInstalled` 為 false 時：

```bash
claude plugin marketplace add jarrodwatts/claude-hud
claude plugin install claude-hud@claude-hud
```

然後提示使用者**重啟後**執行 `/claude-hud:setup`（statusLine 由它自己偵測平台與 runtime 後寫入，這裡不代寫）。

## 4. 收尾

用四行總結：套用了什麼、跳過了什麼、使用者還要手動做什麼（binary 安裝、`/claude-hud:setup`）、
**重啟 Claude Code** 讓 AGENTS.md 與 rules 生效。

任何一步失敗都要照實說出失敗的指令與錯誤訊息，不要說「已完成」。

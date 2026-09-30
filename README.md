# andy-claude-kit

Andy 的私人 Claude Code plugin 集。目前只有一個 plugin：**andy-init**，用來在任何電腦上一鍵重建個人環境。

## 新電腦安裝

前置：已裝 Claude Code、git、node，且 git 能存取 GitHub 私人 repo（第一次會跳瀏覽器登入）。

```bash
claude plugin marketplace add Andy880828/andy-claude-kit
claude plugin install andy-init@andy-claude-kit
```

啟動 `claude`，輸入：

```
/andy-init:setup
```

照提示確認 → 選 LSP → 重啟 Claude Code，完成。

## 更新

```bash
claude plugin marketplace update andy-claude-kit
claude plugin update andy-init@andy-claude-kit
```

重啟後再跑一次 `/andy-init:setup`（冪等：只更新你沒手改過的檔案）。

> 私人 repo 的背景自動更新需要環境變數 `GITHUB_TOKEN`；不設也行，就是手動跑上面兩行。

## 內容物

| 功能 | 裝到哪 | 說明 |
|---|---|---|
| 工程習慣 | `~/.claude/AGENTS.md` | 跨專案硬規則本體 |
| import 殼 | `~/.claude/CLAUDE.md` 受管區塊 | 只有 `@~/.claude/AGENTS.md`；區塊外內容不動 |
| 語言 rules | `~/.claude/rules/{python,typescript,golang,rust,vue,web}/` | 擷取自上游 ECC，依副檔名自動載入；來源與差異見 `plugins/andy-init/skills/setup/payload/rules/README.md` |
| 語言設定 | `~/.claude/settings.json` 的 `language` | 繁體中文 |
| project-docs 偏好 | `~/.claude/project-docs.preferences.md` | 只在不存在時建立 |
| LSP、claude-hud | Claude Code plugin | setup 時選裝 |
| `/andy-init:project-docs` | plugin skill | 專案文件骨幹（AGENTS.md + PRD/ARCHITECTURE/ROADMAP/PROGRESS），並在專案裝上文件同步 Stop hook |

setup 會在 `~/.claude/andy-init.manifest.json` 記錄每個受管檔的 hash：你手改過的檔案之後不會被覆蓋（`--force` 才會，且先備份）。

## 開發

```bash
claude --plugin-dir ./plugins/andy-init        # 不安裝，直接載入本機版本測試
claude plugin validate .                       # 檢查 marketplace 與 plugin 格式
node --test "plugins/andy-init/tests/*.test.mjs"
node tools/sync-rules.mjs                      # 從上游抓最新語言 rules，看 git diff 決定要不要收
```

### 發版

1. 改 `plugins/andy-init/.claude-plugin/plugin.json` 的 `version`（唯一的版本來源）
   - patch：rules、文案修正｜minor：新 skill 或新 payload｜major：受管路徑或 manifest 格式變更
2. `git commit` → `git tag vX.Y.Z` → `git push origin main --tags`

### 擴充

- 新 skill：`plugins/andy-init/skills/<name>/SKILL.md`
- 新的全域檔案：放進 `skills/setup/payload/`，在 `setup.mjs` 的 `ITEMS` 加一行
- 用途完全不同的東西：新開 `plugins/<name>/`，並在 `.claude-plugin/marketplace.json` 加一筆

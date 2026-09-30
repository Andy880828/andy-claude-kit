# 文件同步 hook（docs-sync）

> init／migrate／audit 的最後一步才需要讀本檔。

## 它做什麼

專案層的 Claude Code **Stop hook**。每輪結束時：

| 狀況 | 結果 |
|---|---|
| 本輪有程式變更（工作區 + 上次記錄之後的 commit；排除 `docs/**`、根目錄 `*.md`、`.claude/**`） | **擋下一次**，要求依「各文件的更新時機」檢查 PROGRESS／AGENTS.md 等 |
| 同一批變更（路徑＋內容指紋相同）已經擋過 | 放行 |
| 沒有程式變更、非 git repo、`stop_hook_active`、`DOCS_SYNC_DISABLE=1` | 放行 |
| hook 自己出錯 | 放行，錯誤寫 stderr——hook 故障不能卡住 session |

被擋下時 Claude 會收到變更檔清單與檢查項目。**不需要更新就回一句理由**，
同一批變更不會再擋第二次。

## 安裝

偏好檔「文件同步 hook」為「不要」時跳過本步驟，並在結尾說一句「沒裝 hook，文件要自己記得更新」。

```bash
node "<本 skill 目錄>/assets/install-hook.mjs" <專案根目錄> --dry-run   # 先預覽
node "<本 skill 目錄>/assets/install-hook.mjs" <專案根目錄>             # 套用
```

它會做三件事，其餘內容原樣保留：

1. 複製 `docs-sync.cjs` 到 `<專案>/.claude/hooks/`（進版控，換電腦或協作者沒裝 plugin 也能跑）
2. 在 `<專案>/.claude/settings.json` 的 `hooks.Stop` 註冊 `node "$CLAUDE_PROJECT_DIR/.claude/hooks/docs-sync.cjs"`
3. 把 `.claude/.docs-sync-state.json`（指紋紀錄，每台機器不同）加進 `.gitignore`

`settings.json` 不是合法 JSON 時它會整批不動並報錯——**先修 JSON，不要繞過**。

## audit 時

重跑同一個安裝指令。比對腳本檔頭的 `// docs-sync vX.Y.Z`：

| 狀況 | 結果 |
|---|---|
| plugin 內的版本較新 | 自動更新，報告列出版本變化 |
| 本機版本較新，或同版本但內容被手改過 | **跳過並說明原因**；確認要蓋掉才加 `--force` |

被跳過時把原因轉述給使用者，不要自己加 `--force`。

## 移除

```bash
node "<本 skill 目錄>/assets/install-hook.mjs" <專案根目錄> --remove
```

只移除 docs-sync 自己的 hook 與腳本，其他 Stop hook 保留。

## 為什麼是「指紋」而不是「文件比程式新」

只看修改時間的話，修一個 PROGRESS 的錯字就會被當成「已同步」。
指紋保證每一批新的程式變更都至少被檢查一次，而且只檢查一次。

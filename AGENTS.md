# andy-claude-kit

> 跨專案的工程習慣在 `~/.claude/AGENTS.md`（本 repo 的 `plugins/andy-init/skills/setup/payload/AGENTS.md` 就是它的原始檔）。
> 本檔只寫這個 repo 特有的約束。

## 硬規則

- 版本號只寫在 `plugins/andy-init/.claude-plugin/plugin.json`；`marketplace.json` 的 plugin 條目**不寫 version**。
- `skills/setup/payload/rules/` 與 `plugins/andy-init/agents/` 由 `tools/sync-upstream.mjs` 產生，**不要手改**；要調整擷取方式就改腳本再重跑，來源紀錄在 `tools/UPSTREAM.md`。
- agents 只收唯讀審查者（Read/Grep/Glob/Bash）；有 Write/Edit 的違反全域 AGENTS.md §13，腳本會直接拒絕。
- `plugins/andy-init/` 只放要發佈的東西（整個目錄會被複製進每台電腦的 plugin 快取）；測試、工具、說明放 repo 根目錄。
- `~/.claude` 底下的檔案一律經 `setup.mjs` 寫入；新增全域檔案 = payload 加檔 + `ITEMS` 加一行。
- 改 `docs-sync.cjs` 行為時，同步升它檔頭的 `// docs-sync vX.Y.Z`，否則已安裝的專案 audit 時不會更新。
- 腳本只用 node 內建模組（新電腦不一定有 npm 套件）；hook 腳本用 `.cjs`，不受專案 `package.json` 的 `type` 影響。
- hook 與 setup 出錯時放行／中止並把錯誤寫出來，不可卡住 session，也不可半套寫入。

## 陷阱

- `~/.claude/rules/` 下的每個 `.md` 都會被當成 rule 載入；plugin 的 `agents/` 下每個 `.md` 都會被當成 agent。這兩個目錄只能放本體，說明檔放 `tools/UPSTREAM.md`。
- Claude Code 只自動讀 `CLAUDE.md`；`AGENTS.md` 要靠 `@` import 才會生效。
- `.gitattributes` 固定 LF：marketplace 是 git clone 下來的，沒固定的話各電腦的 `core.autocrlf` 會讓同一版 payload 換行不同，裝出去的檔案與 hash 也跟著不同。

## 驗證

```bash
node --test "tests/*.test.mjs"
claude plugin validate .
```

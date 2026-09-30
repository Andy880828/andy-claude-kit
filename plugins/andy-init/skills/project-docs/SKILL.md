---
name: project-docs
description: Use when the user wants to set up, clean up, or migrate a project's documentation — 建立專案文件、整理文檔、文件太亂、接手專案要先建文件、把 HANDOFF/AUDIT/PLAN 這些散檔收斂掉、設定文件偏好、指定這個專案要哪幾份文件、把我的工程習慣套進專案文件。Asks first about the user's engineering habits (typed in, or from a file such as ENGINEERING.md) and which documents they actually want, then establishes the four-document spine (PRD / ARCHITECTURE / ROADMAP / PROGRESS) plus AGENTS.md (the rules body) with a CLAUDE.md import shell, migrates existing scattered docs into it without breaking references, defines when each file gets updated, and installs a project-level Stop hook that asks for a docs sync whenever a turn changed code.
argument-hint: "[init | migrate | audit | prefs]（省略時自動判斷）"
allowed-tools: Read Write Edit Glob Grep AskUserQuestion Bash(git *) Bash(find *) Bash(wc *) Bash(ls *) Bash(cat *) Bash(node *)
---

# 專案文件骨幹

讓 Agent 在任何一個 session 都能快速回答四個問題，而不必讀完整個 repo。

```
AGENTS.md              Agent 必須遵守什麼      ← 規則本體（經 CLAUDE.md import，每次自動載入）
CLAUDE.md              @AGENTS.md 一行殼      ← Claude Code 只自動讀這個檔名
docs/
├── PRD.md             要做什麼                ← 需求有疑問時
├── ARCHITECTURE.md    怎麼做                  ← 動到結構時
├── ROADMAP.md         接下來做什麼            ← 規劃時
└── PROGRESS.md        現在做到哪              ← 每次開工
```

**四份是骨幹的預設值。** 只有在下方「什麼時候該有骨幹以外的一份」的條件成立時才增加；
要**減少**則是使用者的選擇——先照「步驟 0」問過，不要預設他想要全部四份。

---

## 步驟 0：先問，不要直接開檔

骨幹是預設，不是規定。開第一個檔之前先確認兩件事：
**使用者的工程習慣**與**這個專案實際要哪幾份**。
問完再寫比寫完再改便宜得多——文件一旦建起來，砍掉要連帶改索引與互相指路。

```bash
cat ~/.claude/project-docs.preferences.md 2>/dev/null
```

**有這份就照它做。** 用一行複述關鍵選擇並給反悔的機會
（「沿用你的偏好：不建 ROADMAP.md、習慣沿用 `~/.claude/AGENTS.md`，要改嗎？」），
**不要重問一輪**。使用者這次說的與偏好檔衝突時，以這次為準，並問要不要更新偏好檔。

沒有這份就用 `AskUserQuestion` 問，**一次把三題問完**，不要一題一題來：

| 問題 | 選項 |
|---|---|
| 這個專案要哪幾份文件 | 四份骨幹（建議）／精簡三份／自己挑 |
| 你的工程習慣從哪來 | 給檔案路徑（例如 `ENGINEERING.md`）／我直接講／沿用現有 AGENTS.md／CLAUDE.md／沒有，用預設 |
| 要存成跨專案預設嗎 | 要（寫 `~/.claude/project-docs.preferences.md`）／只用這次 |

- 使用者答「都好」「你決定」→ 用四份骨幹，**不要追問第二次**。
- 非互動環境（CI、`-p` 帶指令）→ 用預設做完，在結尾說明用了哪些預設。
- 使用者一開口就講明結構（「不要 PROGRESS」）→ 那一題不用再問，只問剩下的。

接收程序的細節——怎麼讀習慣檔、哪些條目該放哪、拿掉某一份的代價、
偏好檔格式——見 `references/personalization.md`。

### 🔴 使用者的習慣優先於本 skill 的所有預設

兩者衝突時**照使用者的做**，並用一句話說明你放棄了本 skill 的哪一條，
讓他知道代價。不要因為「skill 上面這樣寫」去改寫人家的規則，
也不要把他的規則和本 skill 的建議混寫成同一段、事後分不出哪句是誰的主張。

例：某人的習慣檔要求「複雜多階段任務在 `docs/` 建實體追蹤文檔」，
與本 skill 的「實作計畫不要落成檔案」直接相反。照他的做，
但講明那份追蹤檔完成後要 `git rm`，否則它會長成第二份 PROGRESS。

**工程習慣不算「骨幹以外的一份」。** 它進專案 AGENTS.md 或使用者層（`~/.claude/AGENTS.md`），
不要為它在 `docs/` 開新檔。

---

## 先判斷要做哪一件事

```bash
ls docs/ 2>/dev/null; ls *.md
```

| 現況 | 做什麼 |
|---|---|
| 沒有 `docs/` 或只有 README | **init**：建立步驟 0 談定的那幾份 |
| 已有骨幹但內容過期 | **audit**：對照程式碼更新，不重建 |
| 有 HANDOFF / AUDIT / PLAN / STATUS 等散檔 | **migrate**：見下方遷移程序 |
| 只想改偏好或套用習慣檔，不動現有文件 | **prefs**：只做步驟 0，寫偏好檔與 AGENTS.md |

「四份骨幹」以下一律指**步驟 0 談定的那幾份**。使用者砍掉了 ROADMAP，
就不要在任何一步又把它建回來，也不要在別份文件裡留指向它的連結。

---

## 🔴 遷移的第一步是 grep，不是刪檔

**這是最容易做錯的一步，而且錯了會留下無聲的傷。**

程式碼註解、migration 檔案、CI 設定、其他 skill 都可能引用你正要刪掉的文件——
特別是**帶編號的問題**（`見 AUDIT.md M-6`、`ADR-0003`）。刪掉之後那些指標
不會報錯，只會讓下一個讀到註解的人查無此物。

```bash
# 一次找出所有引用（依專案調整副檔名）
grep -rn "AUDIT\.md\|HANDOFF\.md\|PLAN\.md\|docs/ops/\|docs/modules/\|ADR-" \
  --include=*.py --include=*.ts --include=*.tsx --include=*.vue \
  --include=*.md --include=*.yml --include=*.json . \
  | grep -v node_modules | grep -v "/\.venv/"
```

實測值得記住的一組數字：某專案要刪的 `AUDIT.md` 被引用 **35 次**，
其中 **30 次帶編號**，散在 21 個 `.py`、CLAUDE.md、docker-compose.yml
與一支 skill 裡。若直接刪，正式程式碼裡會留下 30 個斷掉的指標。

**引用多的文件不代表要保留原檔**——代表**遷移後必須改引用**。
遷移的最後一步是重跑同一條 grep，確認回傳空的。

---

## 什麼時候該有骨幹以外的一份

只有兩種情況值得破例。判準是**閱讀時機不同**：骨幹是「開工時讀」，
這兩類是「被指引才讀」。

| 情況 | 檔名 | 為什麼不併進骨幹 |
|---|---|---|
| 程式碼註解引用帶編號的問題記錄 | `HISTORY.md` | 刪掉會在程式碼裡留斷鏈；併進 PROGRESS 會讓「現在做到哪」被歷史淹沒 |
| 有非做不可的操作程序（建環境、搬機器、災難復原） | `OPERATIONS.md` | runbook 動輒兩三百行，塞進 ARCHITECTURE 會讓後者沒人讀得完 |

**其餘一律不新增。** 特別是這些名字，除非使用者明確要求，一律不要建立：

```
PLAN.md  TASKS.md  HANDOFF.md  AUDIT.md  DECISIONS.md
STATUS.md  NOTES.md  IMPLEMENTATION.md  TODO.md
CHANGELOG.md（有 git 就不需要）
```

`HANDOFF.md` 特別要砍——它與 PROGRESS.md 高度重疊。
下一個 session 需要的是「現在狀態 + 下一步 + 重要 context」，
那就是 PROGRESS.md 的定義。

實作計畫用 Agent 自己的 planning 機制，不要落成檔案——
**除非使用者的習慣明確要求相反**（見步驟 0 的優先順序）。

上面這份禁建清單是本 skill 的預設，不是使用者的意見。他點名要
`TASKS.md` 就建，只要提醒他兩件事：它與哪一份重疊、以及何時該 `git rm`。

---

## 遷移程序

### 1. 盤點

```bash
find docs -name "*.md" -exec wc -l {} + | sort -rn
```

行數最多的那兩三份通常是歷史敘事，也是收斂的主要對象。

### 2. 分類每一段內容

對每一段問一個問題：**這句話能不能防止下一個人踩同一個坑？**

| 能 | 不能 |
|---|---|
| 「X 的成因是 Y，改成 Z 之前先讀這個」 | 「P3 完成，測試 823 通過」 |
| 「這個欄位缺值時回 null 不回 0，因為…」 | 「本期新增了 12 個端點」 |
| 量測到的數字與它推翻了什麼 | 已完成且不會再做一次的驗收清單 |

能的留下，不能的**交給 git**。完整敘事永遠在 commit 歷史裡，
不需要為了「怕弄丟」而留在工作目錄。

⚠️ **最該保留的往往不是結論，是「當時為什麼會判斷錯」。**
那才是防止重演的東西。

### 3. 寫新檔（模板見 `references/templates.md`）

先寫完整套新檔案，確認內容都在，**再刪舊檔**。
順序反過來會讓你在半途發現漏了東西卻已經沒有對照。

既有 `CLAUDE.md` 裡的規則與陷阱**原句搬進 `AGENTS.md`**（不改措辭），
再把 `CLAUDE.md` 改成只剩 `@AGENTS.md` 與 Claude 專屬設定的殼。
搬完用 grep 抽查幾條原句，確認它們只出現在 AGENTS.md 一處。

### 4. 用 `git rm` 刪舊檔

```bash
git rm -r docs/old-dir docs/OLD.md
```

用 `git rm` 而非 `rm`——刪除要進 commit，才看得出這是一次有意的整併。

### 5. 改引用，然後重跑第一步的 grep

編號類的引用（`M-6`、`H-8`）**編號本身不要改**——那是穩定的識別碼，
只改它前面的檔名。

### 6. 驗證

```bash
# 沒有殘留引用
grep -rn "<舊檔名>" --include=* . | grep -v node_modules
# 內部連結指得到
grep -rhoE "\]\(([A-Z_]+\.md)\)" docs/*.md | sort -u
# 註解改動沒有弄壞程式
<專案的 lint 與測試指令>
```

最後一步不可省——批次改註解時很容易破壞字串或縮排。

---

## 最後一步：文件同步 hook

**init／migrate／audit 做完都要執行這一步**（偏好檔寫「不要」時除外）。
它讓「更新時機」不再只靠記憶：每輪結束時若有程式變更，hook 會擋下一次，
要求依下一節的表檢查文件。

```bash
node "<本 skill 目錄>/assets/install-hook.mjs" <專案根目錄> --dry-run
node "<本 skill 目錄>/assets/install-hook.mjs" <專案根目錄>
```

報告要原樣轉述給使用者（新增／更新／已是最新）。行為細節、移除方式見 `references/hook.md`。

---

## 各文件的更新時機

**更新時機比內容規範重要。** 沒有明確的觸發條件，文件就會過期。

| 文件 | 什麼時候更新 | 什麼時候**不要**更新 |
|---|---|---|
| `PROGRESS.md` | 完成一段有意義的工作後 | 每個小 commit |
| `ARCHITECTURE.md` | 新增重要元件、換資料庫、改資料流、做出影響未來的技術決策 | 一般 bug fix |
| `ROADMAP.md` | 里程碑完成、功能增刪、優先序或方向改變 | 每個小 task |
| `PRD.md` | **需求正式變更** | 實作方式改變 |
| `AGENTS.md` | 新增硬性約束、發現新陷阱、指令改變 | 進度更新 |
| `CLAUDE.md` | 幾乎不動（只有 Claude 專屬設定改變時） | 任何規則——規則一律進 AGENTS.md |

`PROGRESS.md` 只記錄五件事：**做到哪、正在做什麼、卡在哪、下一步、
下一個 session 必須知道的 context**。不要寫成工作日誌。

某一份被砍掉時，這張表要跟著改：把那一列刪掉，並把它的職責併進接手的那一份
（誰接手、代價是什麼，見 `references/personalization.md`）。
**留著一列指向不存在的檔案，比沒有這張表更糟。**

---

## AGENTS.md 與 ARCHITECTURE.md 怎麼分

兩者最容易互相侵蝕。分界是**這句話是規則還是描述**：

| 進 AGENTS.md | 進 ARCHITECTURE.md |
|---|---|
| 「禁止在服務層寫 `select()`」 | 「Repository 層負責資料存取」 |
| 「金額一律 Decimal，禁止 float」 | 「MONEY 是 `Numeric(18,4)`」 |
| 常用指令、環境陷阱 | 部署拓撲、元件職責 |
| **所有的「踩過的坑」** | 技術選擇與被否決的替代方案 |

⚠️ **陷阱與警告不要搬出 AGENTS.md。** 它經由 CLAUDE.md 的 `@AGENTS.md` 每個 session 自動載入，
其他文件不會。把「這裡會踩到 X」移到 ARCHITECTURE.md，等於讓它只在
「剛好有人去讀那份文件」時才生效——而那正是最需要它的時候不會發生的事。

---

## 品質判準

1. **簡潔**——一份文件超過 300 行就該問「這裡面有多少是給人看爽的」
2. **不重複**——同一件事只在一個地方是權威，其他地方用連結
3. **不過期**——寧可寫少，不要寫了不維護
4. **程式碼才是實作的真相**——文件寫的是 intent、constraint、state
5. **不為了「文件完整」而建立文件**

最後一條是本 skill 的主要目的：目標是**少量文件 + 清楚責任 + 持續更新**，
而不是大量 Markdown + 大量重複 + 大量維護成本。

---

## 更好的落腳處往往不是文件

發現一個值得記下來的約束時，先問：**它能不能放進程式碼？**

| 內容 | 更好的家 |
|---|---|
| 「這個閾值為什麼是 0.30」 | 該常數的 docstring |
| 「這個函式的回傳型別不可更動」 | 該函式的 docstring |
| 「這兩張表的口徑不同，不可比較」 | 兩者的 model 註解 |
| 「這條測試在守什麼」 | 測試自己的 docstring |

跟著程式碼走的說明會隨程式碼一起被讀到、一起被改；
躺在文件裡的說明要等人來對照。**文件是最後手段，不是第一選擇。**

---

## 參考檔

| 檔案 | 什麼時候載入 |
|---|---|
| `references/personalization.md` | 步驟 0：問答、習慣檔接收、砍檔的代價、偏好檔格式 |
| `references/templates.md` | 實際開始寫檔時：六份文件＋AGENTS.md／CLAUDE.md 的完整範本 |
| `references/hook.md` | init／migrate／audit 最後一步：安裝或更新文件同步 hook |

不要照抄範本的章節標題——依專案實際情況調整，空章節比沒有更糟。

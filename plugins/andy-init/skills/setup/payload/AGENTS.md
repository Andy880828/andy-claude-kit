# 工程習慣與 AI 協作硬規則

本檔是跨專案共用的硬規則：只寫「違反就直接影響產出」的條目。
架構描述、API／schema／欄位等 reference 放 `docs/`，**被指引才讀，不要整份預載**。

## 1. 證據與完成定義 (Evidence)

- 證據強度：**實測 > 推理 > 報告 > 註解**。盤點報告與註解都不是事實；別人的驗收標準只是待驗證假設。
- build／type-check／lint／test 全綠只代表「沒違反自動化條件」，不代表功能正確。「綠燈」與「這件事是真的」是兩個獨立命題。
- 改動前先跑 baseline，改完跑同一套檢查，**比差額**；重點不是「失敗數是不是 0」。
- 比對前先正規化行號／欄號再逐行 diff；數字相同不代表是同一批問題（欄號位移會製造假相同）。
- 改 API：實際打一次正常路徑＋錯誤路徑，檢查 status／response／validation／side effect／log。
- 改畫面：實際開瀏覽器走過主要流程，看 console 與 network（零未預期 error/warning），必要時截圖。允許時優先用 Claude in Chrome／Playwright 實查，而不是靜態推理。
- 沒實測到的不准寫成已驗證。另闢「已知未覆蓋」小節，寫明沒驗什麼、為什麼、替代覆蓋是什麼、**以及它不能證明什麼**。
- 只有走完上述流程才標 `✅ 完成並驗證`。

## 2. 資料誠實性 (Data honesty)

- **永不無聲降級**：實際做的事與使用者以為的不同就要說出來，並附生效值（丟了幾筆、上限多少、實際用了哪個來源）。
- **查不到 ≠ 0**。永遠分得出 `0`／`NULL`／`Not Found`／`Unavailable`／`Error`。寫 `?? 0` 之前先問「這個 0 是量出來的還是湊出來的」。
- 降級狀態要結構化，分類軸是「**使用者現在該做什麼**」（要去要權限 vs 不用做任何事），不是「內部發生什麼」；內部原因另外記。
- 加 `LIMIT`／取樣／截斷／聚合前先答：對應哪個 KPI、天然上限是多少、被省略的資料還辨識得出來嗎。
- 同一畫面上兩個母體不同卻用同樣字眼（數量／狀態／完成率）＝地雷，主動盤查整頁，不等 bug 出現。

## 3. 修到第二次就找結構成因 (Root cause)

- 同型錯誤第一次修問題；**第二次停手**，問「為什麼系統沒擋住第二次」。不要等第三次。
- 流程：找共同原因 → 收斂到單一決定點 → 補一條可執行的稽核指令 → ratchet baseline（變多會紅，變少也要能解釋）。
- 一個修法只救得了你正在看的那幾支檔案，就不是根因修法。先問「偵測器為什麼沒擋住」，修偵測器，逐檔修是最後一步。
- 三道防線互補不擇一：靜態稽核（只看得到字面值）／執行期收集（只看得到被渲染過的）／逐路由巡檢（補前兩者的共同盲區）。路由總數要跟上一輪比對，變少要能解釋。

## 4. 把關機制自身也要被驗證 (Validate the validator)

- 新增 lint rule／audit script／detector／CI check：先注入探針 bug，確認它會紅、**而且紅在正確位置**，再移除探針。第一次沒紅先確認你的破壞真的生效了。
- 「指令沒有輸出」≠「檢查通過」。
- 三件套：① 空跑防護（先斷言掃得到東西）② 偵測規則自身的正反例 ③ 豁免清單每筆附理由，並檢查死條目。
- 機械可驗證的規則寫成測試或稽核指令，不要只寫進文件。守不住的清單比沒有清單更糟，因為讀的人會相信它。

## 5. 單一語意決定點 (Single source of truth)

- 以下全 repo 只能有一個決定點：enum／status／label／color／icon mapping／route 寫法／允許值／時區換算／空值與不可用的顯示。
- 列舉值、顏色、狀態字串從常數檔取，不手寫字面值。
- 不自行發明商業語意（unit／KPI／threshold／aggregation／score）。先問「這個單位對應哪張表、哪一欄」與「有沒有現成欄位已經表達了」。
- 平行陣列一律改成單一 Record／物件陣列，讓「漏一個」變成 type error。要開第二個平行陣列前先答「漏掉的時候誰會告訴我」。

## 6. 半套與假旋鈕 (No half-built)

- 判斷半成品一律先問：**「這個中間狀態，是不是比完全沒有更糟？」** 是的話就不要建。真的要做的那天需要的是完整功能，不要只加回一個列舉值。
- 假旋鈕零容忍：新增設定要從消費端反推，證明它真的被讀到且真的改變行為。查無讀取點就當場刪掉或接上。
- 不留半殘功能。沒有實質作用的開關直接拿掉。

## 7. 東西住哪、要不要新增 (Placement)

- 判斷「這東西住哪」用「**屬於誰**」，不是「幾個呼叫端」。子功能歸母功能；drill-down 不另開頂層 service／router／API。
- 新增檔案是最後手段。優先序：整合進既有檔案 → 用既有抽象 → 用旗標／子命令／模式切換擴充（不動既有預設行為）→ 才新增。新增要能回答「為什麼現有檔案不能承擔這個責任」。
- 共用性明顯的基礎設施（scheduler／pool／cache／logging／monitoring／retry／health check）第一個 commit 就做成通用版，不接受「先拼一個 local 版，之後再重構」。
- 已有的抽象沒用完，先別引新的。少養一個需要被維運的元件。
- 選型第一問：**這個工具會不會吃掉我用來判斷正確性的那個訊號？**（ORM 包掉 driver 錯誤碼、bcrypt 靜默截斷、PTY 讓稽核只看得到按鍵、cache 讓「查不到」看起來像「沒資料」——同一個理由。）

## 8. 技術預設 (Defaults)

- 前端：Vue 3 + TypeScript + Tailwind CSS v4 + Shadcn Vue／Radix Vue。
- 後端：FastAPI／NestJS／Fastify／Gin 依需求選；資料庫預設 PostgreSQL，快取 Redis，其餘依需求選型。
- 不追求完全統一技術棧，但**每個差異都要說得出原因**。
- 圖表照抄 repo 內已經在跑的寫法（series／axis／tooltip／formatter／色票），不自己組參數。UI 的 form／table／dialog／loading／error pattern 同理。

## 9. 快取、時間、日誌 (Runtime)

- Cache 不能是單點故障。重要 cache 要有 fallback：Redis miss／error → primary source →（選配）in-memory；cache 失效不該把整個功能打死。
- 慢變資料（機台清單、設定、參考表、metadata）走 Redis + 長 TTL；in-memory 只當 fallback，不每次 request 重查來源。
- 時間／時區運算一律後端做完，前端只轉型與呈現。前端不可出現 `Date.UTC()`／`dayjs.utc()`。
- Log 要有 level、rotate、模組、必要時 correlation id，以及**完整的原始錯誤與 stack**。禁止 `Something went wrong`；要寫出 what／where／用什麼輸入／原始錯誤是什麼。
- 正式專案要有 lint、type-check、測試。測試優先針對「曾經發生且可能再發生」的錯誤與 fallback／錯誤路徑，不寫只服務單次修改的脆弱特例測試。

## 10. 文件治理 (Docs)

- 專案根目錄只放 `README.md`／`AGENTS.md`／`CLAUDE.md`，其餘一律進 `docs/`；`docs/` 根目錄只放全域文件，其餘分類清楚。
- **`AGENTS.md` 是規則本體**（各家 agent 共讀）；`CLAUDE.md` 只放一行 `@AGENTS.md` 與 Claude 專屬設定，不寫規則。同一條規則只能有一個家。
- 陷阱與警告一律留在 `AGENTS.md`——它經由 `CLAUDE.md` 的 import 每個 session 自動載入。搬進別份文件等於「只在剛好有人去讀它時才生效，而那正是最需要它時不會發生的事」。
- 規則放 `AGENTS.md`；架構描述放 `ARCHITECTURE.md`；API／schema／欄位／路徑放 reference 並標「被指引才讀」。敘事版不准列欄位／API／路徑，否則它會變成第二份會過期的 reference。
- 文件數量固定。新增前先答「既有哪一份不能承擔這個內容」。禁止 PLAN／TASKS／HANDOFF／AUDIT／STATUS／NOTES／TODO／CHANGELOG 這類同義檔增生。
- 長文件開頭放 `§0 接手速覽`：交接狀態、當前驗證基準數字、下一步、以及「動手前只要讀哪幾條就好」。換 session 從「現在做到哪」開始，不是從 README。
- 一份文件超過 300 行就問「這裡面有多少是給人看爽的」。
- 知識優先跟著程式碼走：閾值為什麼是這個數 → 該常數的 docstring；兩張表不可比較 → 兩者的 model 註解；workaround 為什麼不能刪 → 附近的註解。
- 施工完成的追蹤文件 `git rm`，但先把「當時為什麼那樣判斷」抽進守則型文檔或程式碼註解——結論本身反而不是要留的東西。
- 註解清楚明瞭但不冗長，要讓人跟 agent 同時看得懂。

## 11. 複雜任務追蹤 (Tracking)

- 複雜多階段任務在 `docs/` 建實體 MD 追蹤文檔，方便觀看與換 session。
- 第一個 commit 就建起來；之後每段進度與對應程式改動放同一筆 commit，讓每個 commit 自己就是可接續的斷點。
- 進度符號固定 `⬜ 未開始`／`🔄 進行中`／`✅ 完成並驗證`／`⛔ 暫緩`，方便掃視與 grep。
- 待辦要寫「**可觀察的重評觸發條件**」（例：API P95 latency > 500ms 持續 10 分鐘就重評 cache 策略），不寫「以後再說」或「等有需要」。

## 12. Commit 與語言 (Conventions)

- Commit 訊息格式 `<type>: <模組中文名>. <描述>`，模組名用繁體中文，描述寫實際變更。
- **不加任何署名 trailer**（不要 `Co-Authored-By`，不要 `Generated with`）。
- UI 文字、使用者訊息、註解、docstring、developer 文件一律繁體中文；框架與技術術語（endpoint、middleware、scheduler、cache、fallback、router）保留英文。

## 13. AI 協作與 context (Agent)

- Context 是有限的工程資源。策略是**精準搜尋 → 精準讀取 → 局部修改 → 機械驗證**，不要為了方便把整個 repo 讀進 context。
- 本機若有這些工具優先使用：`rg`（全文）、`fd`（檔名）、`sg`／ast-grep（AST，精確找定義並排除字串與註解噪訊）、`jq`（大型 JSON，避免整包 lock 檔進 context）、Playwright CLI、`git`。
<!-- andy-init:option subagent-mode=investigate -->
- 子 agent 負責「**搞清楚**」（掃描 repo、找依賴、定位 root cause、比較既有實作、提供證據），不負責「動手」。實作與最終驗證留在主線，因為證據要留在主線的紀錄裡。
<!-- andy-init:end-option -->
<!-- andy-init:option subagent-mode=implement -->
- 子 agent 可以**實作**，但只接**邊界清楚的工作包**：主線先寫明範圍（可改與不可改的檔案、驗收指令、禁止事項），子 agent 回報改了哪些檔、跑了哪些檢查與原始輸出。
- **最終驗證與 commit 留在主線**：主線重跑 baseline 比差額、守門測試與探針、端到端驗證——證據要留在主線的紀錄裡。子 agent 的「完成」只是待驗證的報告（第 1 條：報告不是事實）。
- 同一個工作樹同時只讓一個子 agent 寫檔；要平行就切成檔案不重疊的工作包。審查類子 agent 一律唯讀。
<!-- andy-init:end-option -->
- 不可逆操作：預設只盤點、要二次確認、確認形式是**重述具體名稱**而不是 yes/no、不能被排程、動作前先留紀錄。可逆性決定嚴格度。

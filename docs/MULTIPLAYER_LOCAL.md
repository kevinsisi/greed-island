# 本機多人港口

入口 `/multiplayer-3d`。這個本機切片以同一場景 50 人為目標，包含共享移動、聊天、地圖與限時修復港口信標。50 人容量規則與同步邏輯已有純測試；HTTP／SQLite、真正多瀏覽器與 50 人網路承載仍未驗證。尚未接正式帳號、正式世界、共享 NPC 或卡牌戰鬥。

## 港口點擊導航

- 在 3D 港口點擊地面設定目的地；導航只參考房間伺服器提供的地圖邊界、障礙物、碰撞半徑與每 tick 步長。建築和玩家不會被當成目的地。
- 角色每次只送方向意圖，伺服器驗證並保存位置。手動移動、重新點選、放開搖桿、斷線或隱藏頁面會取消尚未送出的導航步伐；舊伺服器缺少導航資料時，點地導航會停用，方向鍵與搖桿仍可用。
- 這只覆蓋目前固定港口地圖；完整故事、動態世界、共享 NPC 與卡牌戰鬥仍未整合進多人端。

## 啟動與保留進度

**目前阻擋：**本機缺少 Express、better-sqlite3 等既有後端依賴，完整 server build／啟動尚未完成。安裝已被自動審批拒絕，等待使用者許可；沒有繞過、替換 storage 或以 mock 宣稱成功。以下是依賴就緒後的操作方式，本輪未執行啟動。

先執行 `npm run build:server`，再執行 `npm run start:multiplayer -w @greed-island/server`。啟動程序固定綁定 `127.0.0.1:4179`，不讀正式站或 AI provider 環境設定。

前端以 `npm run dev -w @greed-island/web -- --host 127.0.0.1 --port 4178 --strictPort` 啟動；已有此預覽時直接沿用。開啟 `http://127.0.0.1:4178/multiplayer-3d`。`/mp-api` 僅代理至本機 4179；服務未啟動時會顯示離線，不會轉接原版 `/api`。

伺服器會建立系統暫存目錄下的 `greed-multiplayer-*`，並顯示私人 `credentials.json` 路徑。目錄權限 700、憑證檔 600；預設產生 50 個測試身份，不代表已在線。不要提交憑證、資料庫或 cookie。

新房間可用 `npm run start:multiplayer -w @greed-island/server -- --fixture-count 51` 產生 51 個身份以驗證第 51 位入場拒絕。名單可設 2–1000 人，房間容量仍為 50；名單數、在線容量與事件最低人數各自獨立。`--fixture-count` 不能與 `--data-dir` 合用。

重開同一房間時使用 `npm run start:multiplayer -w @greed-island/server -- --data-dir <原本的暫存目錄>`。省略參數會建立全新的測試房間。重啟會使暫存登入 session 失效；重播使用事件內原名單、設定與資源，既有兩人紀錄不會因新預設而補人、補物資。缺少既有資料庫／憑證／事件時拒絕重新初始化。

使用 IAB 與 Chrome，或其他真正分離的 browser context；同一瀏覽器的普通分頁共用 cookie，不能用來驗收兩個不同帳號。不要修改使用者原本 `/prototype-3d` 的存檔。

## 房間規則

- 伺服器每 100ms 前進一個 tick；每個玩家每 tick 最多移動 0.4m，並檢查邊界與建築碰撞。客戶端只送方向。
- 同一身份最多兩條 SSE 連線，仍只佔一位。最後一條連線中斷後保留席位 10 秒；本人重連取回原席位。登出或 session 到期不保留。在線與保留合計不可超過 50，第 51 個身份在 SSE headers 前取得 `409 ROOM_FULL`。
- 登入本身不取得席位；只有已連入房間的身份可以發出遊戲指令。滿員者等待空位，介面暫停操作。
- 每名玩家起始一份物資。靠近港口信標 2.5m 內才可投入；每個不同玩家限一次。
- 預設至少兩人投入後，開啟 300 tick（正常時鐘下 30 秒）參與窗口，其他旅人可繼續加入。截止的系統 tick 在同一 transaction 完成信標、讓所有參與者各獲得一枚獎勵，含已離線者。相同 commandId 的重送不重複執行；換 commandId 也不能再次貢獻或領獎。
- 聊天上限 240 字，至少間隔五個 tick；訊息作為文字顯示。
- 事件紀錄決定位置、物資、訊息與結果；畫面只做插值。指令回覆只有收件 ACK，不會拿它套用角色或獎勵。普通更新每個 tick 最多廣播一次完整快照；新連線立即收到自己的完整快照。`revision` 是持久事件 sequence，`presenceRevision` 記錄在線／保留席位變化。
- NPC 自主模擬尚未整合多人；原型 NPC 的瀏覽器內演進不能代表共享世界。

## 驗證方式與尚未完成部分

可用既有工具執行：`npm run test -w @greed-island/server -- src/multiplayer/domain.test.ts src/multiplayer/presence.test.ts src/multiplayer/sync.test.ts src/multiplayer/fixtures.test.ts src/multiplayer/fixtureLock.test.ts`，以及前端 `npm run test -w @greed-island/web`、`npm run build:web`。這些不需要啟 HTTP 服務或操作外部資料。

依賴就緒後仍須執行 `http.test.ts`／`runtime.test.ts`、完整 server build、SQLite rollback/reopen、兩個獨立真瀏覽器與 50 個獨立網路 session；量測 tick 延遲、傳輸量、CPU／記憶體、DB 增長。包含重連、滿員、離線參與者與截止時同時請求。不可把 50 個記憶體 callback 當作 50 人承載證據。

登入防護維持同來源 IP 每分鐘最多 20 次嘗試（含成功），使用 scrypt、HttpOnly／SameSite cookie 與原 Origin 邊界。未放寬限制以便測試；50 人承載驗證可分批登入後同時在線。「50 人同時按登入」的產品目標需另定登入容量與正式驗證策略。

目前持續記錄 tick、每次傳完整快照，事件歷史也全部保留。增量同步、DB checkpoint／壓縮與實際主機容量需依量測決定，尚未實作或刪除歷史。這版是可審查的實作 checkpoint，尚未達到多人交付驗收。

## 邊界與後續正式整合

Dedicated entrypoint 不掛原版登入重設、玩家物資命令或 AI agent。正式整合前仍須處理已存在的兩組風險：

1. `packages/server/src/http/auth.ts` 的公開 forgot-password 會回傳 reset token；需另外設計並確認實際的身分驗證與交付管道。
2. 原版 player-action 的物資來源／數量驗證與重複事件投影存在缺口；這個房間沒有修復或沿用該獎勵入口。

這輪不改正式資料、不部署、不新增公開端口、沒有交易／公會／PvP。最新實測結果與未驗項目以 `PROGRESS.md` 的本輪紀錄為準。

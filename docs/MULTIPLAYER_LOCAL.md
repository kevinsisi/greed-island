# 本機多人港口

入口 `/multiplayer-3d`。兩個獨立瀏覽器以兩個測試帳號登入同一房間，可以互見移動、聊天、共同修復港口信標。這是本機整合切片，尚未接正式帳號、正式世界、共享 NPC 或卡牌戰鬥。

## 啟動與保留進度

使用專案既有依賴，先執行 `npm run build:server`，再執行 `npm run start:multiplayer -w @greed-island/server`。啟動程序固定綁定 `127.0.0.1:4179`，不讀正式站或 AI provider 環境設定。

前端以 `npm run dev -w @greed-island/web -- --host 127.0.0.1 --port 4178 --strictPort` 啟動；已有此預覽時直接沿用。開啟 `http://127.0.0.1:4178/multiplayer-3d`。`/mp-api` 僅代理至本機 4179；服務未啟動時會顯示離線，不會轉接原版 `/api`。

伺服器會建立系統暫存目錄下的 `greed-multiplayer-*`，並顯示私人 `credentials.json` 路徑。目錄權限 700、憑證檔 600；兩個帳號皆為測試玩家，不是正式管理員。不要提交憑證、資料庫或 cookie。

重開同一房間時使用 `npm run start:multiplayer -w @greed-island/server -- --data-dir <原本的暫存目錄>`。省略參數會建立全新的測試房間。重啟會使暫存登入 session 失效，使用同一份測試帳密重新登入即可讀回遊戲進度。

使用 IAB 與 Chrome，或其他真正分離的 browser context；同一瀏覽器的普通分頁共用 cookie，不能用來驗收兩個不同帳號。不要修改使用者原本 `/prototype-3d` 的存檔。

## 房間規則

- 伺服器每 100ms 前進一個 tick；每個玩家每 tick 最多移動 0.4m，並檢查邊界與建築碰撞。客戶端只送方向。
- 每名玩家起始一份物資。靠近港口信標 2.5m 內才可投入；每個不同玩家限一次。
- 兩人投入後，同一 transaction 完成信標並讓每人獲得一枚獎勵。相同 commandId 的重送不重複執行；換 commandId 也不能再次貢獻或領獎。
- 聊天上限 240 字，至少間隔五個 tick；訊息作為文字顯示。
- 事件紀錄決定位置、物資、訊息與結果；畫面只做插值。重連讀完整快照。`revision` 是持久事件 sequence，`presenceRevision` 僅記錄線上連線變化。
- NPC 自主模擬尚未整合多人；原型 NPC 的瀏覽器內演進不能代表共享世界。

## 邊界與後續正式整合

Dedicated entrypoint 不掛原版登入重設、玩家物資命令或 AI agent。正式整合前仍須處理已存在的兩組風險：

1. `packages/server/src/http/auth.ts` 的公開 forgot-password 會回傳 reset token；需另外設計並確認實際的身分驗證與交付管道。
2. 原版 player-action 的物資來源／數量驗證與重複事件投影存在缺口；這個房間沒有修復或沿用該獎勵入口。

這輪不改正式資料、不部署、不新增公開端口、沒有交易／公會／PvP。最新實測結果與未驗項目以 `PROGRESS.md` 的本輪紀錄為準。

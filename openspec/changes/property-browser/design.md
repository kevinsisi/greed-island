## Context

Greed Island 是 React SPA + Node.js/TypeScript 後端的平台，已有遊戲 tile 地圖、NPC、戰鬥等核心系統。外部已有完整的房仲刊登系統（B端後台），提供 REST API 查詢案件資料。本設計實作 C 端房產瀏覽顯示層，與遊戲平行存在於同一 SPA 中。

## Goals / Non-Goals

**Goals:**
- C 端使用者在 `/properties` 頁面瀏覽真實台灣地圖上的房產 marker
- 點 marker 彈出 popup 顯示案件摘要（照片、價格、格局、坪數、聯絡房仲）
- popup 篩選器可依地區、價格、格局、型態、坪數、屋齡過濾
- B 端房仲擁有 `agent` 角色標示，可綁定遊戲內 NPC 作為代理人
- 被綁定的 NPC（如 central.broker.gui）在 AI dialog 中可回應房產問題
- 頂部導覽列新增「房產」入口，可與遊戲頁面切換

**Non-Goals:**
- 不實作房仲後台刊登/編輯/管理功能（既有系統已有）
- 不影響既有 game simulation、event log、NPC engine、combat、經濟系統
- 不將房產資料寫入 simulation event log
- 不實作收藏/預約看屋/金流功能（未來可擴充）

## Decisions

1. **Leaflet.js + OpenStreetMap tiles** — 免費、無需 API key、React 整合成熟（react-leaflet）。MapLibre GL 雖圖资更豐富，但需要自行托管 tileserver，維運成本較高。
2. **篩選器為 popup modal** — 不佔用地圖空間，使用完即關閉，符合「地圖優先」的瀏覽體驗。
3. **地圖 popup 為案件詳情** — 點 marker 彈出資訊卡，不需跳轉頁面，保持瀏覽連續性。
4. **後端 API bridge 層** — 封裝既有房仲系統 API，統一回傳格式、錯誤處理、快取，前端不直接呼叫外部 API。
5. **`agent` role 僅為標示用途** — 不影響既有 `player`/`gm`/`admin` 權限邏輯，B 端功能仍由既有系統處理。
6. **NPC 綁定 agent 帳號** — 新增 `agent_npc_bindings` 表儲存 agentId ↔ npcId 對應。NPC dialog prompt 中注入該 agent 的案件摘要，讓 AI 能在對話中自然地提及案件。
7. **NPC 回覆房產問題** — 沿用既有 `local-shout` / `dialog` AI 流程，不另建機制。AI prompt 附加 property context block，限制 AI 只引用注入的案件，不可虛構。

## Risks / Trade-offs

- [Leaflet 在台灣的圖資準確度不如 Google Maps] → OpenStreetMap 台灣圖資已足夠顯示街廓層級，且無使用限制
- [既有房仲 API 可能變動] → API bridge 層做 response normalisation，降低耦合
- [大量 marker 導致地圖卡頓] → Leaflet marker clustering（`leaflet.markercluster`）緩解

## Migration Plan

1. 安裝前端依賴（leaflet, react-leaflet, leaflet.markercluster）
2. 實作 API bridge route `/api/properties/*`（後端）
3. 實作 `PropertyBrowserPage` 頁面（地圖 + marker + popup + 篩選器）
4. 擴充 account role 支援 `agent`
5. 建立 `agent_npc_bindings` 表與綁定 API
6. 實作 NPC AI prompt property context 注入
7. 導覽列加入「房產」入口
8. 整合測試與 smoke test

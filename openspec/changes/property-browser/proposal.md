## Why

Greed Island 平台已有完整的房仲刊登系統（B端後台），但缺乏讓一般客戶（C端）在遊戲內瀏覽房產的顯示層。使用者需要在遊戲中直觀地在地圖上瀏覽真實台灣房產案件，讓遊戲世界與真實房產資訊結合，提升平台黏著度與房仲案件曝光。

## What Changes

- 新增 `/properties` route，顯示真實台灣地圖（OpenStreetMap）與房產 marker
- 既有房仲系統 API 串接，唯讀顯示案件資料
- 地圖 marker 點擊彈出 popup 顯示案件摘要（照片、價格、格局、坪數、聯絡資訊）
- popup 篩選器：地區（縣市/鄉鎮）、價格區間、格局、型態、坪數、屋齡
- 帳號系統擴充 `agent` role（B端房仲角色）
- B端房仲可綁定遊戲內 NPC（如 central.broker.gui）作為代理人
- 被綁定的 NPC 在 local-shout / dialog 中，AI prompt 注入該房仲的案件資料
- NPC 可回應房產相關問題，並在對話中嵌入房產卡片
- 頂部導覽列新增「房產」入口

## Capabilities

### New Capabilities

- `property-browser-map`: 真實台灣地圖 + 房產 marker 瀏覽、篩選、詳情 popup
- `property-api-bridge`: 既有房仲系統 API 代理層，提供唯讀案件查詢
- `account-role-agent`: 帳號角色擴充，新增 `agent` 角色供 B 端房仲使用
- `npc-property-agent`: NPC broker 綁定真人房仲，在遊戲內以 AI 對話介紹案件

### Modified Capabilities

- （無變更既有 spec）

## Impact

- **前端**: 新頁面 `packages/web/src/pages/PropertyBrowserPage.tsx`，依賴 leaflet/react-leaflet
- **後端**: 新 API route `/api/properties/*` 作為代理層；accounts table 新增 `agent` role
- **依賴**: leaflet, react-leaflet, @types/leaflet（前端）；既有房仲系統 API（後端）
- **不影響**: 既有 game simulation、event log、NPC engine、combat 等核心系統

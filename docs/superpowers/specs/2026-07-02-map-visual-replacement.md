# 主視覺地圖替換設計

日期：2026-07-02  
狀態：提案（設計文件，不動 code）  
前提：像素風不是選項，所有方案必須 100% 脫離 pixel art  
關聯：2026-07-02-ui-engagement-redesign.md（HUD/WorldSignal/MindSheet 架構保留）

---

## 1. 現有 Phaser 地圖盤點 — 必須保留的資訊功能

下列是程式碼掃描後確認地圖目前實際承載的資訊功能，任何替換方案不得丟失這些。

### 1.1 Hub WorldMap（MapScene）

| 功能 | 資料來源 | 說明 |
|---|---|---|
| 20×15 行政區格線（District Grid）| `DISTRICT_GRID` + `DISTRICTS[id]` | 區域空間關係、相鄰性 |
| 派系色彩疊加 | `areaOverlay.dominantFaction` | 紫/金/綠/灰四派系，邊框色塊 |
| 安全度疊加 | `areaOverlay.safety` | safety < 40 → 暗紅警示 |
| 經濟度疊加 | `areaOverlay.economy` | economy > 70 → 金色光暈 |
| 區域名稱標籤 | `def.nameZh` / `nameEn` | 含施工鎖定狀態 |
| 施工進度徽章 | `constructionActivities[]` | 進度 X/Y、剩餘 tick、施工者名稱 |
| 生態物種徽章 | `ecologyByTile[]` | 最多 2 種物種 emoji + 數量；捕食者警告 |
| 遷徙箭頭 | `ecologyByTile[].migrations` | 離港（橙）/ 抵港（綠）方向箭頭 |
| NPC sprite + 位置 | `npcs[].districtId` + `subCol/subRow` | 區內散佈，含跨區旅行路徑動畫（18s tween）|
| NPC 狀態信號 | `npcs[].activity`, `mood`, `recentUtterance` | 活動 emoji（右肩）、聊天氣泡（28字截斷）|
| 玩家 avatar + 位置 | `localStorage gi:hub:player-pos:v1` | 可移動，位置持久化 |
| 多人玩家 avatar | `players[]` | 青綠色姓名標籤，1800ms tween |
| 區域入口互動 | `onAreaEnter(districtId)` | 點擊區域 → navigate |
| NPC 互動入口 | `onNpcInteract(npcId)` | 點擊 NPC → dialog |

### 1.2 Area Map（AreaScene）

| 功能 | 資料來源 | 說明 |
|---|---|---|
| 15×10 地形格線（40px/cell）| `terrainMask.ts` + biome config | 陸地/碼頭/岸邊/淺水/深水 |
| 道路 + 路面標線 | `AREA_DECORATIONS[tileId].roadCells` | 虛線中心標 |
| 建築物 + 狀態 | `buildings[].{state, glyph, health}` | 施工/廢棄/受損/可進入 |
| 建築入口偵測 | `onBuildingEnter` + 距離判定 | 靠近顯示 ✋ 泡泡 |
| NPC avatar + 狀態 | 同上，多加 `cognitiveLine`、`behaviorIcon` | 心情色彩姓名標、健康圖示（🤕 health<30）|
| NPC 語音氣泡 | `recentUtterance` | 持續顯示 AI 文字，字框 120px wrap |
| 卡片掉落物 | `drops[].{rank, ticksRemaining}` | 顏色分級（SS金/H灰），alpha 閃爍 |
| 生態疊加層 | `ecology.{animals, plants, fishery, migrations}` | 植株密度、動物行為狀態機、漁場進度條 |
| 天氣 VFX | `weather` (clear/overcast/mist/storm/breeze) | 視覺濾鏡 + 粒子效果 |
| 玩家移動 + 多人 | 同 Hub | 含 z（樓層）座標 |
| 捕魚入口 | `fishery` + `onFish()` | 底部進度條，點擊觸發 |
| 出口互口 | `onExit()` | 左下角固定 |

### 1.3 Building Interior（BuildingScene）

| 功能 | 資料來源 | 說明 |
|---|---|---|
| 室內地板格線 | `building.interior.{cols, rows}` | 36px/cell，依建築類型著色 |
| 室內道具 | `building.interior.props[].{col, row, glyph}` | emoji 置於格子中心 |
| NPC 環形排列 | `buildingSceneNpc[]` | Owner NPC 金色光環 |
| 出口 | 固定左下角 | 🚪 |

---

## 2. 三個替換方案評估

### 方案 A：風格化向量地圖（推薦）

**視覺語言**：18世紀航海圖 × 廢墟寶港夜景。羊皮紙底色（#1a1510）、墨線刻蝕邊界、ember（#f39c20）光暈暖光打在活躍區域、tide（#4db8c8）冷光點綴水域。區域是多邊形 SVG 填色塊，NPC 是具名 token 圓點（帶姓名首字），移動用 CSS transition。

**技術選型**：SVG + React + CSS transition。零新依賴。

| 評估面 | 評分 | 說明 |
|---|---|---|
| 實作成本 | 中 | Hub：SVG 重寫 MapScene；Area：CSS Grid + 絕對定位 NPC；Building：純 CSS Grid（最簡）|
| 資料相容性 | 高 | NPC subCol/subRow → 直接映射 SVG 座標；districtId → polygon；遷徙箭頭 → SVG marker |
| 手機體驗 | 高 | SVG 天然響應式，viewBox 縮放；觸控 hitbox 用 padding 控制 |
| salvage-lit 契合 | 高 | 刻蝕線條感、ember 光暈、羊皮紙底——與現有 .gi-panel 設計語言一致 |

---

### 方案 B：抽象節點世界

**視覺語言**：區域是發光節點卡，NPC 頭像在節點間流動的光點。重敘事輕空間。

| 評估面 | 評分 | 說明 |
|---|---|---|
| 實作成本 | 低 | 只是卡片 + 圓點動畫 |
| 資料相容性 | 低 | NPC subCol/subRow 完全無用；遷徙箭頭變抽象；生態疊加層失去空間意義 |
| 手機體驗 | 高 | 節點卡易觸控 |
| salvage-lit 契合 | 中 | 氣氛可對，但空間感完全喪失；「世界地圖」消失了 |

**不推薦**：喪失地圖的空間感，等同把地圖換成 NPC 列表。

---

### 方案 C：插畫地景分層視差

**視覺語言**：每區域有大插圖背景（AI 生成或美術手繪），NPC 以標記層浮在上方。

| 評估面 | 評分 | 說明 |
|---|---|---|
| 實作成本 | 高 | 需要每個區域的插圖素材（15+ 個）；Hub 世界地圖仍需另外設計 |
| 資料相容性 | 中 | NPC 標記層可做，但 Hub 世界地圖的空間格局難以插畫化 |
| 手機體驗 | 中 | 插圖在手機上縮圖後難以辨認細節 |
| salvage-lit 契合 | 高 | 視覺衝擊最強，但美術資產是瓶頸 |

**不推薦（現階段）**：美術資產瓶頸使可行性低；未來有美術資源時可作為 Area 地景升級。

---

## 3. 推薦方案 A — 詳細設計

### 3.1 視覺描述

#### Hub WorldMap 視覺

底色：`#1a1510`（濃縮棕黑，羊皮紙老化版）。整張地圖用 SVG，viewBox 維持 `0 0 800 600`。

**區域填色**：
- 基底填色用 `def.color` 的去飽和深色版（+30%暗度）
- 活躍（可進入）區域加 ember 內發光 `<feGlow>` filter，模擬油燈透光的羊皮紙感
- 區域邊界：`stroke="#6b5e4a"` 粗 1.5px 墨線，轉角微微不規則（path 偏移 ±0.5px）模擬手繪

**派系疊加**：
- tide_hunters（藍-紫）→ `fill="rgba(77,184,200,0.18)"` + `stroke="#4db8c8"` 2px 虛線邊框
- guild（金）→ `fill="rgba(243,156,32,0.15)"` + `stroke="#f39c20"` 2px 實線
- free_runners（綠）→ `fill="rgba(110,200,100,0.15)"` + `stroke="#6ec864"` 2px 點線
- civilian（灰）→ 無疊加，只有淡灰邊框

**安全/經濟疊加**：
- safety < 40：`fill="rgba(180,30,30,0.12)"` 紅色暈，中心到邊緣漸變（radial gradient）
- economy > 70：角落的 ember 金色 `<circle r="8" opacity="0.3">` 暈點

**NPC token**：
- 基本形：`<circle r="9">` 填 `npc.color`（服務器授權顏色），`stroke="#fff5b8"` 1px
- 中心：姓名首字，`font-family: "Big Shoulders Display"` 白色
- 右肩：活動 emoji（小號，12px）
- chat 氣泡：`<text>` 在 token 上方，截 20 字，ember 色底 `#2d1f0a`，rounded rect
- 滑過（hover）/ 點選：ember glow 放大，token scale 1.2
- 移動動畫：CSS `transition: cx 1.8s ease-in-out, cy 1.8s ease-in-out`（SVG attribute animated via React state）
- 跨區旅行：token 沿預設路線以 path animation 移動（`animateMotion`），18s，opacity 0.7

**玩家 token**：  
- `<polygon points="...">` 六角形（區分於 NPC 圓點）
- tide 色 `#4db8c8` 填色，ember 描邊
- 姓名在下方，Big Shoulders Display，cream `#fff5b8`

**生態徽章**：
- 右上角：物種 emoji + `×N` 文字，depth 最高層，`font-size: 11px`
- 捕食者警告：閃爍的紅色圓環 + ⚠ SVG icon

**遷徙箭頭**：
- SVG `<line>` + `<marker>` arrowhead
- 離港：`stroke="#c87920"` 橙，arriving：`stroke="#4ec860"` 綠
- 箭頭指向鄰近區域中心，opacity 0.75

**施工徽章**：
- `<g>` group：圓角矩形背景 + 文字（進度 X/Y + 剩餘 tick）
- 🔨 emoji + 施工者名（最多 2 個），慢速上下浮動 CSS animation

---

#### Area Map 視覺

替換為 CSS Grid + 絕對定位圖層，告別 Phaser canvas。

**地形格線**：
- `display: grid; grid-template-columns: repeat(15, 1fr); grid-template-rows: repeat(10, 1fr)`
- 每格 `<div>` 帶 background-color（對應 terrainMask COLOR_FOR_TERRAIN 的去像素色版）：
  - land → `#2a2218`（深土黃）
  - pier → `#1e2a30`（濕木藍灰）
  - shore → `#1a2830`（岸石暗藍）
  - shallow_water → `#0f1f2a`（淺水墨藍）
  - open_water → `#0a1520`（深海墨）
  - road → `#252018`（砂石路）
- 格線邊框：`border: 1px solid rgba(255,255,255,0.04)`（幾乎看不到的細線，空間感保留）
- 無 pixel art bevel，無 dither overlay

**NPC marker（絕對定位圖層）**：
- 容器：`position: relative; overflow: hidden` 蓋在 grid 上方
- NPC：`<div className="gi-npc-token">` position absolute，`left: col/15 * 100%`，`top: row/10 * 100%`
- 基本形：`width: 32px; height: 32px; border-radius: 50%` 圓點，顏色來自 `npc.color`
- 心情色：border 顏色 → mood < 30 灰，mood >= 30 cream
- 健康低（< 30）：🤕 icon 在 token 左上角
- 活動 emoji：token 右肩，12px
- 語音氣泡：token 上方 `<div>` ember 色圓角氣泡，AI utterance 文字（最多 60 字，overflow clip）
- 移動：CSS transition `left`, `top` 4.5s ease-in-out（對應現有 4500ms tween）
- 點擊 hitbox：`min-width: 44px; min-height: 44px`（.gi-touch 規範）

**建築**：
- `<div>` 絕對定位，emoji glyph + 圓角框 `.gi-panel`
- 狀態色環：operational=ember，damaged=rust，under_construction=黃，abandoned=灰
- 進度條（施工中）：底部細條，背景 ground，填色 ember，`width: ${progress}%`
- 靠近偵測：同現有邏輯，顯示 ✋ badge（CSS pseudo-element 或額外 `<span>`）

**掉落物**：
- `<div>` 絕對定位，rank 色系圓角矩形
- SS=金 `#f39c20`、S=橙 `#e07030`、A=紫 `#9060d0`、H=灰 `#606060`
- CSS keyframe 閃爍：`@keyframes drop-pulse { 0%, 100% { opacity: 0.9 } 50% { opacity: 0.5 } }`

**生態層**：
- 植株：每種植株一個小圓形 chip（底色 tide-tinted），`saturationPct` 控制 opacity（0.55–1.05 對應）；chip 下方 density bar（同 CSS 進度條）
- 動物（≤5）：emoji span，絕對定位，CSS animation 隨機位移（代替現有 behavior state machine）
- 動物（≥6）：3 個 emoji + `×N` chip
- 遷徙：絕對定位 chip，emoji + ↘/↗ + ×count，arriving=綠框，departing=橙框
- 漁場：底部固定高度條（`position: absolute; bottom: 0; left: 0; right: 0; height: 8px`），density 控制寬度，collapsed 時 rust 色

**天氣 VFX**（保留，改為純 CSS）：
- clear：wrapper 加 `filter: brightness(1.08)` + 右上角 CSS radial-gradient 暖光斑
- overcast：`filter: brightness(0.82) saturate(0.7)` + 3 個慢移 `<div>` 雲層（backdrop-blur 霧化效果）
- mist：`backdrop-filter: blur(1px)` + `::before` 白色 opacity overlay + 15 個雨點 `<div>`（CSS animation）
- storm：暗色 overlay + 60 個密集雨點 + 隨機 `box-shadow` 閃電效果
- breeze：12 個 🍃 span，CSS `@keyframes drift-across`

---

#### Building Interior 視覺

最簡替換，純 CSS Grid。

- `display: grid; grid-template-columns: repeat(cols, 36px); grid-template-rows: repeat(rows, 36px)`
- 地板：依建築 type 設定 `background-color`（restaurant 深棕、library 深青、temple 深靛）
- 道具：emoji `<div>` 居中定位在對應格子
- NPC：極座標環形排列，CSS 計算 `transform: rotate() translateX()`，circle token 形式同 AreaMap
- Owner NPC：`box-shadow: 0 0 12px 3px #ffd966`（金色光暈）
- 出口：左下角固定 `.gi-panel` 按鈕

---

### 3.2 Component 技術選型

| 新 Component | 取代 | 技術 | 依賴 |
|---|---|---|---|
| `WorldMapSvg` | `PhaserGame` / `MapScene.ts` | React + SVG + CSS transition | 零新依賴 |
| `AreaMapView` | `AreaPhaserGame` / `AreaScene.ts` | React + CSS Grid + 絕對定位 | 零新依賴 |
| `BuildingView` | `BuildingPhaserGame` / `BuildingScene.ts` | React + CSS Grid | 零新依賴 |

**刪除的 Phaser 檔案**（替換完成後）：
```
packages/web/src/game/
├── PhaserGame.tsx          ← 刪除
├── AreaPhaserGame.tsx      ← 刪除  
├── BuildingPhaserGame.tsx  ← 刪除
├── MapScene.ts             ← 刪除
├── AreaScene.ts            ← 刪除
├── BuildingScene.ts        ← 刪除
├── pixelWorld.ts           ← 刪除（pixel texture 生成，不再需要）
├── pixelAnimals.ts         ← 刪除（像素動物狀態機）
├── characterAvatar.ts      ← 刪除（程序像素 humanoid）
├── hubCharacterVisualState.ts  ← 刪除
├── areaCharacterVisualState.ts ← 刪除
├── terrainMask.ts          ← 保留（地形類型邏輯，CSS color 查表仍需要）
├── npcVisuals.ts           ← 保留（ACTIVITY_GLYPH map 仍需要）
├── speciesPalette.ts       ← 保留（物種 emoji/color）
├── districts.ts            ← 保留（DISTRICT_GRID / DISTRICTS / DistrictId）
├── decorations.ts          ← 保留（區域裝飾資料）
├── areaGrid.ts             ← 保留（格線計算工具）
├── hubNpcMotion.ts         ← 保留（NPC motion mode 判定邏輯）
└── hubWalkability.ts       ← 刪除（tile walkability 是 Phaser 碰撞用的）
```

**不引入的依賴**：
- 不引入 GSAP（現有 CSS transition 足夠）
- 不引入 D3（SVG 手寫，不需要 D3 的佈局算法）
- 不引入 react-spring（CSS transition 足夠）
- Phaser 可在 Hub/Area/Building 三個 component 全部替換後從 `package.json` 移除

---

### 3.3 與現有 HubPage / AreaPage 的替換計畫

**HubPage**：
```
現況：<PhaserGame ... /> → 替換為 <WorldMapSvg ... />
Props interface 保持一致（npcs, areaOverlays, ecologyByTile, onAreaEnter, onNpcInteract...）
唯一差異：onPositionChange 格式可能需要調整（Phaser 用 {x,y,z}，SVG 用 {districtId, col, row}）
```

**AreaPage**：
```
現況：<AreaPhaserGame ... /> → 替換為 <AreaMapView ... />
Props interface 保持一致（tileId, npcs, drops, buildings, weather, ecology...）
```

**BuildingPage / BuildingModal**：
```
現況：<BuildingPhaserGame ... /> → 替換為 <BuildingView ... />
```

玩家位置持久化：從 `localStorage gi:hub:player-pos:v1`（Phaser 格式 {x,y,z}）改為 `gi:hub:player-loc:v2`（`{districtId, col, row}`），版本 key 不同，避免讀舊格式崩潰。

---

### 3.4 分階段實作步驟

每個階段可獨立部署驗收，不需等下一階段完成。

---

#### Phase M1 — Hub 世界地圖（WorldMapSvg）

**目標**：把 HubPage 的 800x600 Phaser canvas 換成等面積的 SVG 地圖，功能對等。

**步驟**：
1. 建立 `WorldMapSvg.tsx`（`packages/web/src/components/map/`）
   - Props interface 與 `PhaserGame.tsx` 對齊（除 `controlsEnabled` 可暫省略）
   - 渲染 20×15 district 格線（SVG `<rect>` per district，從 `DISTRICT_GRID`）
   - 區域填色 + 邊界墨線
2. 加入派系/安全/經濟疊加（SVG fill + stroke overlay）
3. 加入 NPC token（`<circle>` + 首字 + activity emoji + chat bubble）
4. 加入 CSS transition 移動（state 更新 → cx/cy → transition）
5. 加入遷徙箭頭（SVG `<marker>` arrowhead）
6. 加入生態徽章（district 右上角）
7. 加入玩家 token（六角形）+ 多人 peer token
8. 加入施工徽章
9. 在 HubPage 用 `<WorldMapSvg>` 取代 `<PhaserGame>`，刪除 PhaserGame import
10. 刪除 `PhaserGame.tsx`, `MapScene.ts`, `characterAvatar.ts`, `hubCharacterVisualState.ts`, `hubNpcMotion.ts`, `hubWalkability.ts`, `pixelWorld.ts`（Hub 用到的）

**驗收**：Hub 頁面可見區域地圖，NPC 可點擊開 dialog，點擊區域可 navigate，無 Phaser canvas

---

#### Phase M2 — Area 地圖（AreaMapView）

**目標**：把 AreaPage 的 Phaser canvas 換成 CSS Grid + 絕對定位圖層。

**步驟**：
1. 建立 `AreaMapView.tsx`（`packages/web/src/components/map/`）
   - Props interface 與 `AreaPhaserGame.tsx` 對齊
   - 地形格線（CSS Grid，15×10，color 從 `terrainMask.ts` 查表）
2. NPC marker 圖層（絕對定位，CSS transition 移動）
3. 建築渲染（glyph + state 色環 + 進度條）
4. 掉落物渲染（rank 色 + 閃爍）
5. 生態疊加層（植株 chip + 動物 emoji + 漁場進度條 + 遷徙 chip）
6. 天氣 VFX（CSS filter + animation）
7. 玩家 / 多人 token
8. 在 AreaPage 用 `<AreaMapView>` 取代 `<AreaPhaserGame>`
9. 刪除 `AreaPhaserGame.tsx`, `AreaScene.ts`, `areaCharacterVisualState.ts`, `pixelAnimals.ts`

**驗收**：Area 頁面可見地形地圖，NPC 可點擊，掉落物可拾取，天氣 VFX 可見，無 Phaser canvas

---

#### Phase M3 — Building Interior（BuildingView）

**目標**：把建築室內 Phaser canvas 換成純 CSS Grid。

**步驟**：
1. 建立 `BuildingView.tsx`（`packages/web/src/components/map/`）
2. CSS Grid 地板 + 道具 emoji
3. NPC 環形排列 + owner 金色光暈
4. 出口按鈕
5. 取代 `BuildingPhaserGame`，刪除相關 Phaser 檔案

**驗收**：進入建築可看到室內場景，NPC 可互動，出口可用，無 Phaser canvas

---

#### Phase M4 — 移除 Phaser 依賴（清理）

**目標**：三個 Phase 完成後，清除 Phaser 及所有 pixel art 遺物。

**步驟**：
1. 確認 `packages/web/` 無任何 `phaser` import 殘留（`grep -r "phaser" packages/web/src`）
2. 從 `packages/web/package.json` 移除 `phaser` 依賴
3. 刪除已確認無用的支援檔案（見 3.2 刪除列表）
4. 更新 `BUILD.md` / `README.md` 中對 Phaser 的引用

**驗收**：`npm run build` 無 phaser 相關 warning，bundle size 明顯下降

---

## 4. 美術約束（與現有設計語言銜接）

所有新 map component 必須使用：
- `.gi-panel`：NPC 氣泡、徽章、建築框、掉落物容器的背景/邊框
- `font-display`（Big Shoulders Display）：NPC token 首字、區域名稱標籤、施工徽章
- `font-data`（JetBrains Mono）：數值（× 數量、百分比、tick 數）
- ember `#f39c20`：活躍區域光暈、玩家 token 描邊、guild 派系、可交互 hover state
- rust `#c0532a`：安全警告、damaged 建築、掉落物剩餘時間低警示
- tide `#4db8c8`：tide_hunters 派系、水域色調、玩家 token 填色
- ground `#2a1f14`：地圖底色
- `rounded-sharp`（2px 圓角）：所有框元素
- `shadow-panel`（內高光 + 投影）：NPC 氣泡、徽章
- `Icon.tsx`（currentColor, stroke 1.6）：入口提示 icon、出口 icon、警告 icon

**禁止使用**：
- 任何 pixel art 材質生成（`generateTexture`、`Graphics.fillRect` pixel-by-pixel）
- 任何 bitmap/spritesheet（PNG/WebP 精靈圖）
- Phaser 的任何渲染模式
- 任何刻意像素化的字型或視覺效果

---

## 5. 開放問題（待確認後進 OpenSpec）

1. **Hub 玩家移動方式**：現有 Phaser 用鍵盤 WASD / 點擊空格移動。SVG 換掉後，Hub 移動應改為「點擊區域進入」（直接 navigate），還是保留「在地圖上行走」（拖動 SVG viewport）？建議前者——Hub 的主要用途是「選擇去哪個區域」，行走只是 Phaser 遺留。

2. **Area 玩家移動方式**：Area 的移動目前是 Phaser 鍵盤 WASD。換成 CSS Grid 後，移動改為「點格子移動」（click-to-move）？還是拖動 NPC 到目標格子？建議「點格子移動」——更適合手機，且與現有 touch 規範一致。

3. **遷徙箭頭動畫**：現有是靜態箭頭，換成 SVG 後可加 CSS `stroke-dashoffset` 流動動畫（螞蟻線效果，ember/綠 交替）。是否要加？

4. **NPC 語音氣泡顯示策略**：Area 地圖上有時 NPC 很多，氣泡會重疊。建議在距離玩家 3 格內才顯示氣泡，否則只顯示 💬 icon。是否可接受？

5. **Phaser 完全移除時間點**：M1/M2/M3 可分三個 PR 分別部署，Phase M4 清理可在三個 Phase 都上線驗收後再做。是否有時間壓力？

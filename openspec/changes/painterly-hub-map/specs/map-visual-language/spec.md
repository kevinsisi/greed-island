# map-visual-language — hub 俯視城市地圖 + 子地圖互動修復

## ADDED Requirements

### Requirement: Hub 世界地圖為俯視城市(與子地圖同一視覺語言)

Hub 世界地圖(WorldMapSvg)SHALL 以「一座有機海島城市的俯視圖」呈現,採用**與子地圖(AreaMapSvg)相同的視覺語言**:自然地形材質、建築正面立面(`BuildingFacade`,窗光=狀態)、人物剪影(`FigureBody`)、街道網。純呈現層,不動 Command/Event/API/replay;既有互動(click-to-move、進入街區)與匯出純函式 SHALL 全部保留。三個不變量:

1. **不是格子**:街區 SHALL 為不規則的有機鄰里(Voronoi 分割並圓角),彼此相連成一座島,而非矩形方塊網格。
2. **像子地圖**:建築 SHALL 用 `BuildingFacade`(牆/屋頂/暖窗)、人物 SHALL 用 `FigureBody` 剪影渲染,地形用自然材質色(草/石/沙/水)加決定論紋理標記 — 與 AreaMapSvg 一致,不得是抽象純色塊。
3. **有城市結構**:SHALL 有連接各街區的街道網、穿過市中心的潮汐河、港口與沼澤的水域。

#### Scenario: 街區為有機鄰里而非方塊

- **WHEN** 渲染 hub 地圖
- **THEN** 每個街區的填色範圍 SHALL 由該街區 seed 的 Voronoi cell(圓角)決定,邊界不規則且彼此相連

#### Scenario: 沿用子地圖的建築與人物

- **WHEN** 街區有在場 NPC 或建築
- **THEN** 建築 SHALL 以 `BuildingFacade` 立面呈現、人物 SHALL 以 `FigureBody` 剪影呈現,並在手機 390px 寬仍可辨識

#### Scenario: 靜幀可見的活躍度與任務焦點

- **WHEN** 某街區在場 NPC 數為全圖最高,或為最新世界事件(payload.tileId/tile/to)所在
- **THEN** 該街區 SHALL 有視覺焦點(暖光脈動 / 藍色任務星標),真實資料驅動

### Requirement: 子地圖點地移動不被建築判定框吃掉

AreaMapSvg 的建築物 SHALL NOT 以過大的判定框覆蓋可走地面而攔截「點地移動」的點擊。立面寬 SHALL 有上限(≤ ~2.5 格),非可進入的建築 SHALL 設 `pointer-events: none` 讓點擊穿透到地形格。地圖容器 SHALL 允許手機沿垂直方向捲動頁面(`touch-action: pan-y`,而非 `none`)。

#### Scenario: 點空地可移動

- **WHEN** 玩家(controlsEnabled)點擊一個可走地形格
- **THEN** 玩家 token SHALL 移動到該格中心,不被建築 overlay 攔截(建築判定框 ≤ ~110px,非可進入建築 pointer-events:none)

#### Scenario: 手機可捲頁

- **WHEN** 手機使用者在地圖上沿垂直方向滑動
- **THEN** 頁面 SHALL 可正常捲動(`touch-action: pan-y`)

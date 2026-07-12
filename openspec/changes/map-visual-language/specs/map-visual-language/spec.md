# map-visual-language — 地圖五元素視覺契約

## ADDED Requirements

### Requirement: 地形可讀性
街區地圖(AreaMapSvg)的地形 SHALL 滿足三個不變量:
1. `path` 是全圖最亮的可走地形(玩家視線沿路走)。
2. 水域(`open_water`/`shallow_water`)是唯一藍色主導(B > R)的地形色;陸地一律暖色系。
3. ember(#f39c20 系)光只用於「活的東西」(窗光、燈、玩家光環),不進地形底色。

每種地形 SHALL 有專屬決定論紋理(FNV-1a by col,row):波浪/苔點/沙點/石板縫/稜線/木板縫;沙-水交界 SHALL 以鋸齒咬合消除矩形感。

#### Scenario: 亮度對比
- **WHEN** 渲染任何街區
- **THEN** 地形亮度分佈於約 6%–42%,且 `terrainToCssColor('path')` 亮度大於其他可走地形

### Requirement: 人形 token
NPC/玩家/peer SHALL 以人形剪影呈現(頭/肩/袍/腳+腳下影),派系色上在披風;職業 medallion 縮小為頭頂徽記(NpcGlyph 沿用)。玩家 SHALL 有 ember 披風+胸前羅盤星+呼吸光環。既有互動(漂移/氣泡/低血量/低心情/nearby 光暈/點擊)SHALL 全部保留。

#### Scenario: 狀態表達
- **WHEN** NPC lowHealth
- **THEN** 披風描邊轉 rust;lowMood 時披風轉灰、名字變暗

### Requirement: 建築立面(窗光=狀態)
建築 SHALL 以正面立面呈現(牆+屋頂+門+窗),貼地渲染;狀態寫在光裡:operational 兩窗亮、damaged 一窗亮+屋頂缺口、under_construction 骨架+進度條、abandoned 全黑。屋頂色依建築 type 查表。

#### Scenario: 狀態→光
- **WHEN** building.state 變化
- **THEN** `litWindowsFor(state)` 回傳 2/1/0 對應亮窗數

### Requirement: 動物側面剪影
動物 SHALL 以側面剪影呈現,speciesId 依關鍵字歸入 archetype(deer/heavy/quadruped/bird/fish/crawler),顏色沿用 speciesPalette;地圖動物群以剪影群(≤3 隻+×N)取代 emoji chip;漁場以躍水魚+密度條呈現。狩獵/捕魚點擊互動 SHALL 保留。

#### Scenario: archetype fallback
- **WHEN** 未知 speciesId
- **THEN** `archetypeFor` 回傳 `quadruped`

### Requirement: 世界層版面主從
Hub SHALL 以世界地圖為主畫面(滿版舞台),「世界現在」與「情境面板」為壓在地圖上的可收合浮層;手機維持單欄。

#### Scenario: 桌機浮層
- **WHEN** 視窗 ≥ sm
- **THEN** 世界地圖佔滿內容欄寬,面板浮層可收合

### Requirement: 戰鬥與生活同語言
戰鬥 HUD SHALL 內含對峙舞台(玩家 ember 人形 vs 敵方 rust 人形/動物剪影,低血量披風變暗);生態儀表板動物列 SHALL 附側面剪影。純呈現層,不動 Command/Event。

#### Scenario: 戰鬥低血量
- **WHEN** 任一方 hp 低於 30%
- **THEN** 該方剪影披風色轉暗(視覺告警),hp bar 與行動按鈕行為不變

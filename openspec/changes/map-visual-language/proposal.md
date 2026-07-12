## Why

v0.98.42–45 的向量地圖重寫(map-M2~M5)解決了 Phaser 依賴,但實際上線後「完全不可玩」:

1. **地形沒有對比** — `AreaMapSvg` 九種地形色全部落在亮度 4%–16% 的近黑色帶(`#0a1520`~`#2a2218`),街區頁實看是一片黑格子,分不出水/路/草地/岩。
2. **人不是人** — map-M4 把人形剪影刪掉換成 medallion 圓章;圓章是好的「徽記」但是符號不是身體,一個街區只剩幾枚硬幣。
3. **建築與動物沒有形體** — 建築是色框+glyph chip,動物是 emoji chip;世界的居民被降維成資料列。
4. **版面是儀表板不是遊戲** — Hub 世界地圖被塞成三欄佈局中欄約 270px 的小掛件,事件流搶走主角位置。

使用者已在視覺提案(mockup artifact,2026-07-12)確認方向:「可以,就照這樣去做,此遊戲有戰鬥與一切生活,記得也一併做上去」。

## What Changes

確立「頂視地形 + 正面立繪居民」的地圖視覺語言(經典 JRPG 構圖),延續 ui-visual-foundation 的夜之航海圖世界觀(ember 主光/tide 副光/parchment 標題),純呈現層、不動任何 Command/Event/API:

- **地形**: `AreaMapSvg` 色票撐開至亮度 6%–42%(path 為全圖最亮可走面、水為唯一藍色系),每種地形加 FNV-1a 決定論紋理層(波浪/苔點/沙點/石板縫/稜線/木板縫),沙-淺水交界海岸咬合消矩形感。
- **人形**: 新增 `tokenFigure.tsx` 共用元件 — 頭/肩/袍/腳四段剪影+腳下橢圓影+派系披風色+parchment 描邊;職業 medallion 縮小為頭頂徽記;玩家 ember 呼吸光環。AreaMapSvg / BuildingSvg / WorldMapSvg peer 全部換用;NPC 漂移、說話氣泡、低血量/低心情指示等既有邏輯沿用。
- **建築物**: 新增 `buildingFacade.tsx` — 牆體+屋頂+門+會亮的窗(operational 全亮/damaged 半亮/under_construction 進度條+骨架/abandoned 全黑),取代色框 glyph chip;窗光即狀態。
- **動物**: 新增 `animalFigure.tsx` 側面剪影(鹿/豬/魚/鳥/預設四足),依 `speciesPalette` 分類渲染取代 emoji chip;沿用可點擊狩獵/漁場互動。
- **世界**: HubPage 版面反轉 — WorldMapSvg 從中欄掛件變滿版舞台,「世界現在」與「世界正在發生」改可收合浮層;聚落亮度=活躍度。
- **戰鬥+生活**: CombatHud/戰鬥入口與市集/生態等生活面板套同一色彩與 token 語言(人形剪影、ember/tide 分工)。

## Capabilities

### New Capabilities
- `map-visual-language`: 地圖五元素(地形/人形/建築/動物/世界)的視覺契約 — 色票亮度區間、紋理規則、token 解剖、窗光=狀態、版面主從。

### Modified Capabilities
- _None(純呈現層,無事件/API/replay 影響)。_

## Impact

- **Code**: `packages/web/src/components/map/{AreaMapSvg,WorldMapSvg,BuildingSvg,tokenMedallion}.tsx`、新增 `{tokenFigure,buildingFacade,animalFigure}.tsx`、`packages/web/src/pages/HubPage.tsx`、戰鬥/生活面板樣式。
- **行為/契約**: 無變動。互動(click-to-move、NPC interact、狩獵、捕魚、進建築)全部保留。
- **測試**: 既有 WorldMapSvg/AreaMapSvg/BuildingSvg 純函式測試保持綠;新增 token/facade 純函式測試。

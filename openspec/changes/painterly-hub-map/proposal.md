## Why

v0.99.0 的 `map-visual-language` 把 hub 世界地圖(`WorldMapSvg`)改成有機島嶼,但實際上線後使用者回報「主要地圖依然不是我要的效果」。重新評估發現 hub 執行力沒到位:

1. **島嶼近黑** — hub 仍用 `ISLAND_FILL` 常數(亮度 8%–16%),且**忽略每區的身分色**(`DISTRICTS[id].color` 的綠/藍/紫/紅),九座島擠成一片深色塊;履歷首圖(截這張地圖)幾乎全黑。
2. **沒有地形感** — 島是平色多邊形 + 1.5px 描邊,無起伏、無質感、無海岸,設計文件宣稱的「航海圖 × 藏寶港」氛圍沒被畫出來。
3. **雜訊蓋過氛圍** — 🦋×5 / ⚠ emoji 生態徽章在地圖尺度是噪點而非魅力。
4. **看不出活著** — 這專案賣點是即時模擬,但靜幀裡感受不到世界在運轉。

使用者於視覺方向確認:**C 俯視插畫風 + B 演出活的世界**,最終交付**靜態截圖**(履歷用)。

## What Changes

只動 hub 世界地圖 `WorldMapSvg` 的**呈現層**,延用 `map-visual-language` 已定的世界觀與 token 語言(ember 主光 / tide 副光 / parchment 標題),不動任何 Command/Event/API/replay,不改互動(click-to-move、NPC interact、areaOverlays):

- **海**:深青徑向漸層 + `feTurbulence` 波光 caustics + 天光/暗角,取代近黑背景。
- **島嶼(有光的陸地)**:恢復每區身分色作地形底 + per-district 垂直漸層塑形 + 落海陰影(`feDropShadow`)+ 海岸淺灘光暈(blur)+ painterly 顆粒(turbulence 裁切到島形)+ 沙色海岸線 + 頂光體積。
- **手繪地標**:依 biome 決定論 scatter(松林/雪峰/屋舍/晶簇/沙丘/斷柱/棧橋/蘆葦),取代 hub 的 emoji 生態徽章。
- **活的世界(靜幀可見)**:在場 NPC 數驅動暖窗火亮度;最活躍街區罩暖光脈動;海航線流動、遷徙箭頭沿用。

## Capabilities

### New Capabilities
- _None。_ 本 change 精修既有 `map-visual-language` capability 在 hub(WorldMapSvg)的執行力,不改其契約(色票語言、token 解剖、窗光=狀態、版面主從),故不新增 delta spec。

### Modified Capabilities
- _None(純呈現層,無事件/API/replay 影響;視覺契約沿用 map-visual-language)。_

## Impact

- **Code**:`packages/web/src/components/map/WorldMapSvg.tsx`(視覺層重寫;新增 `mixNum`/`lightenNum` 純函式;移除 hub emoji 生態徽章與 `visualForSpecies` import)。
- **行為/契約**:無變動。既有 `WorldMapSvg.test.ts` 16 純函式測試保持綠。
- **交付**:hub 部署後截線上實站,更新 resume-demo `projects.ts` 的 greed-island 截圖(整頁儀表板構圖)。

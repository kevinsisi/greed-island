# map-visual-language — hub 俯視插畫地圖(painterly 精修)

## ADDED Requirements

### Requirement: Hub 世界地圖為俯視插畫海島

Hub 世界地圖(WorldMapSvg)SHALL 以「黃昏俯視的發光群島」呈現,而非近黑平面色塊。純呈現層,不動 Command/Event/API/replay,既有互動(click-to-move、NPC interact、areaOverlays)與匯出純函式 SHALL 全部保留。三個不變量:

1. **海是海**:背景 SHALL 為青色系水面(徑向漸層 + turbulence 波光),不得為近黑純色。
2. **島是有光的陸地**:每個街區 SHALL 以自己的身分色(`DISTRICTS[id].color`)為地形底,並具備海岸線、落海陰影與體積光影(不得回退為單一近黑填色);ember 暖光只給「活的東西」(窗火、活躍街區光暈、玩家光環),不進地形底色。
3. **地標非 emoji**:街區地標 SHALL 以決定論的手繪向量(依 biome:松林/雪峰/屋舍/晶簇/沙丘/斷柱/棧橋/蘆葦)呈現;hub 地圖不得用 emoji 生態徽章作為地標。

#### Scenario: 島嶼保留身分色

- **WHEN** 渲染任一街區島嶼
- **THEN** 其地形填色 SHALL 由 `DISTRICTS[id].color` 導出(漸層塑形),而非共用的近黑色

#### Scenario: 靜幀可見的活躍度

- **WHEN** 某街區在場 NPC 數為全圖最高
- **THEN** 該街區 SHALL 罩上暖光並脈動,且其暖窗火亮度隨在場 NPC 數提高(即使在靜態截圖也看得出世界在運轉)

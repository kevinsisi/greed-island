## 1. 地形(AreaMapSvg)

- [x] 1.1 替換 `SUBCELL_CSS`/`LAND_CSS` 為提案色票(亮度 6%–42%;path 最亮可走面;水唯一藍系)
- [x] 1.2 新增決定論紋理層 `TerrainDetail`(FNV-1a):波浪/苔點/沙點/石板縫/稜線/木板縫
- [x] 1.3 沙-淺水交界海岸咬合(消矩形感)

## 2. 人形(tokenFigure)

- [x] 2.1 新增 `tokenFigure.tsx`:FigureToken(頭/肩/袍/腳剪影+影子+披風色+徽記)與 PlayerFigure(ember 光環)
- [x] 2.2 AreaMapSvg NPC/玩家/peer 換用;漂移、氣泡、低血量/心情、nearby 光暈沿用
- [x] 2.3 BuildingSvg 室內 NPC/玩家換用
- [x] 2.4 WorldMapSvg peer/玩家 token 換用(NPC 仍用小徽記——世界層縮尺)

## 3. 建築(buildingFacade)

- [x] 3.1 新增 `buildingFacade.tsx`:牆+屋頂+門+會亮的窗;state→窗光;construction→進度+骨架
- [x] 3.2 AreaMapSvg 建築 chip 換立面;nearby ✋ 提示與點擊進入沿用
- [x] 3.3 BuildingSvg 室內同語言(地板色票/家具)

## 4. 動物(animalFigure)

- [x] 4.1 新增 `animalFigure.tsx`:鹿/豬/魚/鳥/四足預設側面剪影
- [x] 4.2 AreaMapSvg 動物群 emoji chip 換剪影群(數量=隻數,cap 3+×N);狩獵點擊沿用
- [x] 4.3 漁場改水面魚躍剪影+密度條

## 5. 世界(HubPage)

- [x] 5.1 WorldMapSvg 滿版舞台;聚落光暈=活躍度
- [x] 5.2 「世界現在」/「世界正在發生」浮層化(可收合)

## 6. 戰鬥+生活

- [x] 6.1 戰鬥 HUD/入口套 token 語言
- [x] 6.2 市集/生態面板色彩統一

## 7. 驗證與交付

- [x] 7.1 `tsc --noEmit` + web vitest 全綠;新增純函式測試
- [x] 7.2 headless 截圖驗證(1440×900/390×844)
- [x] 7.3 PROGRESS.md 更新 + version bump + push

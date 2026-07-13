# Tasks — painterly-hub-map (hub 俯視城市地圖 + 子地圖互動修復)

純呈現層 / 前端 bug 修復。延用 map-visual-language 視覺契約。

## 1. Hub 地圖:俯視城市(像子地圖)

- [x] 1.1 打掉「九個方塊」——街區改為有機 Voronoi 鄰里(圓角、相連成島)
- [x] 1.2 沿用子地圖語言:`BuildingFacade` 建築立面(暖窗)+ `FigureBody` 人物剪影
- [x] 1.3 自然地形材質色(草/石/沙/水)+ 決定論紋理標記
- [x] 1.4 街道網(核心↔各街區 + 環路)、潮汐河、港口/沼澤水域、有機海岸線
- [x] 1.5 街區名大字級 banner + 真實在場人數 badge
- [x] 1.6 焦點/任務層:最熱鬧街區暖光脈動、最新事件(payload.tileId/tile/to)藍色任務星標
- [x] 1.7 桌機浮層(世界現在/情境)預設收合,地圖乾淨

## 2. 子地圖 bug 修復(AreaMapSvg)

- [x] 2.1 建築立面寬鉗制(≤~2.5 格),非可進入建築 `pointer-events:none` — 修「點地無法移動」(判定框 344→110、覆蓋 87%→解除)
- [x] 2.2 地圖容器 `touch-action: none → pan-y` — 修手機無法捲頁

## 3. 驗證與交付

- [x] 3.1 `tsc -b && vite build` clean;web vitest 271 pass;WorldMapSvg 匯出契約不變
- [x] 3.2 手機 390px(iPhone 12)實測:點空地移動成功(50%/55%→30%/35%)、touch-action=pan-y 可捲頁、hub 城市地圖逐區可辨識
- [x] 3.3 version → 0.100.0(sync);PROGRESS 更新
- [ ] 3.4 push → Deploy Dev 部署 hunter → 驗證線上為新城市地圖
- [ ] 3.5 截線上實站 → 更新 resume-demo projects.ts greed-island 截圖 + caption;印 PDF 驗排版

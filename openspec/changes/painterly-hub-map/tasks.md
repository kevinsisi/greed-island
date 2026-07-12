# Tasks — painterly-hub-map (俯視插畫風 hub 地圖精修)

純呈現層,tracker-only(無 specs delta,延用 map-visual-language 視覺契約)。

## 1. 海與大氣

- [x] 1.1 深青徑向漸層海面(`wm-sea`)取代近黑 `#07111e`
- [x] 1.2 `feTurbulence` 波光 caustics 疊層 + 天光漸層 + 暗角(`wm-vignette`)

## 2. 島嶼(有光的陸地)

- [x] 2.1 恢復每區身分色作底,per-district 垂直漸層塑形(頂端提亮/底部壓深)
- [x] 2.2 落海陰影 `feDropShadow` + 海岸淺灘光暈(`feGaussianBlur`)
- [x] 2.3 painterly 顆粒 `wm-grain`(turbulence `feComposite in SourceAlpha` 裁切島形)
- [x] 2.4 沙色海岸線 + 共用 `wm-sheen` 頂光體積

## 3. 手繪地標(決定論 scatter)

- [x] 3.1 `TerrainMotifs`:forest 松林 / mountain 雪頂峰 / port·town 屋舍暖窗 / ley 晶簇 / flats 沙丘 / ruin 斷柱 / dock 棧橋小舟 / marsh 蘆葦
- [x] 3.2 移除 hub emoji 生態徽章(🦋⚠)與 `visualForSpecies` import

## 4. 活的世界(靜幀可見)

- [x] 4.1 `activityByDistrict`(在場 NPC 數 + 施工)→ `TownLights` 暖窗火亮度
- [x] 4.2 `hottestDistrict` 暖光 + `wm-hot` 脈動環;海航線 `wm-lane` 流動;遷徙箭頭沿用
- [x] 4.3 NPC token 加地面暗影,在亮島上可讀

## 5. 驗證與交付

- [x] 5.1 `tsc -b && vite build` clean(修 `fill={base}` number→`numToHex`)
- [x] 5.2 web vitest 271 pass(WorldMapSvg 契約不變)
- [x] 5.3 本機 dev(proxy 指 hunter 真實資料)逐島 headless 截圖驗證
- [x] 5.4 version bump 0.99.1 + sync;PROGRESS 更新
- [ ] 5.5 push → Deploy Dev 部署 hunter → 驗證線上為新地圖
- [ ] 5.6 截線上實站 → 更新 resume-demo `projects.ts` greed-island 截圖

## 1. Design token（tailwind.config.ts）

- [x] 1.1 擴充配色：加入 `tide`（oxidized-teal 冷副光）、`sand`（parchment 標題暖白）、`ground.950`、`ember.300`
- [x] 1.2 字體分工：`font-display`=Big Shoulders Display+Noto Sans TC；新增 `font-data`=JetBrains Mono；`font-body`=Noto Sans TC
- [x] 1.3 新增 `shadow-panel/raised/glow-ember/glow-tide`、`letterSpacing.eyebrow`、`animation rise/glow-pulse`

## 2. 字體載入（index.html）

- [x] 2.1 Google Fonts 加載 Big Shoulders Display（保留 JetBrains Mono / Noto Sans TC）

## 3. Component 層（styles/index.css）

- [x] 3.1 atmosphere 背景：分層 radial 光暈 + vignette + 低透明 SVG 顆粒（`body` + `::before`，z-index 低於 `#root`）
- [x] 3.2 `.gi-panel` 改帶 `shadow-panel` + backdrop + hover 暖框；新增 `.gi-panel-interactive`/`.gi-panel-raised`
- [x] 3.3 新增 `.gi-heading`（非大寫海報標題）、`.gi-eyebrow`（小型大寫琥珀 kicker）、`.gi-data`（等寬 tabular）、`.gi-tag-tide`

## 4. 圖示系統

- [x] 4.1 新增 `Icon.tsx`：12 個一致 stroke 線性圖示（hub/codex/timeline/ecology/market/social/profile/account/gmWorld/admin/settings/more）

## 5. App chrome（GameShell.tsx）

- [x] 5.1 NavItem `glyph`→`icon: IconName`；NAV_ITEMS 全改圖示鍵；nav 渲染 `Icon`
- [x] 5.2 DesktopRail：active route 加 glow + 左側 accent bar，label 改 display 字體
- [x] 5.3 MobileTabBar：glyph→Icon（含 More）
- [x] 5.4 數值/版本改 `font-data`（PlayerResources、VersionTag）；BrandMark 加 glow + sand 標題

## 6. 驗證與收尾

- [x] 6.1 `npm run build:web`（tsc -b + vite）clean
- [x] 6.2 `npm run build`（server + web）clean
- [ ] 6.3 本機 preview 截圖：**環境限制無法 settle**（頁面健康、fonts loaded、eval 正常，截圖工具逾時）；改以 live 部署為權威視覺確認
- [ ] 6.4 更新 PROGRESS.md + commit（已做）；push/部署時機待使用者確認後，由 live 視覺驗收

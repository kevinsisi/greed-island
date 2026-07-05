## Context

前端為 React + Vite + Tailwind，已有集中 design token（`tailwind.config.ts`）與複用 component class（`styles/index.css` 的 `.gi-*`），世界地圖為暖色 Phaser 8-bit 像素藝術。問題不在工程粗製，而在美學方向：扁平無縱深、滿場大寫等寬字、Unicode 字元當圖示，整體像後台。因 token/component 已統一，從這層改即可全站生效。

## Goals / Non-Goals

**Goals:** 一次改 token+component+chrome 即全站升級質感；建立可長期遵循的視覺契約（避免回退 mono-everywhere）；橋接 UI 與暖色像素世界。

**Non-Goals:** 不逐頁重寫；不改後端/資料流/行為/API；不換 UI 框架；不引入重量級動畫庫（CSS-only 微互動）。

## Decisions

### D1：在 token 與 component 層改，而非逐頁
- 全站既用 `font-display` 與 `.gi-panel`，故改其定義即全站生效。`font-display` 由 mono 改為海報體後，所有既有標題即時去 mono 觀感，無需動頁面。
- **理由**：最小改動面、最大覆蓋、最低回歸風險。

### D2：字體三分工，數值與標題分流
- `font-display`=Big Shoulders Display（標題/標籤，characterful condensed）；`font-data`=JetBrains Mono（**僅**數值/版本/id，tabular 對齊）；`font-body`=Noto Sans TC。
- **理由**：等寬只適合對齊數字；用在標題就是「debug console」感。分流後標題有遊戲感、數值仍整齊。CJK 一律 fallback Noto Sans TC。

### D3：縱深用「頂部內高光 + 柔投影」而非圓角
- 保留 `rounded-sharp`（2px，刻意的銳利風格），改用 `shadow-panel`（inset 高光 + drop）讓面板像實體金屬板；active/互動加 `glow-ember`。
- **理由**：銳角是好的差異化選擇；缺的是「光」。加光與層次比改圓角更對味，也呼應「夜間燈火salvage港」。

### D4：atmosphere 背景（分層光暈 + vignette + 顆粒）
- body 用 fixed 分層 radial gradient（右上 amber 光、左下 tide 光）+ vignette + 極淡 SVG noise（`::before`，pointer-events:none，z-index 低於 UI）。
- **理由**：純色 `#0c0a09` 死板；分層光暈給氛圍與深度且零額外請求（inline SVG data URI）。

### D5：一致線性圖示系統取代 Unicode glyph
- `Icon.tsx`：24×24、currentColor、stroke 1.6 的統一線性圖示，nav 以 `IconName` 取代 glyph 字串。
- **理由**：`◈ ☷ ⬡` 粗細/風格不一、像占位符；統一 stroke 圖示立刻拉高精緻度，且隨 currentColor 繼承 active/hover 色與 glow。

## Risks / Trade-offs

- **[全域 `font-display` 改動波及誤用為數值的地方]** → 已在 chrome 把數值改 `font-data`；其餘頁面數值多為內文，影響輕微；後續逐頁採用 `.gi-data`。
- **[Big Shoulders 為 Latin-only]** → CJK 自動 fallback Noto Sans TC（既有），中文標題改以 Noto 粗重量呈現，不破版。
- **[webfont 體積/載入]** → 沿用既有 Google Fonts `display=swap`，僅多一個 family；首屏以 fallback 顯示再 swap。
- **[atmosphere/陰影對低階裝置]** → 皆為 GPU 便宜的 gradient/box-shadow；noise 為單張 120×120 重複的小 data URI。

## Migration Plan

純呈現層；無資料遷移。部署即生效；rollback=revert。驗證：`npm run build`（tsc -b + vite）clean；live 部署為權威視覺確認（本機 preview 截圖工具在此環境無法 settle，非程式問題）。

## Open Questions

- Big Shoulders Display 是否為最終 display 選擇，待 live 視覺確認後可換（僅需改 token + index.html 一處）。

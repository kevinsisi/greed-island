## Why

操作介面讓人「沒有玩的慾望」：全站幾乎零視覺縱深（極少陰影/漸層/動畫），近直角純框線像 wireframe；滿場大寫等寬字（JetBrains Mono）+ Unicode 幾何字元（`◈ ☷ ≡ ⬡`）當導覽圖示，整體像「debug console / 後台」而非奇幻冒險遊戲；冷硬工業灰與暖色像素世界各走各的，缺乏遊戲感與焦點層次。

## What Changes

確立一套「salvage-lit treasure port at night」視覺基礎，集中在 design token + component 層 + app chrome，一次改、全站生效（不逐頁重寫）：

- **配色擴充**：在既有 amber(ember) 主光之外加入 oxidized-teal(`tide`) 冷副光與 parchment 暖白(`sand`) 標題色，橋接暖色像素世界；保留 moss/rust 狀態色。
- **視覺縱深**：新增 `shadow-panel/raised/glow-ember/glow-tide` token；`.gi-panel` 改為帶頂部內高光 + 柔和投影 + hover 暖框的「實體面板」；body 背景改為分層 radial 光暈 + vignette + 細顆粒，取代死板純色。
- **字體分工**：`font-display` 改為characterful condensed 海報體(Big Shoulders Display)＋ Noto Sans TC fallback；新增 `font-data`(JetBrains Mono) **僅供數值/版本**對齊；`font-body` 維持 Noto Sans TC。新增 `.gi-heading`(非大寫海報標題) 與 `.gi-eyebrow`(小型大寫琥珀 kicker) 取代「大寫等寬當標題」。
- **真圖示系統**：新增 `Icon` 元件（一致 stroke 線性圖示，24×24 currentColor），取代 GameShell 的 Unicode 幾何字元 nav glyph。
- **chrome 微互動**：desktop rail active route 加琥珀 glow + 左側 accent bar；品牌標記加 glow；資源/版本數值改 `font-data` 等寬對齊。
- 新增 `animation: rise / glow-pulse` 供進場與強調使用。

不改任何後端、資料流、API 契約或頁面行為；純呈現層。

## Capabilities

### New Capabilities
- `ui-visual-foundation`: 前端視覺基礎設計契約 —— 配色角色（amber 主光 / tide 副光 / sand 標題 / 狀態色）、字體分工（display 海報體 / data 等寬僅數值 / body）、面板縱深與 chrome 微互動、一致線性圖示系統。

### Modified Capabilities
- _None._

## Impact

- **Code**: `packages/web/tailwind.config.ts`（token：色彩/字體/陰影/動畫）、`packages/web/index.html`（載入 Big Shoulders Display）、`packages/web/src/styles/index.css`（atmosphere 背景、`.gi-panel`/`.gi-heading`/`.gi-eyebrow`/`.gi-data`/`.gi-tag-tide`）、`packages/web/src/components/common/Icon.tsx`（新）、`packages/web/src/components/layout/GameShell.tsx`（圖示、active glow、字體分工）。
- **行為/契約**：無變動（純樣式）。無事件、無 API、無 replay 影響。
- **後續（非本change）**：各內容頁逐步採用 `.gi-heading`/`.gi-eyebrow` 取代殘留的大寫等寬標題；全域 `font-display` 改動已讓現有標題即時去除「mono debug」觀感。

## ADDED Requirements

### Requirement: 字體角色 SHALL 分工，等寬僅供數值

前端 SHALL 提供三個字體角色：`font-display`（characterful 海報體，供標題與標籤）、`font-data`（等寬，**僅**供數值/版本/id 等需對齊的資料）、`font-body`（內文）。標題 MUST NOT 使用等寬字營造「debug console」觀感。CJK 字元 SHALL fallback 至 Noto Sans TC。

#### Scenario: 標題與數值使用不同字體角色
- **WHEN** 渲染區塊標題與其旁的數值（如金幣數）
- **THEN** 標題 SHALL 用 `font-display`、數值 SHALL 用 `font-data`（tabular 對齊）

### Requirement: 介面 SHALL 具備視覺縱深與氛圍背景

面板 SHALL 透過頂部內高光 + 柔和投影呈現實體層次（`shadow-panel`/`raised`），互動/啟用態 SHALL 有 glow 強調（`glow-ember`/`glow-tide`）。全域背景 SHALL 為分層光暈 + vignette（+ 細顆粒），不得為單一純色死板背景。

#### Scenario: 面板有縱深而非純框線
- **WHEN** 渲染 `.gi-panel`
- **THEN** 其 SHALL 帶陰影層次（非僅 1px 框線）

#### Scenario: 啟用態有 glow 強調
- **WHEN** 導覽項為當前路由
- **THEN** 該項 SHALL 顯示 amber glow 與 accent 標記

### Requirement: 導覽 SHALL 使用一致線性圖示系統，不得用 Unicode 幾何字元當圖示

導覽與主要動作 SHALL 使用統一 stroke 風格的線性圖示（`Icon` 元件，currentColor 繼承色彩與狀態）。MUST NOT 以 Unicode 幾何字元（如 `◈ ☷ ⬡`）充當圖示。

#### Scenario: 導覽項渲染線性圖示
- **WHEN** 渲染側欄或底部導覽
- **THEN** 每項 SHALL 顯示 `Icon` 線性圖示，且其色彩隨 active/hover 狀態變化

### Requirement: 配色 SHALL 有暖主光 + 冷副光 + 暖白標題的角色分工

配色 SHALL 以 amber(ember) 為暖主光、oxidized-teal(tide) 為冷副光、parchment(sand) 為標題暖白，並保留 moss/rust 狀態色。MUST NOT 退回單一 accent + 全灰階的單調配置。

#### Scenario: 標籤支援暖/冷兩種 accent
- **WHEN** 使用 `.gi-tag-ember` 與 `.gi-tag-tide`
- **THEN** 兩者 SHALL 分別呈現暖琥珀與冷青的可區辨外觀

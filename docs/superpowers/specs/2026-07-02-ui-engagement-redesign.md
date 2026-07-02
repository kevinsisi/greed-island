# UI Engagement Redesign — 設計提案

日期：2026-07-02  
狀態：提案（待使用者確認後進入 OpenSpec）  
關聯：SP1 求生需求地基（2026-06-30-survival-actor-core-design.md）、ui-visual-foundation-refresh（已實作）

---

## 1. 診斷：為什麼「難玩、無聊」

### 1.1 當前畫面架構（現況）

```
HubPage（主畫面）：
  ┌─ 標題列（800×600 標示）
  ├─ PhaserGame canvas（全寬 800×600）← 主視覺
  ├─ 按鈕列（進入區域 | 文明面板）
  ├─ SinceLastVisitPanel（彈窗，登入時一次性）
  └─ NpcDialog（彈窗，點擊 NPC 時）

AreaPage（區域頁）：
  ┌─ Phaser 區域地圖（佔滿視口）
  ├─ 上方：返回 + 區域名稱
  └─ 下方 Tab：場景敘事 / NPC / 紋卡 / 事件 / 鄰近玩家

NpcDialog（NPC 互動）：
  ┌─ NPC 名稱 + 信任分 + tier 標籤
  ├─ 意圖按鈕（打招呼 / 詢問 / 交易 / 離開）
  └─ 對話歷史
```

### 1.2 遊戲設計語言分析

**目標感（Goal Clarity）：缺失**  
玩家打開畫面看到一張地圖。地圖上有會動的 NPC，有區域。但沒有一個明確的問題：「現在我應該做什麼？為什麼要做？」Greed Island 世界法則說「玩家只是世界中的 actor」——但 actor 沒有感受到任何 push。沒有張力，就沒有目標。

**回饋迴路（Feedback Loop）：斷裂**  
玩家：走小人 → 點 NPC → 讀對話文字 → 點離開 → 走小人。沒有看到「行動→世界改變→得到/失去」。紋卡、事件都存在，但藏在 Tab 背後，不是「回饋」是「查詢」。SP1 的求生需求條即將改變這件事，但 HUD 位置/呈現方式決定它是「裝飾」還是「張力引擎」。

**張力（Stakes）：缺失**  
什麼都沒有在倒計時。沒有「我不在時會有什麼代價」。SinceLastVisitPanel 存在，但作為一次性彈窗、內容混雜（紋卡+壓力+事件），缺少「我切身相關」的鉤子。

**資訊層級（Information Hierarchy）：倒置**  
最大的視覺是地圖（最高層），但地圖本身是「世界在哪裡」的空間索引，不是「現在最重要的事」。最重要的資訊（求生狀態、世界在發生什麼、我能做什麼）藏在地圖之後。

**NPC 智慧：完全不可見**  
BeliefProjection（NPC 的主觀信念）、IntentProjection（NPC 的意圖堆疊與學習權重）已實作，但 UI 完全沒有暴露。NpcDialog 是一個聊天視窗——你以為你在跟一個 JSON 規則表說話，不是跟一個有自己目標、正在盤算事情的智慧體互動。這是最大的差異化點，卻完全被浪費了。

---

## 2. 設計原則

### 2.1 張力優先（Tension-First）

每次打開畫面，前 30 秒必須讓玩家感受到「有事情正在發生，而我的狀態有影響」。求生 HUD 的衰退感是核心引擎——必須在視覺上佔有強存在感，而不是角落小條。

### 2.2 智慧可見（Intelligence-Legible）

NPC 的 Hermes 等級智慧必須從 UI 上可讀。玩家不需要讀 spec，只需要看到「Mira 現在很焦慮，她覺得鹽沼缺糧，正在盤算去碼頭問行情」就能感受到她不是道具。

### 2.3 世界一直在動（World-Keeps-Moving）

離線衰退、NPC 自主行動、世界事件——這些「世界不等你」的特性是差異化賣點，必須主動被展示在界面上，而不是藏在彈窗或查詢 Tab 後面。

### 2.4 行動→後果的閉環（Action-Consequence Loop）

每個可做的行動必須在 UI 上顯示：代價是什麼、預期效果是什麼、當前世界狀態是否使這個動作更好或更壞。這是 SP2–SP3 的核心，但資訊架構必須從現在就預留它的位置。

---

## 3. 手機 + 電腦雙形態策略

### 3.1 Breakpoint 策略

使用既有 Tailwind breakpoint：
- **mobile < sm (640px)**：單欄，直向，地圖佔視口上方，HUD 緊接其下，動作在底部
- **desktop ≥ sm (640px)**：地圖居中，左/右面板展開

不新增自定義 breakpoint，用 `sm:` 即可。

### 3.2 觸控 vs 滑鼠差異

| 操作面 | 手機 | 電腦 |
|--------|------|------|
| NPC 互動入口 | 點擊地圖 sprite → 底部 sheet 向上滑出 | 點擊地圖 sprite → 右側面板展開 |
| 求生 HUD | 橫條，緊貼地圖下方，全寬 | 左側面板，垂直排列 |
| 世界信號流 | 地圖下 HUD 下，單列卡片，可滑動 | 左側面板，HUD 下方，垂直滾動 |
| 動作按鈕 | 固定底部 bar，4 個主要動作，44px min | 左下方，較多選項，hover 可顯示說明 |
| NPC 智慧面板 | sheet modal，上滑展開，有分頁 | 右側 slide-in panel，分欄 |

### 3.3 44px 觸控目標

既有 `.gi-touch` class 強制 `min-h-[44px]`，繼續沿用。地圖 NPC sprite 點擊區需確保有足夠 hitbox（已由 PhaserGame 控制，確認即可）。

---

## 4. 核心畫面提案

### 4.1 主畫面（WorldStage）

#### 手機佈局（< sm）

```
┌─────────────────────────────────┐ ←  0px
│ ⬡ 潮鳴市   ·  ● 世界運轉中      │ ← 36px 頂列（精簡，不搶焦點）
├─────────────────────────────────┤
│                                 │
│                                 │
│     PHASER MAP  (像素世界)      │ ← ~50% viewport height
│     NPC 走動、生態疊加、         │   地圖維持現有邏輯
│     派系色彩、遷徙箭頭           │
│                                 │
├─────────────────────────────────┤
│ 🩸 VIGOR     ████████████░░  84 │ ← SurvivalHud strip (56px)
│ 🍖 NOURISHMENT  █████░░░░░  48  │   低於閾值時 rust pulse glow
│   「溫飽尚可，體況良好」         │   一行狀態文字
├─────────────────────────────────┤
│ ──────── 世界現在 ──────────── │ ← WorldSignal strip (可展開)
│ ⚠ 掠食者接近：煙嵐山北          │   預設顯示 1-2 則最緊要訊號
│ 📉 糧食短缺：鹽沼外環           │   點 → 展開完整 WorldSignal feed
└─────────────────────────────────┘
│ [進入區域]  [採集]  [休息]  […] │ ← ActionBar (固定底部, 56px)
└─────────────────────────────────┘
```

#### 桌機佈局（≥ sm）

```
┌──────────────┬──────────────────────┬─────────────────┐
│ 左側面板     │                      │ 右側面板        │
│ (220px)      │  PHASER MAP          │ (280px)         │
│              │  (中央主視覺)        │                 │
│ 🩸 VIGOR     │                      │ 情境面板（狀態）│
│ ████████ 84  │                      │ —可能是：       │
│ 🍖 NOUR.     │                      │ • NPC 智慧面板  │
│ █████░░  48  │                      │ • 區域資訊      │
│ 狀態文字     ├──────────────────────┤ • 世界事件流    │
│              │ [進入區域][採集][休息]│                 │
│ ── 世界現在 ─│ ← ActionBar          │                 │
│ ⚠ 掠食者    │                      │                 │
│ 📉 糧食短缺  │                      │                 │
│ ── 更多事件 ─│                      │                 │
│ (scrollable) │                      │                 │
└──────────────┴──────────────────────┴─────────────────┘
```

#### 設計決策說明

1. **地圖仍是主視覺**：不縮小地圖，只是讓 HUD 獲得同等優先級的視覺空間。
2. **HUD 緊接地圖**：手機上 HUD 在地圖正下方，不可被推走。這樣「我的生命值在衰退」和「世界地圖」是同一個注意力焦點。
3. **ActionBar 固定底部**：在手機上，動作永遠在拇指可觸及的底部。
4. **WorldSignal strip 可展開**：平時只佔 2 行，展開後覆蓋部分畫面（不覆蓋地圖）。

---

### 4.2 「你不在時」—— 入場鉤子（WhenYouWereGone Card）

**設計目標**：取代現有的 `SinceLastVisitPanel` 彈窗，改為**內嵌在主畫面**的情境快照卡片。出現時機：玩家登入後首次載入 HubPage（現有 sessionStorage 邏輯沿用）。

**不是彈窗**。不遮住地圖。是一張卡片嵌在地圖下方、HUD 之上的位置，自動在玩家滾動或點「知道了」後消失。

```
┌─────────────────────────────────────┐
│ 你離開的 8 小時裡                   │  ← 標題（Big Shoulders, ember 色）
│                                     │
│ 🐟  Mira 學會用新餌釣魚             │  ← NPC 自主行動（最多 3 則）
│ ⚔️  Mira 跟 Theo 在碼頭爭執        │
│ 🌊  鹽沼食物匱乏加劇               │  ← 世界壓力事件
│                                     │
│ 你的溫飽掉到 48%，體況尚可          │  ← 你的離線衰退摘要
│                                     │
│ [去碼頭看看]  [先進食]  [關閉]      │  ← 直接行動按鈕（不只是關閉！）
└─────────────────────────────────────┘
```

**敘事格式規則**：
- 每則事件用一句完整的中文短句，主詞是 NPC 名字或世界力量（「Mira 學會了…」「北岸派系失去…」）
- 絕不用 「有 N 個事件」這類統計語言
- 離線衰退數字呈現為**你**的狀態，不是系統日誌

**資料來源**：
- NPC 自主行動事件 → 從 `GET /api/world/since-last-visit`（現有 API）
- 離線衰退 → 從 `GET /api/player/needs`（SP1 新增）
- 行動按鈕 → 根據事件類型生成：Mira 事件 → 「去她所在的區域」按鈕

---

### 4.3 NPC 智慧面板（MindSheet）

這是本提案最重要的新 surface。目標：讓玩家**看見** Hermes 等級 AI 的內心——這是這個遊戲跟其他任何遊戲都不同的地方。

#### 設計哲學

不要顯示 debug 資訊（urgency=87, learningWeight=1.3）。翻譯成玩家可讀的「NPC 正在做的事、正在想的事、學到的東西」。  
**展示智慧，不是展示系統。**

#### NPC Sheet 佈局（手機，底部 sheet 向上滑出）

```
┌──────────────────────────────────────┐
│ ▼ (拖動把手)                         │
├──────────────────────────────────────┤
│ MIRA · 漁人    [信任 ██░ 62%] 3 次  │ ← 名稱 + 關係摘要
├─── 她現在在想什麼 ───────────────────┤
│ 🎯 正在尋找食物 (非常迫切)          │ ← 活躍意圖 (IntentProjection)
│    「鹽沼食物緊缺，得去碼頭打聽」    │ ← AI 生成的意圖陳述（hedged）
├─── 她相信的事 ────────────────────┤
│ ⚠ 鹽沼食物匱乏     (她很確信)       │ ← 信念 (BeliefProjection)
│ ? 北岸是否安全     (她不太確定)      │   confidence 對應語氣
│ ✓ 碼頭今天有魚貨   (她確定)          │
├─── 她學到的教訓 ──────────────────┤
│ ✦ 去碼頭問行情通常有用              │ ← 學習權重 (高 weight 的 intent)
│ ✦ 在壓力時問玩家常常被拒            │   翻譯為人話
├───────── 你們的關係 ───────────────┤
│  見過 3 次 · 上次互動：昨天         │
│  關係：陌生人（信任 62 / 100）       │
├──────────────────────────────────────┤
│ [對話]  [交易]  [觀察她]  [離開]    │ ← 動作 Tab
└──────────────────────────────────────┘
│          ← 展開內容：對話 / 交易     │
└──────────────────────────────────────┘
```

#### NPC Sheet 佈局（桌機，右側面板）

```
┌─── NPC 面板（右側 280px）──────────┐
│ MIRA · 漁人                        │
│ 信任 ██░ 62 / 100 · 見過 3 次     │
│                                    │
│ 【現在在想什麼】                   │
│ 🎯 尋找食物 (非常迫切)            │
│ 「鹽沼缺糧，打算去碼頭問行情」     │
│                                    │
│ 【她相信的事】                     │
│ ⚠ 鹽沼食物匱乏 (很確信)          │
│ ? 北岸安危      (不確定)           │
│                                    │
│ 【她的教訓】                       │
│ ✦ 碼頭問行情通常管用              │
│                                    │
│ ──────────────────────────────    │
│ [對話] [交易] [觀察] [離開]        │
└────────────────────────────────────┘
```

#### 資料來源與 API 需求

| 面板區塊 | 資料來源 | 現有 API？ |
|----------|----------|-----------|
| 信任分 / tier | `NpcSummary.relationshipScore` | ✅ 已有 |
| 活躍意圖 | `IntentProjection` → 需新增 `GET /api/npc/:id/intent` | ❌ 需新增 |
| 信念清單 | `BeliefProjection` → 需新增 `GET /api/npc/:id/beliefs` | ❌ 需新增 |
| 學習權重 | `IntentProjection.getLearningWeights()` → 同 intent API | ❌ 需新增 |
| 意圖陳述（hedged 文字） | AI 生成，使用 NPC beliefs 為 context | ✅ 已有（dialog prompt 機制） |

信念的 **confidence** 轉換為玩家語言：

```typescript
// 顯示規則
confidence ≥ 0.8  → 「她確信…」
confidence ≥ 0.5  → 「她相信…」
confidence ≥ 0.3  → 「她隱約覺得…」
confidence < 0.3  → 「她不太確定…」
```

---

### 4.4 世界事件流（WorldSignal Feed）

**設計目標**：讓「世界一直在動」從隱藏的 SSE 流變成可見的生命體徵。不是新聞列表，是一個**有機的世界呼吸感**。

#### 三層資訊架構

```
Layer 1：緊急訊號（Urgent Signals）
─────────────────────────────────
顯示條件：涉及玩家的、或有高危機標記的事件
更新：即時（SSE）
位置：HUD 下方固定橫條（手機）/ 左側面板頂部（桌機）
格式：單行，icon + 短句，最多 2 則

Layer 2：世界即時流（World Stream）
────────────────────────────────────
顯示條件：所有 living-world 事件
更新：即時（SSE）/ 15s 輪詢（fallback）
位置：手機：展開時全屏 overlay；桌機：左側面板下半段
格式：時間軸風格，icon + 時間 + 短句

Layer 3：當你不在時（Since You Left）
──────────────────────────────────────
顯示條件：登入後首次訪問
更新：一次性（登入時取）
位置：嵌入主畫面（不是彈窗），玩家確認後消失
格式：敘事卡片（見 4.2）
```

#### WorldSignal Feed 視覺格式

```
── 世界現在 ─────────────────── [展開 ↗]
⚠ 00:12  霧狼接近碼頭北側
🐟 00:08  Mira 在鹽沼捕到大魚
🔥 00:03  夜潮區爆發衝突
📉 01:24  鹽沼外環食物緊缺加劇
```

事件格式規則：
- 時間用「N 分鐘前」（短期）或 tick 相對值
- icon 語意化：⚠ 危險、🐟 生態、👤 NPC、🔥 衝突、📉 資源、✨ 稀有
- 每個事件點擊 → navigate 到對應區域或開啟相關 NPC 面板

---

## 5. 引人入勝的鉤子：前 30 秒體驗設計

### 5.1 每次開頁的標準情境

**場景 A：離線回歸**（最常見）

玩家重新開啟頁面後，順序感受：

```
0s   → 地圖渲染 + HUD 載入
      SurvivalHud 顯示（可能：amber glow 表示溫飽有點低）
      
3s   → WhenYouWereGone 卡片出現（嵌入，不是彈窗）
      「你離開的 6 小時裡...」
      → Mira 學會了新釣法
      → 你的溫飽掉到 48%
      → 鹽沼食物加劇短缺
      [直接行動按鈕]
      
10s  → 玩家選擇：回應情境 OR 關閉繼續瀏覽
      選擇回應 → navigate 到相關地點或開啟行動
      選擇關閉 → 卡片收起，主畫面呈現
      
15s+ → 主畫面：HUD 倒計時壓力 + WorldSignal 即時流
      玩家知道自己有事要做，世界有事在發生
```

**場景 B：已在線，世界有事發生**

```
即時：WorldSignal strip 更新（SSE）
Urgent signal 出現：「霧狼接近你所在的煙嵐山」
ActionBar 更新：[逃跑] 出現在最醒目位置
```

**場景 C：健康狀態，探索模式**

```
HUD 顯示健康（綠色，無 glow）
WorldSignal 顯示非緊急事件：NPC 活動、生態變化
玩家可以自由點 NPC 查看他們的 MindSheet → 感受世界的豐富度
```

### 5.2 最差體驗修復清單

| 現在的問題 | 解法 |
|----------|------|
| 打開頁面不知道幹嘛 | WhenYouWereGone 卡片告訴玩家世界發生了什麼 + 直接行動按鈕 |
| NPC 感覺是按鈕不是人 | MindSheet 顯示 NPC 的盤算、信念、教訓 |
| 不知道「不玩」有什麼代價 | SurvivalHud 顯示溫飽/體況，離線也衰退，開頁就看得到 |
| 世界感覺死的 | WorldSignal 即時流：NPC 行動、生態事件、衝突 |
| 動作沒有反饋 | ActionBar 顯示代價+預期效益；動作後 HUD 即時更新（SP2） |

---

## 6. Component 清單

### 6.1 新建 Component

| Component | 描述 | 依賴 |
|-----------|------|------|
| `SurvivalHud` | nourishment/vigor 雙條 + 狀態文字 + pulse glow | SP1 `GET /api/player/needs` |
| `WhenYouWereGone` | 離線事件敘事卡片，取代 SinceLastVisitPanel 彈窗 | 現有 `since-last-visit` API + SP1 needs API |
| `WorldSignalStrip` | 手機：折疊橫條；桌機：左側面板區塊。顯示 urgent + stream | 現有 SSE / WorldStateContext |
| `NpcMindSheet` | NPC 智慧面板：意圖、信念、教訓、關係 | 需新增 `/api/npc/:id/intent` + `/api/npc/:id/beliefs` |
| `ActionBar` | 底部固定動作列，context-aware，顯示代價+效益 | SP2（placeholder 可先做） |
| `WorldSignalFeed` | 展開版世界事件流（overlay/panel） | 現有 events stream |

### 6.2 改造現有 Component

| Component | 改動 | 說明 |
|-----------|------|------|
| `HubPage` | 版型重構：mobile stack / desktop sidebar | 加 `sm:` breakpoint 版型，注入新 components |
| `NpcDialog` | 加入 `NpcMindSheet` 作為頂部區塊或 tab | 保留現有對話邏輯，加 MindSheet 面板 |
| `SinceLastVisitPanel` | 轉型為 `WhenYouWereGone` | 從彈窗改為嵌入卡片；重新設計內容格式 |

### 6.3 不動的部分

- Phaser 地圖 canvas 邏輯（PhaserGame / AreaPhaserGame）
- 現有 design token（.gi-panel / font-display / font-data / ember/rust/tide 色調）
- AreaPage 的 Tab 架構（只是在 NPC tab 加 MindSheet 入口）
- 後端 Command/Event/Rule Engine 鏈路

---

## 7. 分階段實作計畫

### Phase 0（SP1 完成後，立即）—— HUD + WhenYouWereGone

**目標**：讓每次打開頁面的前 30 秒有張力。

1. `SurvivalHud` component：從 SP1 的 `GET /api/player/needs` 取值，雙條 + 狀態文字 + pulse glow
2. 改造 `HubPage` 版型：手機版 map → HUD 緊接其下
3. `WhenYouWereGone` 取代 `SinceLastVisitPanel`：
   - 嵌入（非彈窗），可收起
   - 加入離線衰退摘要（needs API）
   - 直接行動按鈕（navigate to area）

**預計工作量**：M（3–5 天）。不需要新後端 API。

---

### Phase 1 —— NPC MindSheet（意圖 + 信念）

**目標**：讓玩家感受到 NPC 的智慧。

1. 後端：新增 `GET /api/npc/:id/intent`（回 top 3 intent entries + urgency + reason）
2. 後端：新增 `GET /api/npc/:id/beliefs`（回 top 5 BeliefRows + confidence + kind）
3. 前端：`NpcMindSheet` component
4. 整合進 `NpcDialog`：對話視窗頂部加 MindSheet 折疊區塊（預設展開前 2 列）
5. 信念 confidence → 玩家語言轉換規則（見 4.3）

**預計工作量**：M-L（3–7 天，含後端 API）。

---

### Phase 2 —— WorldSignal + ActionBar

**目標**：讓「世界一直在動」持續可見，動作有資訊。

1. `WorldSignalStrip`：手機版折疊橫條（SSE 即時更新）
2. 桌機版左側面板版型（HubPage `sm:` layout）
3. `ActionBar`（SP2 前：僅顯示「進入區域」+ placeholder 行動）
4. SP2 實裝後：ActionBar 接入真實行動（hunt/gather/eat/rest）

**預計工作量**：M（3–5 天）Phase 2 骨架；動作邏輯依賴 SP2。

---

### Phase 3 —— 桌機版完整 Sidebar 佈局

**目標**：桌機版資訊密度達到應有水準。

1. `HubPage` 完整 desktop 三欄佈局
2. 右側 contextual panel：NPC 面板 / 區域資訊 / 世界事件流，根據當前選中物件切換
3. `WorldSignalFeed`（展開版）

**預計工作量**：M（3–5 天）。

---

### SP1 銜接細節

SP1 已設計：
- `SurvivalHud` 在 `HubPage` 中央（設計文件語言）

本提案將此精確化為：
- 手機：SurvivalHud 在地圖下方（36px header → Map → SurvivalHud → WorldSignalStrip → ActionBar）
- 桌機：SurvivalHud 在左側面板，地圖上方區塊

SP1 的 `rust pulse glow`（瀕危呈現）保持不變，只是位置更明確。

---

## 8. 美術方向約束

沿用既有 salvage-lit treasure port at night 方向，所有新 component 使用：
- `.gi-panel`（邊框/背景）
- `font-display` Big Shoulders Display（標題/標籤）
- `font-data` JetBrains Mono（數值，如 vigor: 84）
- ember/rust/tide/ground 色票
- `rounded-sharp`（2px 銳角）
- `shadow-panel`（頂部內高光 + 投影）
- 線性圖示：`Icon.tsx`（currentColor, stroke 1.6）

MindSheet 的信念列表用 `tide` 色（不確定）到 `ember` 色（確信）的漸層表示信心度。

---

## 9. 開放問題（待使用者確認）

1. **WhenYouWereGone 嵌入 vs 彈窗**：本提案建議嵌入（inline 卡片）。如果使用者認為彈窗更符合注意力優先，可改回彈窗版本，但建議保留直接行動按鈕。

2. **NpcMindSheet 預設展開深度**：建議只展開「現在在想什麼」一行 + 「信念」一行，其他折疊（tap 展開）。桌機版可能需要更多預設展開。

3. **ActionBar Phase 0 佔位方式**：SP2 未完成前，ActionBar 只有「進入區域」和「…」選單。是否可接受？

4. **MindSheet 的 AI hedged 文字是否每次即時生成**：建議快取到 NPC intent 更新時（每 tick 或意圖改變時），避免每次查看都打 AI。

5. **Hermes 等級學習可見度**：學習權重直接顯示「她學到的教訓」是否過於 meta？如果使用者認為這破壞沉浸感，可改為只在對話行為中體現（NPC 說話時自然反映學習結果），不在 MindSheet 單獨列出。

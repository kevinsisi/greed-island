# Proposal — Card Catalog Redesign + Acquisition Diversity (v0.15.0)

## Why

`card-living-world/` (v0.13.0) shipped 100 placeholder cards using rank tiers SS/S/A/B/C/D/E/F/G/H, all with `acquisitionMethod = "random_drop"` — the world had a single loot loop where every rank trickled out of tile drops at the same baseline chance. That was fine for testing the pipeline but it does not match the world fiction:

- 高階卡（S/A/B 級）絕對不會「隨便掉」。在獵人貪婪之島的原作裡，定序卡是分散在主線任務、戰鬥勝利、跟特定 NPC 的羈絆、特定地點觸發、解謎、商店購買等。
- 隨機掉落只應留給最低階的「日常碎片」式卡片。
- 沒有 `category` 欄位讓紋典 UI 沒辦法做出「依潮術系 / 食飲系 / 深淵系」這種貪婪之島風的分組。
- 沒有 `effectDescription` / `acquisitionDetail` 欄位，玩家也看不出每張卡「現」之後能幹嘛。

同時，術式卡（technique cards）是另一個範疇 — 它們不是定序收集卡，而是有具體戰鬥 / 探索 / 社交效果的「魔法物品」。這次 release 把它們從 0 張變 15 張，並只開放在「天際百貨」（霓港區）以潮幣購買；不掉落、不交易。

## What Changes

### Card schema

- `CardRank` 從 10 階收斂為 5 階：`S | A | B | C | D`
- 新欄位：`category` (10 大分類)、`maxCopies`、`effectDescription`、`acquisitionMethod` (8 種 enum)、`acquisitionDetail`
- `assertValidCatalog` 驗證每張卡的 id 必須對應到正確的 category 範圍、acquisitionMethod 必須是合法 enum、effectDescription / maxCopies 不可空
- `RANK_EXISTENCE_CAP` 由 `entry.maxCopies` 蓋過（rank-derived cap 變 fallback）

### 100 張定序卡

- 10 大分類各 10 張 (S 1 / A 2 / B 3 / C 2 / D 2)
- id 範圍固定：1–10 潮源系 / 11–20 食飲系 / ... / 91–100 深淵系
- 每個 category 對應的「典型」取得方式
- 20 張 D 階卡為 random_drop pool；其它 80 張以 main_quest / side_quest / affinity_bond / combat_victory / shop_purchase / location_trigger / puzzle_solve 分散

### 15 張術式卡

- `cards/techniques.ts` 新檔
- 戰鬥型 7 / 探索型 5 / 社交型 3
- 每張有具體 effect mechanic（戰鬥 / 探索 / 社交），給 Phase C 戰鬥引擎接 hook
- `player_techniques` 表記錄玩家持有 (account_id, card_id, count, last_purchased_at)
- `http/techniqueShopRouter.ts`：必須在 t_temple tile + 足夠潮幣 + 未達 maxOwnedPerPlayer 才能購買

### Drop engine

- 基準 spawn chance 從 1.2% 降至 0.24%（5×降低）
- 池子只放 `acquisitionMethod === 'random_drop'` 的卡（即 D 階共 20 張）
- 大潮日（rare window）×1.8、雨天 ×1.3
- tile category boost：鏽灣區優先掉技藝/秘聞、潮聲區優先掉地景/食飲、霓港區優先掉潮器/食飲、地脈層優先掉深淵/潮術、浪花區優先掉生靈
- 高階卡不可能從 drop engine 掉出（schema enforced）

## Impact

- **Affected specs**：`card-living-world/spec.md`（不破壞既有 60 秒法則 / RANK_EXISTENCE_CAP / drops endpoint shape；只擴 schema）
- **Affected code**：
  - 新增：`cards/techniques.ts`、`http/techniqueShopRouter.ts`
  - 修改：`cards/types.ts`、`cards/catalog.json`、`http/cardDropEngine.ts`、`http/cardWorldStore.ts`、`packages/web/src/state/types.ts`、`packages/web/src/api/client.ts`、`packages/web/src/state/WorldStateContext.tsx`、`packages/web/src/pages/CodexPage.tsx`、`packages/web/src/components/game/CardDropPanel.tsx`
  - DB migration：新表 `player_techniques`，由 `initializeTechniqueShopSchema` 自動建（CREATE IF NOT EXISTS）
- **舊存檔影響**：既有 `world_card_drops` / `player_codex` 仍以 `card_id` 為 key，內容沒換 id；rank 從 SS/E/F/G/H 改 S/A/B/C/D 是擴 5 階位元到 catalog 上限的事，舊行的 rank 不再合法但 catalog 完全重灌，舊的 card_id 仍指向新 catalog 中的卡。生產環境若有舊 drops 帶 SS/H 的卡，spawn engine 會找不到 catalog entry → spawn 直接 return null（safe）。
- **Risk**：低；drop engine 已經是「找不到就跳過」的安全模式。新表 `player_techniques` 是 lazy create，舊客戶端不呼叫新 endpoint 就不會看到。
- **Out of scope**（明確不做）：
  - 紋卡實際 mechanic 的戰鬥引擎接線（Phase C）
  - 紋典 UI 改成依 category 分組（前端可後續做）
  - 任務 / 好感度 → 卡發放 endpoint（Phase D world feedback loop 才做）

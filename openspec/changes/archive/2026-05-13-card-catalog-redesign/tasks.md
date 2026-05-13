# Tasks — Card Catalog Redesign + Technique Shop

## 1. Schema

- [x] `cards/types.ts`：CardRank 收斂為 S/A/B/C/D；新增 CardCategory / CardAcquisitionMethod / CATEGORY_ID_RANGES / categoryForId
- [x] `assertValidCatalog` 加 maxCopies / acquisitionMethod / acquisitionDetail / effectDescription / category-range 驗證

## 2. 100 張定序卡

- [x] `scripts/generate-card-catalog.mjs`：deterministic generator，輸出 catalog.json
- [x] 10 大 category × 10 張，pattern [S, A, A, B, B, B, C, C, D, D]
- [x] D 階 20 張改為 random_drop common loot；其餘 80 張分散 main_quest / side_quest / affinity_bond / combat_victory / shop_purchase / location_trigger / puzzle_solve
- [x] `cards/catalog.test.ts` 測試 schema、id 範圍、S/A/B 不在 random_drop 池

## 3. 15 張術式卡

- [x] `cards/techniques.ts`：TECHNIQUE_CARDS const + initializeTechniqueShopSchema + TechniqueShopStore
- [x] 戰鬥型 7 / 探索型 5 / 社交型 3，每張有具體 effectDescription
- [x] id 從 1001 起，避開定序卡 id 範圍

## 4. 商店 Router

- [x] `http/techniqueShopRouter.ts`：3 個 endpoint
- [x] mount 到 `http/server.ts`
- [x] 必須在 t_temple tile（霓港區）+ wallet.gold ≥ priceGold + ownedCount < maxOwnedPerPlayer

## 5. Drop engine 改寫

- [x] `cardDropEngine.ts`：BASE_SPAWN_CHANCE 1.2% → 0.24%
- [x] 池子只看 acquisitionMethod === 'random_drop' 的卡
- [x] tile category boosts 改為依 category（不是 rank）
- [x] 大潮日 ×1.8、雨天 ×1.3

## 6. Web 前端

- [x] `state/types.ts` + `api/client.ts`：補 CardCategory / CardAcquisitionMethod / 新欄位
- [x] `WorldStateContext.tsx` 的 toCardEntry 處理新欄位
- [x] `CodexPage.tsx`：RANK_ORDER / RANK_TONE 改成 5 階
- [x] `CardDropPanel.tsx`：fallback rank 從 'H' 改 'D'

## 7. Tests

- [x] `cards/catalog.test.ts` 9 tests pass
- [x] vitest 全 100 tests pass

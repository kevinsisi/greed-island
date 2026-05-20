## 1. Config & Constants

- [x] 1.1 Add `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS = TICKS_PER_HOUR` to `packages/server/src/config/world.ts`

## 2. Runtime — Settlement Food Consumption Cadence

- [x] 2.1 In `computeNextTick` (`packages/server/src/sim/runtime.ts`), after the settlement engine block, add a cadence-gated section: when `nextTick % SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS === 0`, for each active settlement compute `heldFood = goodsInventoryProjection.list()` filtered by settlement holder + food goods, then emit `GOODS_CONSUMED` with quantity = `min(heldFood, population × SETTLEMENT_FOOD_UNITS_PER_NPC)` if quantity > 0
- [x] 2.2 Use `settlement.populationNpcIds.length` for population count; skip settlements with empty population
- [x] 2.3 Set `holderType = 'settlement'`, `holderId` to the settlement's primary holder id, `goodsId` to the food goods id with highest quantity; add Chinese narration: `"{settlementId} 的居民消耗了 {quantity} 份食物。"`

## 3. Chronicle Narration Fix

- [x] 3.1 In `planSettlementCommands` (`packages/server/src/sim/settlementEngine.ts`), replace the placeholder English narration for `SETTLEMENT_DECLINED` with: `"{settlementId} 因糧食短缺陷入衰退。"` — narration already correct Chinese: `${settlement.id} 的穩定度跌破閾值，聚落陷入衰退。`

## 4. Integration Test

- [x] 4.1 Create `packages/server/src/sim/runtimeSettlementFamine.test.ts` — scenario: create a runtime with one settlement (2 NPCs), pre-load 4 food units in settlement storage, advance enough cadence ticks to drain storage, verify food pressure rises, verify `SETTLEMENT_DECLINED` is emitted
- [x] 4.2 Add unit test to `packages/server/src/sim/settlementEngine.test.ts`: "emits SETTLEMENT_DECLINED when stability drops below SETTLEMENT_STABILITY_DECLINING_BELOW due to sustained food pressure"

## 5. Spec Verification

- [x] 5.1 Verify `GET /api/goods/inventory/:ownerId` in `packages/server/src/http/goodsRouter.ts` returns only non-zero quantity items matching spec scenario — read the file and confirm behavior
- [x] 5.2 Verify `packages/server/src/sim/runtimeGoodsInventory.test.ts` covers MEAT_HARVESTED → GOODS_EXTRACTED scenario; add test if missing

## 6. Final Verification

- [x] 6.1 Run `npm run build` — TypeScript clean across all packages
- [x] 6.2 Run `npm test` — all tests pass including new famine integration test
- [x] 6.3 Update `PROGRESS.md` with v0.34.0 handoff state
- [x] 6.4 Update `ROADMAP.md` with v0.34.0 entry

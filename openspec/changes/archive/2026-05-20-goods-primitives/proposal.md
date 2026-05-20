## Why

Phase 2 Goods infrastructure (catalog, commands, GoodsInventoryProjection, logistics, market prices, settlement engine food pressure) is largely implemented, but the famine loop is broken because settlement storage never decreases — there is no periodic food consumption cadence. `SETTLEMENT_FOOD_UNITS_PER_NPC` is defined but never used to deduct food. As a result, §43 acceptance gap #3 ("lose a settlement to famine") cannot be triggered even if the ecosystem collapses.

This change closes the remaining gaps in the `goods-primitives` spec and adds the food consumption cadence that makes the famine loop end-to-end observable.

## What Changes

- **Settlement food consumption cadence**: Each world hour (or configurable cadence), each NPC counted in the settlement population consumes `SETTLEMENT_FOOD_UNITS_PER_NPC` food units from settlement storage via `GOODS_CONSUMED`. If storage is empty, no command is emitted (consumption is skipped — starvation is represented by the resulting food pressure, not by a blocked command).
- **Chronicle narration for `SETTLEMENT_DECLINED`**: Replace the placeholder English narration with a proper Chinese narration sentence embedded in the command payload.
- **Spec verification tasks**: Verify NPC productive actions → `GOODS_EXTRACTED` wiring and `GET /api/goods/inventory/:ownerId` endpoint against spec scenarios.
- **Integration test**: One end-to-end test that proves ecosystem fishery collapse → settlement food pressure rise → `SETTLEMENT_DECLINED` emitted.

## Capabilities

### New Capabilities
*(none — this change closes an existing spec, not a new capability)*

### Modified Capabilities
- `goods-primitives`: Add periodic settlement food consumption cadence requirement. The existing spec defines `GOODS_CONSUMED` semantics but does not mandate a runtime consumption cadence; this gap must be filled for the famine loop to function.
- `civilization-runtime`: Settlement stability now drops from actual food depletion, not just from fishery collapse pressure alone.

## Impact

- `packages/server/src/sim/runtime.ts`: add food consumption cadence block (similar to mortality cadence — cadence-gated, uses `GOODS_CONSUMED`)
- `packages/server/src/config/world.ts`: add `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS` constant
- `packages/server/src/kernel/livingWorldCommands.ts`: update `SETTLEMENT_DECLINED` narration template
- New integration test: `packages/server/src/sim/runtimeSettlementFamine.test.ts`
- No schema changes; no new command types needed

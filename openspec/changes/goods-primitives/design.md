## Context

The Goods infrastructure (catalog, 5 command types, GoodsInventoryProjection, logistics, market prices) is fully wired in `runtime.ts`. `planSettlementCommands()` already calculates food pressure from settlement-held goods inventory + fishery density. `SETTLEMENT_DECLINED` is already emitted when stability drops below `SETTLEMENT_STABILITY_DECLINING_BELOW = 40`.

The broken link: settlement storage only increases (via MEAT_HARVESTED → GOODS_EXTRACTED → GOODS_STORED → logistics → GOODS_TRANSPORT_ARRIVED). There is no periodic consumption pathway. `SETTLEMENT_FOOD_UNITS_PER_NPC = 2` is defined in config but never applied to deduct inventory. As a result, food pressure from goods inventory is always 0 unless zero NPCs are hunting or fishing.

## Goals / Non-Goals

**Goals:**
- Add a cadence-gated settlement food consumption block to `computeNextTick` that emits `GOODS_CONSUMED` from settlement storage once per `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS`
- Fix `SETTLEMENT_DECLINED` narration (currently English placeholder)
- Verify and test the famine end-to-end: ecosystem collapse → food shortage → `SETTLEMENT_DECLINED`

**Non-Goals:**
- NPC-level individual food consumption (each NPC eats from personal inventory) — aggregate settlement consumption is sufficient for §43 gap #3
- Food spoilage / shelf-life mechanics
- New command types or schema changes
- Market or logistics changes

## Decisions

**Decision: Aggregate settlement consumption, not per-NPC consumption**

Each tick (at cadence), the runtime emits one `GOODS_CONSUMED` for the entire settlement population rather than one per NPC. This keeps command volume bounded. The Rule Engine already validates that consumption cannot exceed inventory, so if food is short the command is emitted for whatever is available (partial consumption) — modelling the settlement drawing down its reserves.

*Alternative: Per-NPC food consumption (each NPC emits GOODS_CONSUMED individually)*
Rejected: would multiply GOODS_CONSUMED commands by NPC count per cadence tick, inflating EventLog. Settlement-aggregate is enough for the famine pressure signal.

**Decision: Emit GOODS_CONSUMED even when partial inventory**

If settlement has less food than `population × SETTLEMENT_FOOD_UNITS_PER_NPC`, emit GOODS_CONSUMED for what's available (min of available and required). This way settlement drains to zero and food pressure maxes out. No GOODS_CONSUMED rejected by Rule Engine.

*Alternative: Skip consumption if inventory is below required*
Rejected: skipping means inventory stays non-zero and food pressure never maxes, muting the starvation signal.

**Decision: Place consumption block before settlement engine in the same tick**

Consumption runs first → settlement engine sees depleted inventory → food pressure calculates correctly in the same tick. This avoids a 1-tick lag where pressure lags consumption by one tick.

**Decision: Cadence stored in config, not hardcoded**

`SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS = TICKS_PER_HOUR` (same order as mortality cadence). Configurable by changing the constant without touching runtime logic.

## Risks / Trade-offs

- [Risk]: Existing world (26k+ ticks) has accumulated food in settlement storage. First consumption run will drain storage rapidly if the cadence was "missing" for all prior ticks.
  → Mitigation: Consumption is cadence-gated, so only one cadence's worth of consumption fires per tick. Catch-up does not occur because only `currentTick % cadence === 0` fires.

- [Risk]: If all hunters/fishers produce food faster than consumption rate, food pressure never builds even with ecosystem decline.
  → Acceptable: The balance point between production and consumption is intentional tuning, not a bug. If ecosystem collapses, MEAT_HARVESTED and FISHERY_HARVESTED stop, then consumption depletes storage, then pressure rises.

## Migration Plan

1. Add `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS` to `config/world.ts`
2. Add consumption cadence block in `runtime.ts computeNextTick`
3. Fix `SETTLEMENT_DECLINED` narration string
4. Write integration test `runtimeSettlementFamine.test.ts`
5. Run `npm run build` + `npm test`

No migration of existing data needed. The `GOODS_CONSUMED` events that will now appear in the live EventLog are additive and fully replay-safe.

## Open Questions

- What cadence is right? `TICKS_PER_HOUR` = 1440 ticks/hour. With 2 food units per NPC per hour, if a hunter produces 1 meat per hunt and hunts 3x/day, supply ≈ 3 units/day vs demand ≈ 48 units/day (24 hours × 2 units). This means hunters cannot keep up with demand without fishing supplement — which makes ecosystem collapse meaningful. Confirm this balance is intentional before implementing.

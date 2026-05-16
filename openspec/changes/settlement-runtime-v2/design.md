## Context

Current `civilization-runtime` already covers goods, logistics, production chains, market prices, and settlement formation. The missing link is a settlement state model that consumes those projections and turns them into civilization pressure.

`docs/WORLD_CAPABILITIES.md` Part I requires settlements to own population, storage, economy, trade routes, faction alignment, territory, production capacity, stability, and expansion pressure. This change deliberately starts smaller: authoritative state, pressure, stability, decline/recovery, and observability. Territory, faction war, takeover, and split are later changes.

## Goals / Non-Goals

**Goals:**

- Keep `Command -> Rule Engine -> Event -> Projection` as the only state-changing path.
- Make settlement state replayable from EventLog.
- Use existing projections as inputs: `settlements`, `goodsInventory`, `logistics`, `marketPrices`, `fisheryDensity`, `animalPopulation`, `householdEconomy`, and NPC authoritative presence.
- Preserve public narrative quality by not surfacing routine settlement telemetry in the ticker.
- Provide a foundation for future Hub visualization that shows real settlement state, not fake actors.

**Non-Goals:**

- No frontend crowd simulation.
- No AI-authored settlement truth.
- No settlement conquest, split, destruction, or player founding in this change.
- No new pollution/forest systems.

## Decisions

### D1. Settlement state is a projection, not mutable runtime truth

`SettlementsProjection` will own rows shaped roughly as:

```ts
type SettlementStateRow = {
  id: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
  populationNpcIds: readonly string[]
  storage: readonly { goodsId: string; quantity: number }[]
  pressure: { food: number; safety: number; economy: number; logistics: number }
  stability: number
  status: 'stable' | 'strained' | 'declining' | 'recovering'
  updatedAtTick: number
}
```

The projection updates only from settlement events. The runtime may calculate desired changes, but it must express them as Commands first.

### D2. Storage summary is derived from goods events, not duplicated authority

Settlement storage authority remains `GoodsInventoryProjection` keyed by `holderType='settlement'`. Settlement state stores a deterministic summary emitted through `SETTLEMENT_STORAGE_UPDATED` so observers can read settlement health without scanning all goods rows. If the two disagree in tests, goods inventory wins and the settlement projection is considered wrong.

### D3. Pressure is deterministic and bounded

`SettlementEngine` computes pressure scores in the range `0..100` from existing facts:

- food pressure: low settlement-held food goods, fishery collapse, and high population.
- safety pressure: predator attacks, defense-party events, and low local safety.
- economy pressure: market scarcity and poor household economy.
- logistics pressure: transport losses, closed routes, or missing expected route supply.

Slice 1 keeps formulas simple and named constants live in `config/world.ts`.

### D4. Stability changes only through typed events

When pressure crosses thresholds, the engine emits `SETTLEMENT_STABILITY_CHANGED`. Stability is monotonic within one tick: one settlement receives at most one stability event per tick after all pressure inputs are gathered.

### D5. Decline and recovery are state bands, not destruction

This change may emit `SETTLEMENT_DECLINED` and `SETTLEMENT_RECOVERED`, but decline does not remove a settlement. Destruction, abandonment, conquest, and split need separate OpenSpec because they affect map/history/faction semantics.

### D6. Observability is authoritative and non-narrative by default

GM/admin pages may show settlement metrics. Public ticker/chronicle surfaces must not flood routine settlement pressure updates unless the event has hand-authored, localized narration and passes existing visibility guards.

## Slicing

1. Domain and projection: types, event validators, projection replay tests.
2. Engine pressure calculation: deterministic pure planner from existing projections.
3. Runtime wiring: emit settlement pressure/stability commands once per world tick.
4. Observability: expose `facts.settlements`/API shape and GM/admin rendering.
5. Verification and docs: replay/hash tests, OpenSpec validation, `PROGRESS.md` update.

## Rollback

Rollback is binary-only. New settlement events are additive event types; older reducers skip unknown events. No EventLog deletion or migration is required.

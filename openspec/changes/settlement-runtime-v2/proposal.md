# Proposal — Settlement Runtime v2: authoritative civilization state

## Why

`docs/WORLD_CAPABILITIES.md` defines settlements as real civilization entities, not tile labels. Current `v0.24.10` code has `SETTLEMENT_FORMED` and a replayable `settlements` projection, but the projection is formation-only: it does not yet carry population, storage, economy pressure, stability, expansion pressure, decline, or recovery.

The recent Hub rollback also clarified a product rule: the world must feel alive through authoritative state, not fake frontend actors. Settlement Runtime v2 is the next correct foundation for that. It gives the server a durable settlement read model that can later drive Hub, GM, narration, logistics, and history surfaces without inventing life in the UI.

## What Changes

- Extend the settlement domain beyond founding metadata with authoritative state: population, storage summary, pressure metrics, stability, status, and updated tick.
- Add typed settlement Commands/Events for population, storage/shortage pressure, stability change, decline, and recovery.
- Add a deterministic `SettlementEngine` runtime hook that derives settlement pressure from existing projections: NPC presence, household economy, goods inventory, logistics outcomes, fishery/ecology signals, and market prices.
- Extend `SettlementsProjection` into a replayable settlement-state projection.
- Expose the new state through existing read surfaces without adding any fake people, fake crowds, or decorative activity actors.

## Scope

### In Scope

- Server-authoritative settlement state projection.
- Typed events only; no direct projection mutation.
- Settlement pressure from already-existing goods/logistics/ecology signals.
- GM/admin observability of settlement state.
- Tests for replay determinism and non-negative bounded metrics.

### Out of Scope

- Settlement split, conquest, faction war, territory borders, or destruction.
- New player commands such as `PLAYER_FOUNDED_SETTLEMENT`.
- Hub crowd visuals, fake NPC markers, or frontend-generated life.
- New ecosystem pollution/forest depletion systems; those belong to a later E2 change.
- Full `history_chronicle` arcs; this change only emits state that history can later consume.

## Capabilities

### Modified Capabilities

- `civilization-runtime`: extends settlements from formation-only entities into authoritative civilization state with pressure and stability.

## Impact

- **Affected specs**: `civilization-runtime`.
- **Affected code**:
  - `packages/server/src/kernel/livingWorldCommands.ts`
  - `packages/server/src/projections/settlements.ts`
  - `packages/server/src/sim/runtime.ts`
  - new `packages/server/src/sim/settlementEngine.ts`
  - GM/admin observer surfaces that already render world facts
- **Risk**:
  - Double-counting storage if settlement state duplicates `goodsInventory`; mitigated by treating settlement storage as a derived summary over settlement-held goods.
  - Runtime load growth; mitigated by one settlement pass per world tick and no per-NPC fake actors.
  - Narrative flood from routine pressure events; mitigated by keeping routine settlement telemetry out of public ticker surfaces.

## Decisions Before Slice 1

1. Slice 1 tracks every formed settlement exposed by `SettlementsProjection`, including `settlement.t_central` if/when it is represented as a formed settlement row and any NPC-formed settlements.
2. Stability uses both a numeric `0..100` score and a coarse status band (`stable`, `strained`, `declining`, `recovering`). The numeric score supports deterministic thresholds; the band supports readable surfaces.
3. Initial shortage pressure reads settlement-held goods only. In-transit goods affect `logistics` pressure via transport state/loss, not food availability until they arrive and become settlement-held inventory.

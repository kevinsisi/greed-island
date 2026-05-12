## Why

NPCs currently emit productive events for work, trade, service, learning, and building, but those events mostly affect narration and city-level projections. NPCs do not yet carry personal economic or skill state, so work feels fake: an NPC can "work" without earning money and "learn" without accumulating capability.

This change makes productive NPC actions leave durable, replayable personal consequences.

## What Changes

- Extend `LifeExpansionState` with `npcCivicRecords[npcId]` containing `gold`, `skillXp`, and `lastProductiveTick`.
- Add a pure reducer that derives personal earnings and skill XP from accepted `NPC_PRODUCTIVE_ACTION` facts.
- Update runtime reducer dispatch so accepted productive actions update `world.lifeExpansion` through the same Command -> Rule Engine -> Event -> Projection path.
- Expose the new record on NPC summaries as `npc.civic` so API/frontend consumers can show that NPCs have money and learned capability.

## Scope

- In scope: deterministic personal ledger for NPC productive work, trade, service, learning, and construction.
- Out of scope: spend decisions, NPC-owned inventory, children growing into full NPCs, autonomous NPC-vs-NPC combat, and generic completed-building unlocks.

## Impact

- Backend: `packages/server/src/sim/cityLife.ts`, `packages/server/src/sim/runtime.ts`, tests.
- Frontend shared types: `packages/web/src/state/types.ts`.
- Tests: reducer replay/hydration, productive-action runtime update if a focused test hook exists; otherwise reducer-level coverage plus existing runtime tests.

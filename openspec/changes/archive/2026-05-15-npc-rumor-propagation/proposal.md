## Why

NPCs witness only their own interactions — notable world events (predator starvation, ecosystem migration, settlement construction, memorable NPC encounters) are invisible to anyone who wasn't present. Phase 3 begins by adding a rumor system so NPCs can learn about a living world beyond their immediate tile, spreading information through conversation and expressing it in dialogue, making them feel like civilization citizens rather than isolated simulation actors.

## What Changes

- New commands `NPC_RUMOR_HEARD` and `NPC_RUMOR_SPREAD` enter the Command/Event pipeline.
- A rumor seeder fires at cadence ticks: when notable world events occur (e.g. `ANIMAL_STARVED`, `SETTLEMENT_CONSTRUCTION_COMPLETED`), NPCs on or adjacent to the event tile receive an `NPC_RUMOR_HEARD` command carrying a structured rumor payload (topic, subject, accuracy, originTick).
- During `NPC_INTERACT`, a participant who holds a rumor may emit `NPC_RUMOR_SPREAD` to transfer a degraded copy to the other participant.
- A new `RumorProjection` tracks active rumors per NPC: `(npcId, rumorId) → { topic, subject, accuracy, heardAtTick, spreadCount }`.
- Rumor accuracy decreases with each spread step (multiplicative degradation) and with age (accuracy floor applied at cadence ticks).
- AI dialog prompt builder receives the hearing NPC's current rumor list so generated lines can reference what the NPC has heard.
- `WorldSnapshot.facts.npcRumors` exposes the full projection for GM inspection.

## Capabilities

### New Capabilities

- `npc-rumor-propagation`: Seeding rumors from world events onto nearby NPCs, NPC-to-NPC spread during interactions, accuracy/age decay, and dialogue grounding — all via the Command/Event pipeline.

### Modified Capabilities

- `ai-npc-dialog`: NPC dialog AI prompt MUST include the hearing NPC's active rumors as a context block so AI-generated lines can reference what the NPC has heard.
- `npc-humanity-ai-memory`: An `NPC_RUMOR_SPREAD` event that successfully transfers a rumor MUST generate an `event`-type memory entry for both the spreading and receiving NPC.

## Impact

- **New commands/events**: `NPC_RUMOR_HEARD`, `NPC_RUMOR_SPREAD`
- **New projection**: `packages/server/src/projections/rumor.ts` (`RumorProjection`)
- **New seeder**: rumor seeding logic in `packages/server/src/sim/rumorSeeder.ts`, called from `runTick()` fan-out
- **Modified**: `packages/server/src/sim/runtime.ts` — fan-out projects into `RumorProjection`; `runTick()` calls seeder at cadence
- **Modified**: NPC dialog prompt builder — passes active rumors into AI context
- **Modified**: `NPC_INTERACT` rule or planner — emits `NPC_RUMOR_SPREAD` when spread conditions are met
- **EventLog**: gains `NPC_RUMOR_HEARD` and `NPC_RUMOR_SPREAD` event types
- **Snapshot**: `facts.npcRumors` from `rumorProjection.list()`
- **No breaking API changes**: all existing endpoints unchanged; `/api/world` gains an optional `npcRumors` key

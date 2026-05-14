## 1. Constants + Command Catalog

- [x] 1.1 Add rumor constants to `packages/server/src/config/world.ts`: `RUMOR_ACCURACY_DECAY = 85`, `RUMOR_ACCURACY_THRESHOLD = 10`, `RUMOR_MAX_PER_NPC = 5`
- [x] 1.2 Add `RumorTopic` union type (`'predator_death' | 'construction_complete'`) and `RumorPayload` type to `packages/server/src/commands/types.ts` (or equivalent types file)
- [x] 1.3 Register `NPC_RUMOR_HEARD` in the command/event catalog with payload: `{ rumorId, topic, subjectId, tileId, originTick, accuracy, npcId }`
- [x] 1.4 Register `NPC_RUMOR_SPREAD` in the command/event catalog with payload: `{ rumorId, topic, subjectId, tileId, originTick, accuracy, fromNpcId, toNpcId }`

## 2. RumorProjection

- [x] 2.1 Create `packages/server/src/projections/rumor.ts` with `RumorRow` type (`npcId, rumorId, topic, subjectId, tileId, originTick, accuracy, heardAtTick`) and `RumorProjection` class stub
- [x] 2.2 Implement `RumorProjection.project(event)`: handle `NPC_RUMOR_HEARD` — upsert row for `(npcId, rumorId)`, enforce `RUMOR_MAX_PER_NPC` cap by evicting oldest `heardAtTick` when exceeded
- [x] 2.3 Implement `RumorProjection.project(event)`: handle `NPC_RUMOR_SPREAD` — insert degraded row for `toNpcId` with `accuracy = Math.round(payload.accuracy * RUMOR_ACCURACY_DECAY / 100)`; no-op if recipient already holds that `rumorId`; apply cap eviction
- [x] 2.4 Implement `RumorProjection.getActiveRumors(npcId)`: return rows for `npcId` where `accuracy >= RUMOR_ACCURACY_THRESHOLD`, ordered by descending accuracy
- [x] 2.5 Implement `RumorProjection.list()`, `rebuildFromEvents(events)`, and `canonicalHash()`

## 3. Rumor Seeder

- [x] 3.1 Create `packages/server/src/sim/rumorSeeder.ts` exporting `seedRumorsFromEvent(event, npcIdsOnTile, currentTick): LivingWorldCommand[]`
- [x] 3.2 Handle `ANIMAL_STARVED` in seeder: extract `predatorSpeciesId` and `tileId`; generate one `NPC_RUMOR_HEARD` command per NPC in `npcIdsOnTile` with `topic = 'predator_death'`, `subjectId = predatorSpeciesId`, `rumorId = deterministicHash(topic + subjectId + originTick)`, `accuracy = 100`
- [x] 3.3 Handle `SETTLEMENT_CONSTRUCTION_COMPLETED` in seeder: extract `settlementId` and `tileId`; generate `NPC_RUMOR_HEARD` commands with `topic = 'construction_complete'`, `subjectId = settlementId`
- [x] 3.4 Return empty array for unrecognized event types (seeder is a no-op for non-notable events)

## 4. Runtime Integration

- [x] 4.1 Import `RumorProjection` in `packages/server/src/sim/runtime.ts`; instantiate and hydrate on boot via `rebuildFromEvents(eventLog.all())`
- [x] 4.2 In accepted-event fan-out (both loops): project each accepted event into `rumorProjection`; call `seedRumorsFromEvent(event, npcIdsOnTile, tick)` and enqueue returned `NPC_RUMOR_HEARD` commands for submission in the same tick (use the same `commands.push(...)` pattern as predation)
- [x] 4.3 In the `NPC_INTERACT` accepted-event handler within the fan-out: check `rumorProjection.getActiveRumors(participantA)` and `getActiveRumors(participantB)`; if participantA has rumors and participantB does not hold the same `rumorId`, enqueue one `NPC_RUMOR_SPREAD` (highest accuracy from participantA → participantB); symmetric check for participantB → participantA only if participantA has no eligible spread
- [x] 4.4 In `NPC_RUMOR_SPREAD` accepted-event handler: create `event`-type `NpcMemoryRow` for `fromNpcId` and `toNpcId` via `SqliteNpcMemoryStore` with `contentJson = { topic, subjectId, accuracy, tick }`
- [x] 4.5 Add `NPC_RUMOR_HEARD` and `NPC_RUMOR_SPREAD` to the narrative suppression list so they never appear in `getRecentEvents()` or SSE narrative surfaces

## 5. Snapshot + Dialog

- [x] 5.1 Populate `facts.npcRumors` from `rumorProjection.list()` in the snapshot builder
- [x] 5.2 Modify NPC dialog prompt builder: inject a rumors context block with the NPC's top 3 active rumors (by accuracy) formatted as human-readable lines; omit the block entirely when `getActiveRumors(npcId)` returns empty

## 6. Tests

- [x] 6.1 Create `packages/server/src/projections/rumor.test.ts`: `NPC_RUMOR_HEARD` adds rumor; `NPC_RUMOR_SPREAD` adds degraded copy to recipient; duplicate `rumorId` for recipient is no-op; accuracy `< RUMOR_ACCURACY_THRESHOLD` excluded from `getActiveRumors`; cap evicts oldest on overflow; `rebuildFromEvents` / `canonicalHash` stability
- [x] 6.2 Create `packages/server/src/sim/runtimeRumor.test.ts`: `ANIMAL_STARVED` accepted on NPC's tile emits `NPC_RUMOR_HEARD` and populates `facts.npcRumors`; no rumor when tile has no NPCs; `NPC_INTERACT` with rumor-holder emits `NPC_RUMOR_SPREAD` with degraded accuracy; no spread when no rumors; no spread when recipient already holds `rumorId`; both participants gain `event` memory entries after spread; `NPC_RUMOR_HEARD` and `NPC_RUMOR_SPREAD` absent from `getRecentEvents()`
- [x] 6.3 Extend or add dialog prompt tests: prompt includes up to 3 rumors when NPC has active rumors; prompt omits rumor block when NPC has none; existing dialog behavior (fallback path, key-pool rotation) is unaffected

## 7. Documentation + Spec Verification

- [x] 7.1 Run focused tests: `npm run test -w @greed-island/server -- projections/rumor sim/runtimeRumor`
- [x] 7.2 Run `npm run build:server` and `npm run build:web`
- [x] 7.3 Run full `npm test` and confirm counts
- [x] 7.4 Run `npx openspec validate npc-rumor-propagation --strict`
- [x] 7.5 Run `npx openspec validate --all --strict`
- [x] 7.6 Update `PROGRESS.md` with implementation summary, honest scope, verification evidence
- [x] 7.7 Update `ROADMAP.md` with Phase 3 Slice 1 entry
- [x] 7.8 Commit and push; confirm CI and Deploy Dev pass; verify live `/healthz` and `/api/world.facts.npcRumors`

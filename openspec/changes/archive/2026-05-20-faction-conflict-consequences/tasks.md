## 1. Event Types & Command Registry

- [x] 1.1 Add `FACTION_TILE_SEIZED` to event type registry in `livingWorldCommands.ts` with payload type `FactionTileSeizedCmd` (`tileId`, `factionId`, `previousFactionId: string | null`, `seizedAtTick`)
- [x] 1.2 Add `FACTION_NPC_LOYALTY_SHIFTED` to registry with payload type `FactionNpcLoyaltyShiftedCmd` (`npcId`, `tileId`, `fromFaction`, `toFaction`, `shiftedAtTick`)
- [x] 1.3 Add validators for both new command types in the `VALIDATORS` map
- [x] 1.4 Add both types to the `LivingWorldCommandPayload` union

## 2. FactionControlProjection

- [x] 2.1 Create `packages/server/src/projections/factionControl.ts` with `FactionControlRow` type (`tileId`, `factionId`, `seizedAtTick`, `previousFactionId: string | null`, `lastSequence`) and `FactionControlProjection` class
- [x] 2.2 Implement `project(event)` handling `FACTION_TILE_SEIZED`
- [x] 2.3 Implement `rebuildFromEvents(events)`, `dominantFactionOf(tileId): FactionId | null`, `dominantTilesOf(factionId): readonly string[]`, `list(): readonly FactionControlRow[]`
- [x] 2.4 Write unit tests: project FACTION_TILE_SEIZED updates map, rebuildFromEvents restores state, unknown tile returns null, dominantTilesOf returns correct set

## 3. Area State Engine — Seizure Detection

- [x] 3.1 Add `previousDominantFaction: FactionId | null` tracking to `AreaStateEngine` (stored in state, updated each tick)
- [x] 3.2 In `areaStateEngine.tick()`, after computing new `dominantFaction`, compare with stored previous; if changed, emit `FactionSeizureIntent` (new intent type) including `tileId`, `factionId`, `previousFactionId`, `tick`
- [x] 3.3 Add hysteresis check: new dominant must lead all rivals by ≥ 5 points before emitting seizure intent
- [x] 3.4 Write unit tests: intent emitted on faction change, not emitted when faction unchanged, hysteresis prevents oscillation, null previousFactionId on first seizure

## 4. NPC Loyalty Shift Detection

- [x] 4.1 Create `packages/server/src/sim/factionLoyaltyPlanner.ts` with `planLoyaltyShifts(input)` pure function
- [x] 4.2 Input: `{ seizureIntents: FactionSeizureIntent[], npcStates: NpcRuntimeState[], tileId: string, tick: number }` — returns `FactionLoyaltyShiftIntent[]`
- [x] 4.3 Logic: for each seizure intent, for each NPC on that tile whose `factionLean !== newFaction` and `newFaction !== 'civilian'`, emit shift intent
- [x] 4.4 Write unit tests: NPC loyalty shifts on seizure, aligned NPC is skipped, civilian seizure emits no shifts

## 5. Runtime Integration

- [x] 5.1 Add `FactionControlProjection` field to `SimulationRuntime`
- [x] 5.2 Add `FACTION_TILE_SEIZED` and `FACTION_NPC_LOYALTY_SHIFTED` to boot hydration event types constant; wire both into large-log else-branch
- [x] 5.3 Wire both projections into per-event fan-out in both event loops
- [x] 5.4 In `computeNextTick`: call `areaStateEngine.tick()` to get seizure intents, run `planLoyaltyShifts`, convert intents to `FACTION_TILE_SEIZED` and `FACTION_NPC_LOYALTY_SHIFTED` commands

## 6. World Snapshot

- [x] 6.1 In `getSnapshot()`, compute `playerFactionTerritories: string[]` by intersecting player's `factionIds` with `factionControlProjection.dominantTilesOf()` for each faction
- [x] 6.2 Add `playerFactionTerritories` field to the snapshot type in `world.ts`

## 7. Chronicle Narration

- [x] 7.1 Add Chinese narration for `FACTION_TILE_SEIZED` in `chronicleRenderer.ts`: "{factionLabel} 奪取了 {tileName} 的主導權。"
- [x] 7.2 Add Chinese narration for `FACTION_NPC_LOYALTY_SHIFTED`: "{npcName} 轉向支持 {factionLabel}。"

## 8. AI Dialog Grounding

- [x] 8.1 In `aiSnapshot.ts`, add `FACTION_NPC_LOYALTY_SHIFTED` to the `consultsEventTypes` used when building NPC dialog memory context

## 9. Final Verification

- [x] 9.1 Run `npm run build` — TypeScript clean across all packages
- [x] 9.2 Run `npm test` — all tests pass including new projection and planner tests
- [x] 9.3 Update `PROGRESS.md` with v0.33.0 handoff state
- [x] 9.4 Update `ROADMAP.md` with v0.33.0 entry

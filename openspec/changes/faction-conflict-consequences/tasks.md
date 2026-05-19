## 1. Event Types & Command Registry

- [ ] 1.1 Add `FACTION_TILE_SEIZED` to event type registry in `livingWorldCommands.ts` with payload type `FactionTileSeizedCmd` (`tileId`, `factionId`, `previousFactionId: string | null`, `seizedAtTick`)
- [ ] 1.2 Add `FACTION_NPC_LOYALTY_SHIFTED` to registry with payload type `FactionNpcLoyaltyShiftedCmd` (`npcId`, `tileId`, `fromFaction`, `toFaction`, `shiftedAtTick`)
- [ ] 1.3 Add validators for both new command types in the `VALIDATORS` map
- [ ] 1.4 Add both types to the `LivingWorldCommandPayload` union

## 2. FactionControlProjection

- [ ] 2.1 Create `packages/server/src/projections/factionControl.ts` with `FactionControlRow` type (`tileId`, `factionId`, `seizedAtTick`, `previousFactionId: string | null`, `lastSequence`) and `FactionControlProjection` class
- [ ] 2.2 Implement `project(event)` handling `FACTION_TILE_SEIZED`
- [ ] 2.3 Implement `rebuildFromEvents(events)`, `dominantFactionOf(tileId): FactionId | null`, `dominantTilesOf(factionId): readonly string[]`, `list(): readonly FactionControlRow[]`
- [ ] 2.4 Write unit tests: project FACTION_TILE_SEIZED updates map, rebuildFromEvents restores state, unknown tile returns null, dominantTilesOf returns correct set

## 3. Area State Engine — Seizure Detection

- [ ] 3.1 Add `previousDominantFaction: FactionId | null` tracking to `AreaStateEngine` (stored in state, updated each tick)
- [ ] 3.2 In `areaStateEngine.tick()`, after computing new `dominantFaction`, compare with stored previous; if changed, emit `FactionSeizureIntent` (new intent type) including `tileId`, `factionId`, `previousFactionId`, `tick`
- [ ] 3.3 Add hysteresis check: new dominant must lead all rivals by ≥ 5 points before emitting seizure intent
- [ ] 3.4 Write unit tests: intent emitted on faction change, not emitted when faction unchanged, hysteresis prevents oscillation, null previousFactionId on first seizure

## 4. NPC Loyalty Shift Detection

- [ ] 4.1 Create `packages/server/src/sim/factionLoyaltyPlanner.ts` with `planLoyaltyShifts(input)` pure function
- [ ] 4.2 Input: `{ seizureIntents: FactionSeizureIntent[], npcStates: NpcRuntimeState[], tileId: string, tick: number }` — returns `FactionLoyaltyShiftIntent[]`
- [ ] 4.3 Logic: for each seizure intent, for each NPC on that tile whose `factionLean !== newFaction` and `newFaction !== 'civilian'`, emit shift intent
- [ ] 4.4 Write unit tests: NPC loyalty shifts on seizure, aligned NPC is skipped, civilian seizure emits no shifts

## 5. Runtime Integration

- [ ] 5.1 Add `FactionControlProjection` field to `SimulationRuntime`
- [ ] 5.2 Add `FACTION_TILE_SEIZED` and `FACTION_NPC_LOYALTY_SHIFTED` to boot hydration event types constant; wire both into large-log else-branch
- [ ] 5.3 Wire both projections into per-event fan-out in both event loops
- [ ] 5.4 In `computeNextTick`: call `areaStateEngine.tick()` to get seizure intents, run `planLoyaltyShifts`, convert intents to `FACTION_TILE_SEIZED` and `FACTION_NPC_LOYALTY_SHIFTED` commands

## 6. World Snapshot

- [ ] 6.1 In `getSnapshot()`, compute `playerFactionTerritories: string[]` by intersecting player's `factionIds` with `factionControlProjection.dominantTilesOf()` for each faction
- [ ] 6.2 Add `playerFactionTerritories` field to the snapshot type in `world.ts`

## 7. Chronicle Narration

- [ ] 7.1 Add Chinese narration for `FACTION_TILE_SEIZED` in `chronicleRenderer.ts`: "{factionLabel} 奪取了 {tileName} 的主導權。"
- [ ] 7.2 Add Chinese narration for `FACTION_NPC_LOYALTY_SHIFTED`: "{npcName} 轉向支持 {factionLabel}。"

## 8. AI Dialog Grounding

- [ ] 8.1 In `aiSnapshot.ts`, add `FACTION_NPC_LOYALTY_SHIFTED` to the `consultsEventTypes` used when building NPC dialog memory context

## 9. Final Verification

- [ ] 9.1 Run `npm run build` — TypeScript clean across all packages
- [ ] 9.2 Run `npm test` — all tests pass including new projection and planner tests
- [ ] 9.3 Update `PROGRESS.md` with v0.33.0 handoff state
- [ ] 9.4 Update `ROADMAP.md` with v0.33.0 entry

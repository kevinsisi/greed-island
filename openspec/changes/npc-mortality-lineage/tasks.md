## 1. Event Types & Command Registry

- [x] 1.1 Add `NPC_DECEASED` to the event type registry in `livingWorldCommands.ts` with payload type `NpcDeceasedCmd` (`npcId`, `tileId`, `householdId`, `deceasedAtTick`, `narration`)
- [x] 1.2 Add `NPC_HEIR_ASSIGNED` to the registry with payload type `NpcHeirAssignedCmd` (`householdId`, `deceasedNpcId`, `heirNpcId`, `assignedAtTick`, `narration`)
- [x] 1.3 Add validators for both new command types in the `VALIDATORS` map
- [x] 1.4 Add both types to the `LivingWorldCommandPayload` union

## 2. Config Constants

- [x] 2.1 Add `NPC_BASE_LIFESPAN_TICKS`, `NPC_LIFESPAN_VARIANCE_TICKS`, `MORTALITY_CADENCE_TICKS` to `config/world.ts`
- [x] 2.2 Add `npcLifespanTicks(npcId: string): number` pure function to `config/world.ts` using deterministic hash (same pattern as other hash-based deterministic values in the codebase)

## 3. NpcMortalityProjection

- [x] 3.1 Create `packages/server/src/projections/npcMortality.ts` with `NpcMortalityRow` type (`npcId`, `deceasedAtTick`) and `NpcMortalityProjection` class
- [x] 3.2 Implement `project(event)` handling `NPC_DECEASED`
- [x] 3.3 Implement `rebuildFromEvents(events)`, `isDeceased(npcId): boolean`, `list(): readonly NpcMortalityRow[]`
- [x] 3.4 Write unit tests: project NPC_DECEASED, rebuildFromEvents restores state, isDeceased returns false for unknown npc

## 4. NpcLineageProjection

- [x] 4.1 Create `packages/server/src/projections/npcLineage.ts` with `NpcHeirRecord` type and `NpcLineageProjection` class
- [x] 4.2 Implement constructor accepting `NpcProfile[]` — builds `householdId` map (defaults to `npcId` when profile has no `householdId`)
- [x] 4.3 Implement `project(event)` handling `NPC_HEIR_ASSIGNED`
- [x] 4.4 Implement `householdId(npcId)`, `membersOf(householdId)`, `heirHistory(householdId)`, `livingMembersOf(householdId, mortalityProjection)`
- [x] 4.5 Write unit tests: solo household id, multi-member household heir selection order, heir history chain

## 5. Mortality Planner

- [x] 5.1 Create `packages/server/src/sim/mortalityPlanner.ts` with `planMortality(input)` pure function
- [x] 5.2 Input: `{ currentTick, profiles, mortalityProjection, lineageProjection }` — returns `MortalityIntent[]` (one per NPC to die this tick)
- [x] 5.3 Logic: for each profile not in mortalityProjection, check `currentTick - (profile.bornAtTick ?? 0) >= npcLifespanTicks(profile.id)`; emit intent if true; only run when `currentTick % MORTALITY_CADENCE_TICKS === 0`
- [x] 5.4 Implement heir selection in planner: for each death intent, find oldest living household member from `lineageProjection.livingMembersOf(householdId)`
- [x] 5.5 Write unit tests: NPC dies at correct tick, skips deceased NPCs, heir is oldest surviving member, no heir for solo household

## 6. Runtime Integration

- [x] 6.1 Add `NpcMortalityProjection` and `NpcLineageProjection` fields to `SimulationRuntime`
- [x] 6.2 Add `NPC_DECEASED` and `NPC_HEIR_ASSIGNED` to `MORTALITY_BOOT_EVENT_TYPES` constant; wire both projections into the large-log else-branch boot hydration
- [x] 6.3 Wire both projections into per-event fan-out in both event loops
- [x] 6.4 Add mortality cadence block in `computeNextTick`: call `planMortality(...)` and convert intents to `NPC_DECEASED`, `HOUSEHOLD_INHERITANCE_ASSIGNED`, and (when heir exists) `NPC_HEIR_ASSIGNED` commands
- [x] 6.5 In `getSnapshot().npcs`, add `deceased: boolean` field: `true` when `mortalityProjection.isDeceased(npcId)`

## 7. Chronicle Narration

- [x] 7.1 Add Chinese narration for `NPC_DECEASED` in `chronicleRenderer.ts`: "{name} 走完了他在潮鳴市的一生。"
- [x] 7.2 Add Chinese narration for `NPC_HEIR_ASSIGNED`: "{heirName} 承繼了 {deceasedName} 留下的位置。"
- [x] 7.3 Suppress `HOUSEHOLD_INHERITANCE_ASSIGNED` from public chronicle (add to suppressed set — internal accounting event)

## 8. AI Dialog Grounding

- [x] 8.1 In `aiSnapshot.ts`, add `NPC_DECEASED` and `NPC_HEIR_ASSIGNED` to the global `consultsEventTypes` used when building NPC dialog memory context

## 9. Final Verification

- [x] 9.1 Run `npm run build` — TypeScript clean across all packages
- [x] 9.2 Run `npm test` — all tests pass including new mortality and lineage projection tests
- [x] 9.3 Manual verification: confirm `npcLifespanTicks` is deterministic (same input same output)
- [x] 9.4 Update `PROGRESS.md` with v0.32.0 handoff state
- [x] 9.5 Update `ROADMAP.md` with v0.32.0 entry

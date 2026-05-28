## 1. Config Constants & Name Pool

- [ ] 1.1 Add `NPC_MATURATION_TICKS = 17_280` and `MATURATION_CADENCE_TICKS = 720` to `packages/server/src/config/world.ts`
- [ ] 1.2 Create `packages/server/src/data/npcChildNamePool.ts` exporting a `readonly` array of ≥20 bilingual entries `{ nameZh: string; nameEn: string }` following 潮鳴市 naming conventions
- [ ] 1.3 Implement and export `generateChildName(childId: string, householdId: string): { nameZh: string; nameEn: string }` in the same file, using `hashInt(childId + ':name') % pool.length`
- [ ] 1.4 Add unit tests for `generateChildName`: determinism (same input → same output), diversity across 20 distinct childIds, both fields non-empty

## 2. Event Type Registry

- [ ] 2.1 Add `NPC_MATURED` to the event type literal union in `packages/server/src/kernel/livingWorldCommands.ts`
- [ ] 2.2 Define `NpcMaturedCmd` payload type: `{ npcId: string; maturedAtTick: number; bornAtTick: number; householdId: string; parentNpcIds: readonly string[]; homeTileId: string; nameZh: string; nameEn: string; narration?: string }`
- [ ] 2.3 Add `NPC_MATURED` to `LivingWorldCommandPayload` discriminated union
- [ ] 2.4 Add validator for `NPC_MATURED` to the `VALIDATORS` map (npcId non-empty, parentNpcIds non-empty array, etc.)

## 3. BornNpcsProjection

- [ ] 3.1 Create `packages/server/src/projections/bornNpcs.ts` with `BornNpcsProjection` class
- [ ] 3.2 Implement `deriveProfile(payload: NpcMaturedCmd['payload']): NpcProfile` — pure function using `hashSeed(npcId, ...)` for personality archetype/patience/greed/talkativeness/factionLean, role.zh/role.en from a small archetype-keyed map, defaultLocation from `homeTileId`, minimal default routine (3 windows: morning home, midday central, evening home), `triggers: []`
- [ ] 3.3 Implement `project(event)` handling `NPC_CHILD_BORN` (stash child metadata for later promotion) and `NPC_MATURED` (derive + store profile)
- [ ] 3.4 Implement `rebuildFromEvents(events)`, `listMaturedProfiles(): readonly NpcProfile[]`, `getProfile(npcId): NpcProfile | null`, `isMatured(npcId): boolean`, `getParentNpcIds(npcId): readonly string[]`
- [ ] 3.5 Guard against collision: throw if `npcId` matches a known config profile id
- [ ] 3.6 Unit tests: derived profile is deterministic; `NPC_MATURED` adds to roster; `NPC_CHILD_BORN` without subsequent matured is excluded; `rebuildFromEvents` reconstructs state; collision guard fires

## 4. NpcEngine Dynamic Registration

- [ ] 4.1 Change `NpcEngine`'s internal profile container from constructor-bound `readonly NpcProfile[]` to a mutable `Map<string, NpcProfile>` seeded from constructor args
- [ ] 4.2 Add public method `registerDynamicNpc(profile: NpcProfile): void` that adds to the map (idempotent on existing ids — does not reset existing runtime state) and initializes `NpcRuntimeState` with `tile = profile.defaultLocation`, `activity = 'idle'`, `mood = 60`, `health = 80`
- [ ] 4.3 Add public method `listProfiles(): readonly NpcProfile[]` for iteration
- [ ] 4.4 Update all places `NpcEngine` references `this.profiles` to iterate the new Map
- [ ] 4.5 Unit tests: dynamic registration adds runtime state; second registration of same id does not overwrite; `listProfiles` returns the union

## 5. Maturation Planner

- [ ] 5.1 Create `packages/server/src/sim/maturationPlanner.ts` with `planMaturation(input): MaturationIntent[]` pure function
- [ ] 5.2 Input: `{ currentTick, lifeExpansion, bornNpcsProjection, mortalityProjection, householdRecords }` (where `householdRecords` provides `bornAtTick` per childId and `parentNpcIds` from the household)
- [ ] 5.3 Logic: only run when `currentTick % MATURATION_CADENCE_TICKS === 0`; for each `childId` in any household whose `currentTick - bornAtTick >= NPC_MATURATION_TICKS` AND not already `bornNpcsProjection.isMatured(childId)` AND at least one of `parentNpcIds` is not in `mortalityProjection.deceasedIds`, emit intent
- [ ] 5.4 Each intent carries the full `NpcMaturedCmd` payload (parents, homeTileId, names, bornAtTick)
- [ ] 5.5 Unit tests: matures at threshold; skips before threshold; cadence-gates; skips already-matured; skips full-orphan (both parents dead); does not skip if one parent alive

## 6. Runtime Integration

- [ ] 6.1 Add `BornNpcsProjection` field to `SimulationRuntime`; instantiate in constructor with config profile ids for collision guard
- [ ] 6.2 Add `BORN_NPC_BOOT_EVENT_TYPES = ['NPC_CHILD_BORN', 'NPC_MATURED']` constant; wire into the large-log else-branch boot hydration
- [ ] 6.3 After boot hydration of `BornNpcsProjection`, iterate `listMaturedProfiles()` and call `this.npcEngine.registerDynamicNpc(profile)` for each — done before first tick is processed
- [ ] 6.4 Wire `BornNpcsProjection.project(ev)` into per-event fan-out in both event loops
- [ ] 6.5 In `computeNextTick`, when `NPC_MATURED` is committed, call `npcEngine.registerDynamicNpc(bornNpcsProjection.getProfile(npcId)!)` so the new NPC participates in subsequent tick processing
- [ ] 6.6 Add maturation cadence block in `computeNextTick`: call `planMaturation(...)`; for each intent, build a `NPC_MATURED` command via `makeLivingWorldCommand`
- [ ] 6.7 Update `runtime.getNpcs()` to iterate `npcEngine.listProfiles()` (which now includes registered dynamic profiles) rather than `this.profiles` directly
- [ ] 6.8 Update `runtime.getManualNpcIds()` semantics to return only config-loaded ids (matured NPCs are NOT manual) — explicitly subtract `bornNpcsProjection.listMaturedProfiles().map(p => p.id)`

## 7. NPC_CHILD_BORN Name Generation

- [ ] 7.1 In `planHouseholdCommands` (runtime.ts ~line 5316), replace hardcoded `nameZh: '潮生'` / `nameEn: 'Tideborn'` with `const { nameZh, nameEn } = generateChildName(childId, household.householdId)`
- [ ] 7.2 Use those values in the `NPC_CHILD_BORN` payload
- [ ] 7.3 Verify in a test that two different households produce two `NPC_CHILD_BORN` events with usually-distinct names

## 8. LifeExpansionState Birth-Tick Recording

- [ ] 8.1 Inspect `LifeExpansionState.households[].childIds` storage — if it's only `string[]`, extend to record `{ childId, bornAtTick }` (or attach a parallel `childBornAtTick: Record<childId, tick>` map on `LifeExpansionState`) so the maturation planner has the birth tick available
- [ ] 8.2 Update `withChildBorn` in `lifeExpansion.ts` to store the tick alongside the child id
- [ ] 8.3 Update `lifeExpansion.test.ts` to assert birth tick is preserved
- [ ] 8.4 (Backward compatibility note) Old events lack tick info on rebuild — fall back to `event.tick ?? 0`

## 9. Boot Hydration Wiring (large-log else-branch)

- [ ] 9.1 Add `BORN_NPC_BOOT_EVENT_TYPES` to the `eventTypes` array passed to the `readEventsByTickWindow` call inside the large-log else-branch boot hydration block
- [ ] 9.2 For each fetched event, call `bornNpcsProjection.project(ev)`
- [ ] 9.3 Add idempotency test: hydrate the same EventLog twice, verify projection state is identical

## 10. Chronicle Narration & Suppression

- [ ] 10.1 Add Chinese narration template for `NPC_MATURED` in `chronicleRenderer.ts`: "{nameZh} 在 {tileName} 長成一個獨立的人。"
- [ ] 10.2 Add English fallback: "{nameEn} comes of age in {tileName}."
- [ ] 10.3 Verify `NPC_CHILD_BORN` chronicle entry remains visible (already wired) and does NOT get suppressed

## 11. AI Dialog Grounding Extensions

- [ ] 11.1 In `aiSnapshot.ts` (or wherever `AiDialogContext` is built), inject `bornNpcsProjection.getParentNpcIds(npcId)` into the dialog context for matured born NPCs
- [ ] 11.2 In `npcMemory.ts` and `aiDialog.ts`, ensure matured born NPCs' ids are valid `knownPerson` candidates — no filter exclusion
- [ ] 11.3 Verify the anti-hallucination guard allows the matured NPC's `nameZh` to appear (i.e., the candidate name set includes matured NPCs)
- [ ] 11.4 Add integration test: a matured NPC's dialog context includes their parent names; another NPC's dialog context references the matured NPC by name after an interaction

## 12. Admin Dashboard

- [ ] 12.1 Verify `adminNpcsRouter.ts` `byOrigin.born` now reflects matured roster (no code change needed — the value is computed from `totalNpcs - manualNpcIds.size` which automatically excludes matured ids since they're not in `getManualNpcIds()`)
- [ ] 12.2 Add a "matured" field to the response: `{ total, recent: [{tick, npcId, householdId, nameZh}] }` — derived from `NPC_MATURED` events; mirror the births feed shape
- [ ] 12.3 Update `AdminNpcsPage.tsx` to show "近期成長" section (matured NPCs) below "近期出生"
- [ ] 12.4 Add i18n entries for `admin.npcs.maturedHeading`, `admin.npcs.maturedEmpty`, `admin.npcs.statMatured`, `admin.npcs.colName`

## 13. Frontend Snapshot Compatibility

- [ ] 13.1 Inspect `packages/web/src/state/WorldStateContext.tsx` and snapshot deserializers — ensure they handle a growing `npcs[]` array without hardcoded counts
- [ ] 13.2 Grep `npcs.length === 50` / `npcs.length === N` across web tests; replace with `>=` semantics or filter by config-id pattern

## 14. Final Verification

- [ ] 14.1 Run `npm run build` at repo root — TypeScript clean across server + web
- [ ] 14.2 Run `npm test` — all existing + new tests pass; verify total test count grew by the count of new tests added
- [ ] 14.3 Manual integration: start fresh world, run for `NPC_MATURATION_TICKS + 1000` ticks, verify `runtime.getNpcs()` size grew by ≥ 1 and at least one NPC has id matching `household.*.child.*` pattern
- [ ] 14.4 Manual integration: restart server with a populated EventLog, verify matured NPC roster persists
- [ ] 14.5 Verify `/admin/npcs` "近期成長" table populates with at least one matured NPC after threshold
- [ ] 14.6 Update `PROGRESS.md` with v0.86.0 handoff state (assuming this change lands at v0.86.0)
- [ ] 14.7 Update `ROADMAP.md` with v0.86.0 entry
- [ ] 14.8 Update `docs/WORLD_CAPABILITIES.md` §27 to add "Born NPC entity runtime ✅ v0.86.0" line
- [ ] 14.9 Update `docs/WORLD_CAPABILITIES.md` §43.1 first criterion verification note (descendants exist as runtime entities)
- [ ] 14.10 Commit + push (per CLAUDE.md Global Working Rules)

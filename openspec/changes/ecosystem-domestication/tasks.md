## 1. Species Catalog

- [x] 1.1 Add `marsh_yak` to `SPECIES_CATALOG` in `species.ts` with `category: 'livestock'`, biome `salt_marsh`, byproducts `['milk', 'hide']`, `mountEligible: true`, and appropriate stats
- [x] 1.2 Add `mountEligible?: boolean` field to `Species` type in `species.ts`
- [x] 1.3 Verify `listSpeciesByCategory('livestock')` returns `marsh_yak`

## 2. Command Types

- [x] 2.1 Add `AnimalDomesticatedPayload`, `LivestockBredPayload`, `LivestockSlaughteredPayload`, `MountAssignedPayload` to `livingWorldCommands.ts`
- [x] 2.2 Add all four payload types to the `LivingWorldCommandPayload` union
- [x] 2.3 Add `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `LIVESTOCK_SLAUGHTERED`, `MOUNT_ASSIGNED` event type constants to the event type registry

## 3. LivestockRegistryProjection

- [x] 3.1 Create `packages/server/src/projections/livestockRegistry.ts` with `LivestockRegistryRow` type (`animalId`, `speciesId`, `role: 'livestock' | 'mount'`, `mountedBy: string | null`, `settlementId`, `acquiredAtTick`)
- [x] 3.2 Implement `LivestockRegistryProjection` class handling `ANIMAL_DOMESTICATED` (add row), `LIVESTOCK_BRED` (add row), `LIVESTOCK_SLAUGHTERED` (remove row), `MOUNT_ASSIGNED` (update role + mountedBy)
- [x] 3.3 Add `getBySettlement(settlementId: string): readonly LivestockRegistryRow[]` method
- [x] 3.4 Add `getLivestockCount(settlementId: string, speciesId: string): number` helper
- [x] 3.5 Write unit tests for all four event handlers and replay consistency

## 4. DomesticationPlanner

- [x] 4.1 Create `packages/server/src/ecosystem/domesticationPlanner.ts` with `DomesticationIntent` type and `planDomestication` pure function
- [x] 4.2 Implement condition checks: wild pop ≥ `DOMESTICATION_MIN_WILD_POP`, livestock < ranchCapacity, ranch building present
- [x] 4.3 Add `DOMESTICATION_MIN_WILD_POP = 5` constant to ecosystem config
- [x] 4.4 Write unit tests: intent emitted when met, null when pop too low, null at capacity, null without ranch

## 5. BreedingPlanner

- [x] 5.1 Create `packages/server/src/ecosystem/breedingPlanner.ts` with `BreedingIntent` type and `planBreeding` pure function
- [x] 5.2 Implement: ≥ 2 same-species livestock, count + 1 ≤ ranchCapacity, cadence gate
- [x] 5.3 Add `BREEDING_CADENCE_TICKS` constant to ecosystem config
- [x] 5.4 Write unit tests: intent on valid state, null with 1 animal, null at capacity

## 6. SlaughterPlanner

- [x] 6.1 Create `packages/server/src/ecosystem/slaughterPlanner.ts` with `SlaughterIntent` type and `planSlaughter` pure function
- [x] 6.2 Implement: overflow check, oldest-first selection, byproduct goods list from species definition
- [x] 6.3 Write unit tests: slaughter oldest when over capacity, null when within capacity

## 7. MountPlanner

- [x] 7.1 Create `packages/server/src/ecosystem/mountPlanner.ts` with `MountAssignmentIntent` type and `planMountAssignment` pure function
- [x] 7.2 Implement: find unassigned mount-eligible livestock + unmounted carrier NPC at same settlement, one assignment per NPC
- [x] 7.3 Write unit tests: assignment on valid pair, empty on no eligible animals

## 8. Ranch Building Type

- [x] 8.1 Add `ranch` to the building type catalog with `livestockCapacity: 8`
- [x] 8.2 Ensure `DomesticationPlanner` receives ranch presence from `CivilizationProjection` or equivalent
- [x] 8.3 Verify `planDomestication` returns null for settlement without completed ranch in tests

## 9. Wild Population Filter

- [x] 9.1 In `animalSpawning.ts`, filter input animals by `ownerSettlementId === null` before computing wild population count
- [x] 9.2 In `predation.ts` (or equivalent), exclude animals with `ownerSettlementId !== null` from prey candidate set
- [x] 9.3 In `extinctionPlanner.ts`, exclude domesticated animals from wild count used for extinction threshold
- [x] 9.4 Write tests asserting domesticated animals are not counted in wild population decisions

## 10. Runtime Integration (E3 Cadence Block)

- [x] 10.1 Add `LivestockRegistryProjection` import and field to `runtime.ts`
- [x] 10.2 Add `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `LIVESTOCK_SLAUGHTERED`, `MOUNT_ASSIGNED` to `ECOSYSTEM_BOOT_EVENT_TYPES`
- [x] 10.3 Wire `LivestockRegistryProjection` into both boot hydration branches (small-log all-events + large-log else)
- [x] 10.4 Wire projection fan-out for the four new event types in both per-event loops
- [x] 10.5 Add E3 cadence block calling `DomesticationPlanner`, `BreedingPlanner`, `SlaughterPlanner`, `MountPlanner` and submitting resulting intents as commands
- [x] 10.6 Add `DOMESTICATION_CADENCE_TICKS` constant and wire into the E3 cadence block
- [x] 10.7 Add `mountSpeedMultiplier` lookup: when NPC has `mountedAnimalId`, apply multiplier (1.5×) to travel tick calculations
- [x] 10.8 Expose `livestockRegistry` in `getSnapshot()` facts

## 11. Chronicle Narration

- [x] 11.1 Add `ANIMAL_DOMESTICATED` to suppressed-from-public-narration set in `chronicleRenderer.ts`
- [x] 11.2 Add Chinese narration for `LIVESTOCK_SLAUGHTERED` (settlement slaughters animal, produces goods)
- [x] 11.3 Add Chinese narration for `MOUNT_ASSIGNED` (NPC gains a mount)

## 12. Admin UI

- [x] 12.1 Add "馴養登記" section to `AdminWorldPage.tsx` showing per-settlement livestock registry table (columns: settlement, species, role, count, mounts)
- [x] 12.2 Wire section to `getSnapshot()` `livestockRegistry` data

## 13. Final Verification

- [x] 13.1 Run `npm run build` — TypeScript clean across all packages
- [x] 13.2 Run `npm test` — all tests pass including new planner and projection tests
- [x] 13.3 Verify `marsh_yak` appears in `listSpeciesByCategory('livestock')` output
- [x] 13.4 Update `PROGRESS.md` with v0.28.0 handoff state

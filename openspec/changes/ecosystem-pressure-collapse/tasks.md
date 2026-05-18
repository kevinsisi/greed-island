# Tasks — Ecosystem Pressure & Collapse (Phase E2)

## 1. Config Constants

- [x] 1.1 Add `SPECIES_EXTINCT_GRACE_TICKS`, `ECOSYSTEM_PRESSURE_WORK_THRESHOLD`, `ECOSYSTEM_PRESSURE_RECOVERY_TICKS`, `FISHERY_RECOVERY_RATE`, `FISHERY_RECOVERY_BUFFER` to `config/world.ts`.

## 2. Command / Event Types

- [x] 2.1 Add `SPECIES_EXTINCTION_WARNING`, `SPECIES_EXTINCT`, `SPECIES_RECOVERED`, `FISHERY_RECOVERED`, `ECOSYSTEM_PRESSURE_RAISED`, `ECOSYSTEM_PRESSURE_RECOVERED` to `livingWorldCommands.ts` with validators.
- [x] 2.2 Add command catalog unit tests for each new type.

## 3. SpeciesExtinctionProjection

- [x] 3.1 Create `packages/server/src/projections/speciesExtinction.ts` with `SpeciesExtinctionRow` type, `SpeciesExtinctionProjection` class (`project`, `rebuildFromEvents`, `getStatus`, `list`, `canonicalHash`).
- [x] 3.2 Add `speciesExtinction.test.ts` covering: warning on low population, extinction on zero, recovery clears extinct state, rebuild yields same result as incremental.

## 4. EcosystemRegionProjection

- [x] 4.1 Create `packages/server/src/projections/ecosystemRegion.ts` with `EcosystemRegionRow` type, `EcosystemRegionProjection` class (`project`, `rebuildFromEvents`, `getForTile`, `list`, `canonicalHash`).
- [x] 4.2 Add `ecosystemRegion.test.ts` covering: pressure raised and retrieved, pressure recovered resets level, rebuild consistency.

## 5. Extinction Planner

- [x] 5.1 Create `packages/server/src/ecosystem/extinctionPlanner.ts` with `planSpeciesExtinctionCheck` pure function.
- [x] 5.2 Add `extinctionPlanner.test.ts`: warning on single tile below threshold, extinction after all tiles zero, recovery event on re-population, no duplicate warnings for already-warned species.

## 6. Fishery Planner Upgrade

- [x] 6.1 Extend existing fishery planner (or `planFisheryHarvest` in `runtime.ts`) to emit `FISHERY_RECOVERED` when density crosses above `FISHERY_COLLAPSE_THRESHOLD + FISHERY_RECOVERY_BUFFER` and tile was collapsed.
- [x] 6.2 Add passive fishery density regeneration: on reproduction cadence, if `density < FISHERY_DEFAULT_DENSITY && density > 0`, increment by `FISHERY_RECOVERY_RATE`.
- [x] 6.3 Update fishery planner tests for recovery path.

## 7. Ecosystem Pressure Planner

- [x] 7.1 Create `packages/server/src/ecosystem/pressurePlanner.ts` with `planEcosystemPressure` pure function.
- [x] 7.2 Add `pressurePlanner.test.ts`: raise on heavy work, recover on idle, no double-raise, no raise below threshold.

## 8. Spawn Rate Modifier

- [x] 8.1 Add `spawnRateModifier(species, pressureLevel)` helper in `animalSpawning.ts`.
- [x] 8.2 Apply modifier in `planAnimalSpawns` — high pressure tiles spawn fewer low-tolerance species.
- [x] 8.3 Update `animalSpawning.test.ts` to cover reduced spawn on high-pressure tile.

## 9. Runtime Integration

- [x] 9.1 Instantiate `SpeciesExtinctionProjection` and `EcosystemRegionProjection` in `SimulationRuntime`.
- [x] 9.2 Wire both projections into boot hydration `else` branch with `EXTINCTION_BOOT_EVENT_TYPES` constant.
- [x] 9.3 Wire `planSpeciesExtinctionCheck` into reproduction cadence block; submit intents.
- [x] 9.4 Wire fishery recovery planner into fishery cadence block.
- [x] 9.5 Track per-tick NPC work action counts per tile; wire `planEcosystemPressure` on reproduction cadence.
- [x] 9.6 Fan accepted events into both new projections in per-event loop.
- [x] 9.7 Add `extinctionWarnings` and `ecosystemRegions` to `WorldSnapshot.facts`.

## 10. Chronicle Integration

- [x] 10.1 Update `chronicleRenderer.ts`: `SPECIES_EXTINCT` → Chinese narration; `SPECIES_RECOVERED` → Chinese narration; suppress warning/pressure/fishery recovery events.

## 11. Admin UI

- [x] 11.1 Add "生態壓力" section to `/admin/world` page: species extinction status table (✅/⚠️/☠️) and ecosystem region pressure table.
- [x] 11.2 Basic rendering test or visual smoke check.

## 12. Verification

- [x] 12.1 All focused tests pass (new projections, planners, runtime integration).
- [x] 12.2 Full server test suite passes (`npm run test:server`).
- [x] 12.3 Web build passes (`npm run build:web`).
- [x] 12.4 `npx openspec validate --all --strict` passes.
- [x] 12.5 Bump version to v0.27.0, update `PROGRESS.md` and `ROADMAP.md`.
- [ ] 12.6 Commit, push, verify CI + Docker deploy smoke.

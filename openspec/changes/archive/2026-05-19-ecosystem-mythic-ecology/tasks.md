## 1. Species Catalog

- [x] 1.1 Add `white_marsh_leviathan` to `species.ts` with `rarity: 'legendary'`, `biomeAffinity: ['salt_marsh']`, elevated threat stats, low prey base
- [x] 1.2 Add `iron_hound` to `species.ts` with `rarity: 'legendary'`, `biomeAffinity: ['ruin']`, elevated threat stats, singleton carryingCapacity
- [x] 1.3 Add `rarity: 'legendary'` as a valid `SpeciesRarity` variant in `species.ts` types
- [x] 1.4 Update species count in `species.test.ts` — iron_hound legendary verified; count stays 23 (both species pre-existed)

## 2. Living World Commands

- [x] 2.1 Add `LEGENDARY_WORLD_EVENT_SPAWNED` and `LEGENDARY_WORLD_EVENT_RESOLVED` command/payload types to `livingWorldCommands.ts`
- [x] 2.2 Add `LEGENDARY_HUNT_STARTED` and `LEGENDARY_HUNT_CONCLUDED` command/payload types to `livingWorldCommands.ts`
- [x] 2.3 Add `FOREST_CLEARCUT_ORDERED`, `FISHING_QUOTA_ENFORCED`, `INDUSTRIAL_SITE_SABOTAGED`, `RITUAL_ECOSYSTEM_MANIPULATION` command/payload types to `livingWorldCommands.ts`
- [x] 2.4 Add `ecologyStance` field to faction type definitions (via `FactionDef` in `factionEcologyPlanner.ts` + static stances in runtime)

## 3. World Config Constants

- [x] 3.1 Add `LEGENDARY_SPAWN_CADENCE_TICKS`, `LEGENDARY_SPAWN_PROBABILITY`, `LEGENDARY_MAX_PRESSURE`, `LEGENDARY_SPAWN_MIN_PREY`, `LEGENDARY_WORLD_EVENT_SEVERITY`, `LEGENDARY_HUNT_MIN_HUNTERS`, `LEGENDARY_HUNT_THRESHOLD_TICKS` to `config/world.ts`
- [x] 3.2 Add `FACTION_ECOLOGY_CADENCE_TICKS`, `GUILD_CLEARCUT_PRESSURE_THRESHOLD`, `TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD`, `FREE_RUNNERS_LIVESTOCK_THRESHOLD` to `config/world.ts`

## 4. WorldEventProjection

- [x] 4.1 Create `packages/server/src/projections/worldEvent.ts` — `WorldEventRow` type + `WorldEventProjection` class with `project`, `rebuildFromEvents`, `getActiveByTile`, `getActiveByAnimalId`, `list`, and `snapshot` methods
- [x] 4.2 Add `WorldEventProjection` to `ECOSYSTEM_BOOT_EVENT_TYPES` in `runtime.ts` (both boot branches + per-event fan-out)
- [x] 4.3 Write `packages/server/src/projections/worldEvent.test.ts` — spawn → active, resolve → cleared, huntStartedEmitted flag, boot hydration from EventLog

## 5. Legendary Spawn Planner

- [x] 5.1 Create `packages/server/src/ecosystem/legendarySpawnPlanner.ts` — singleton check, prey threshold, pressure check, deterministic hash probability, return `ANIMAL_SPAWNED` intent or null
- [x] 5.2 Write `packages/server/src/ecosystem/legendarySpawnPlanner.test.ts` — singleton blocks second spawn, high pressure suppresses spawn, probability is deterministic

## 6. Legendary Hunt Planner

- [x] 6.1 Create `packages/server/src/ecosystem/legendaryHuntPlanner.ts` — `LegendaryHuntTracker` in-memory map, per-tick hunter count over active world events, emit `LEGENDARY_HUNT_STARTED` / `LEGENDARY_HUNT_CONCLUDED` when thresholds met
- [x] 6.2 Write `packages/server/src/ecosystem/legendaryHuntPlanner.test.ts` — clustering below threshold emits nothing, sustained clustering emits started, duplicate re-emit blocked by `huntStartedEmitted`, kill emits concluded

## 7. Faction Ecology Planner

- [x] 7.1 Create `packages/server/src/ecosystem/factionEcologyPlanner.ts` — 4 stance handlers reading ecosystem pressure / fishery density / livestock count, return faction ecology commands
- [x] 7.2 Write `packages/server/src/ecosystem/factionEcologyPlanner.test.ts` — guild clearcut on high pressure, tide hunters quota on low density, free runners sabotage on high livestock, hidden overseer unconditional

## 8. Runtime Wiring

- [x] 8.1 Instantiate `WorldEventProjection` + `LegendaryHuntTracker` in `runtime.ts`; add to projection fields
- [x] 8.2 Add E4 cadence block in `runtime.ts`: invoke `legendarySpawnPlanner` every `LEGENDARY_SPAWN_CADENCE_TICKS`; invoke `factionEcologyPlanner` every `FACTION_ECOLOGY_CADENCE_TICKS`
- [x] 8.3 Add per-tick `legendaryHuntPlanner` call in `runtime.ts` main tick loop, after NPC tick
- [x] 8.4 Add fan-out in `runtime.ts`: on `ANIMAL_SPAWNED` for legendary species → emit `LEGENDARY_WORLD_EVENT_SPAWNED`
- [x] 8.5 Add fan-out in `runtime.ts`: on `ANIMAL_KILLED` / `ANIMAL_STARVED` / `ANIMAL_MIGRATED` for tracked legendary animal → emit `LEGENDARY_WORLD_EVENT_RESOLVED` and optionally `LEGENDARY_HUNT_CONCLUDED`
- [x] 8.6 Add `areaSafety` patch in `runtime.ts`: subtract world event severity from tile safety before passing to `npcEngine.tick()`

## 9. Chronicle Narration

- [x] 9.1 Add Chinese narration in `chronicleRenderer.ts` for `LEGENDARY_WORLD_EVENT_SPAWNED` (species name + tile + event kind)
- [x] 9.2 Add Chinese narration in `chronicleRenderer.ts` for `LEGENDARY_WORLD_EVENT_RESOLVED` (species + resolution context)
- [x] 9.3 Add Chinese narration in `chronicleRenderer.ts` for `LEGENDARY_HUNT_STARTED` and `LEGENDARY_HUNT_CONCLUDED` (tile + outcome)
- [x] 9.4 Add Chinese narration in `chronicleRenderer.ts` for all 4 faction ecology command types

## 10. Snapshot Facts

- [x] 10.1 Add `activeWorldEvents` to `WorldSnapshot.facts` — array from `worldEventProjection.snapshot()`
- [x] 10.2 Add `factionEcologyStances` to `WorldSnapshot.facts` — static faction stance map

## 11. Admin UI

- [x] 11.1 Add "神話生態 Mythic Ecology" section to `AdminWorldPage.tsx` displaying active world events (kind, tile, severity, linkedAnimalId, spawnedAtTick)
- [x] 11.2 Add faction ecology stance table to the same section (factionId, ecologyStance)

## 12. Verification

- [x] 12.1 Run `npm run build` (root) and confirm zero TypeScript errors
- [x] 12.2 Run `npm test --workspace=packages/server` — 685/685 tests pass, 99 test files
- [x] 12.3 Docker smoke test: rebuild local stack, confirm `/api/world` facts include `activeWorldEvents` key
- [x] 12.4 Update `PROGRESS.md` with v0.29.0 handoff evidence
- [x] 12.5 Update `ROADMAP.md` with v0.29.0 entry

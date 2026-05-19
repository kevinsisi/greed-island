## 1. Species Catalog

- [ ] 1.1 Add `white_marsh_leviathan` to `species.ts` with `rarity: 'legendary'`, `biomeAffinity: ['salt_marsh']`, elevated threat stats, low prey base
- [ ] 1.2 Add `iron_hound` to `species.ts` with `rarity: 'legendary'`, `biomeAffinity: ['mountain']`, elevated threat stats
- [ ] 1.3 Add `rarity: 'legendary'` as a valid `SpeciesRarity` variant in `species.ts` types
- [ ] 1.4 Update species count in `species.test.ts` (23 → 25 total, +1 salt_marsh, +1 mountain)

## 2. Living World Commands

- [ ] 2.1 Add `WORLD_EVENT_SPAWNED` and `WORLD_EVENT_RESOLVED` command/payload types to `livingWorldCommands.ts`
- [ ] 2.2 Add `LEGENDARY_HUNT_STARTED` and `LEGENDARY_HUNT_CONCLUDED` command/payload types to `livingWorldCommands.ts`
- [ ] 2.3 Add `FOREST_CLEARCUT_ORDERED`, `FISHING_QUOTA_ENFORCED`, `INDUSTRIAL_SITE_SABOTAGED`, `RITUAL_ECOSYSTEM_MANIPULATION` command/payload types to `livingWorldCommands.ts`
- [ ] 2.4 Add `ecologyStance` field to faction type definitions (or world config faction statics map)

## 3. World Config Constants

- [ ] 3.1 Add `LEGENDARY_SPAWN_CADENCE_TICKS`, `LEGENDARY_SPAWN_PROBABILITY`, `LEGENDARY_MAX_PRESSURE`, `LEGENDARY_HUNT_MIN_HUNTERS`, `LEGENDARY_HUNT_THRESHOLD_TICKS` to `config/world.ts`
- [ ] 3.2 Add `FACTION_ECOLOGY_CADENCE_TICKS`, faction ecology threshold constants (`GUILD_CLEARCUT_PRESSURE_THRESHOLD`, `TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD`, `FREE_RUNNERS_LIVESTOCK_THRESHOLD`) to `config/world.ts`

## 4. WorldEventProjection

- [ ] 4.1 Create `packages/server/src/projections/worldEvent.ts` — `WorldEventRow` type + `WorldEventProjection` class with `apply`, `getActiveByTile`, `getActiveByAnimalId`, `list`, and `snapshot` methods
- [ ] 4.2 Add `WorldEventProjection` to `ECOSYSTEM_BOOT_EVENT_TYPES` in `runtime.ts` (both boot branches + per-event fan-out)
- [ ] 4.3 Write `packages/server/src/projections/worldEvent.test.ts` — spawn → active, resolve → cleared, boot hydration from EventLog

## 5. Legendary Spawn Planner

- [ ] 5.1 Create `packages/server/src/ecosystem/legendarySpawnPlanner.ts` — singleton check, prey threshold, pressure check, deterministic hash probability, return `ANIMAL_SPAWNED` command or null
- [ ] 5.2 Write `packages/server/src/ecosystem/legendarySpawnPlanner.test.ts` — singleton blocks second spawn, high pressure suppresses spawn, probability is deterministic

## 6. Legendary Hunt Planner

- [ ] 6.1 Create `packages/server/src/ecosystem/legendaryHuntPlanner.ts` — `LegendaryHuntTracker` in-memory map, per-tick hunter count over active world events, emit `LEGENDARY_HUNT_STARTED` / `LEGENDARY_HUNT_CONCLUDED` when thresholds met
- [ ] 6.2 Write `packages/server/src/ecosystem/legendaryHuntPlanner.test.ts` — clustering below threshold emits nothing, sustained clustering emits started, duplicate re-emit blocked by `huntStartedEmitted`, kill emits concluded

## 7. Faction Ecology Planner

- [ ] 7.1 Create `packages/server/src/ecosystem/factionEcologyPlanner.ts` — 4 stance handlers reading ecosystem pressure / fishery density / livestock count, return faction ecology commands
- [ ] 7.2 Write `packages/server/src/ecosystem/factionEcologyPlanner.test.ts` — guild clearcut on high pressure, tide hunters quota on low density, free runners sabotage on high livestock, hidden overseer unconditional

## 8. Runtime Wiring

- [ ] 8.1 Instantiate `WorldEventProjection` in `runtime.ts` constructor; add to projection fields
- [ ] 8.2 Add E4 cadence block in `runtime.ts`: invoke `legendarySpawnPlanner` every `LEGENDARY_SPAWN_CADENCE_TICKS`; invoke `factionEcologyPlanner` every `FACTION_ECOLOGY_CADENCE_TICKS`
- [ ] 8.3 Add per-tick `legendaryHuntPlanner` call in `runtime.ts` main tick loop, after NPC tick
- [ ] 8.4 Add fan-out in `runtime.ts`: on `ANIMAL_SPAWNED` for legendary species → emit `WORLD_EVENT_SPAWNED`
- [ ] 8.5 Add fan-out in `runtime.ts`: on `ANIMAL_KILLED` / `ANIMAL_STARVED` / `ANIMAL_MIGRATED` for tracked legendary animal → emit `WORLD_EVENT_RESOLVED`
- [ ] 8.6 Add `areaSafety` patch in `runtime.ts`: subtract world event severity from tile safety before passing to `npcEngine.tick()`

## 9. Chronicle Narration

- [ ] 9.1 Add Chinese narration in `chronicleRenderer.ts` for `WORLD_EVENT_SPAWNED` (species name + tile + event kind)
- [ ] 9.2 Add Chinese narration in `chronicleRenderer.ts` for `WORLD_EVENT_RESOLVED` (species + resolution context)
- [ ] 9.3 Add Chinese narration in `chronicleRenderer.ts` for `LEGENDARY_HUNT_CONCLUDED` (species + outcome + hunters)
- [ ] 9.4 Add Chinese narration in `chronicleRenderer.ts` for all 4 faction ecology command types

## 10. Snapshot Facts

- [ ] 10.1 Add `activeWorldEvents` to `WorldSnapshot.facts` — array from `worldEventProjection.snapshot()`
- [ ] 10.2 Add `factionEcologyStances` to `WorldSnapshot.facts` — static faction stance map (read from world config)

## 11. Admin UI

- [ ] 11.1 Add "神話生態 Mythic Ecology" section to `AdminWorldPage.tsx` displaying active world events (kind, tile, severity, linkedAnimalId, spawnedAtTick)
- [ ] 11.2 Add faction ecology stance table to the same section (factionId, ecologyStance, last command type, last command tick)

## 12. Verification

- [ ] 12.1 Run `npm run build` (root) and confirm zero TypeScript errors
- [ ] 12.2 Run `npm test --workspace=packages/server` and confirm all new and existing tests pass
- [ ] 12.3 Docker smoke test: rebuild local stack, confirm `/api/world` facts include `activeWorldEvents` key
- [ ] 12.4 Update `PROGRESS.md` with v0.29.0 handoff evidence
- [ ] 12.5 Update `ROADMAP.md` with v0.29.0 entry

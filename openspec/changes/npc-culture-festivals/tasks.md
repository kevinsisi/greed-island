## 1. Constants & Command Types

- [x] 1.1 Add `CULTURAL_FESTIVAL_THRESHOLD = 3`, `CULTURAL_NORM_NPC_THRESHOLD = 3`, `RITUAL_FACTION_LEANS` to `config/world.ts`
- [x] 1.2 Add `CULTURAL_FESTIVAL_FORMED`, `CULTURAL_RITUAL_PERFORMED`, `CULTURAL_NORM_ESTABLISHED` to command/event union types in `livingWorldCommands.ts`
- [x] 1.3 Add payload type definitions for all three new types in `livingWorldCommands.ts`
- [x] 1.4 Add validators for all three new types in `VALIDATORS` object

## 2. BuildingDef Tags

- [x] 2.1 Add `tags?: readonly string[]` to `BuildingDef` type in `buildings/types.ts`
- [x] 2.2 Add `tags: ['ritual_site']` to temple/shrine buildings in `buildings/catalog.ts` (`b_temple_shrine`, `b_mountain_monastery` or equivalent type=`temple` buildings)

## 3. CulturalElementProjection

- [x] 3.1 Create `packages/server/src/projections/culturalElement.ts` with `CulturalElementRow` type and `CulturalElementProjection` class
- [x] 3.2 Implement internal `festivalCounters` map for `RARE_WINDOW_OPEN` projection — increment counter per `windowId`
- [x] 3.3 Implement `project(event)` — handle `CULTURAL_FESTIVAL_FORMED` (add festival row), `CULTURAL_RITUAL_PERFORMED` (add ritual row), `CULTURAL_NORM_ESTABLISHED` (add norm row), `RARE_WINDOW_OPEN` (increment counter)
- [x] 3.4 Implement `rebuildFromEvents(events)`, `canonicalHash()`, `getByTile(tileId)`, `getFestivalCounter(windowId)`, `hasFestival(windowId)`, `hasNorm(tileId, skillId)` accessors

## 4. SimulationRuntime Integration

- [x] 4.1 Instantiate `CulturalElementProjection` in `SimulationRuntime` and hydrate in `rebuildProjections()`
- [x] 4.2 Wire `culturalElementProjection.project(ev)` into both fan-out loops in `runTick`
- [x] 4.3 Add `getCulturalElements(tileId)` public method to `SimulationRuntime`

## 5. Cultural Seeders

- [x] 5.1 Create `packages/server/src/sim/culturalSeeders.ts` with `planFestivalSeed`, `planRitualSeed`, `planNormSeed` functions
- [x] 5.2 `planFestivalSeed(projection, event, tick)` — after `RARE_WINDOW_OPEN` accepted: check counter vs threshold, check no festival exists, return `CULTURAL_FESTIVAL_FORMED` command or null
- [x] 5.3 `planRitualSeed(event, npcProfile, building, rareWindowOpen, tick)` — after `BUILDING_ENTER` accepted: check `ritual_site` tag + factionLean + rareWindowOpen, return `CULTURAL_RITUAL_PERFORMED` or null
- [x] 5.4 `planNormSeed(projection, skillXpProjection, tileId, skillId, npcLocations, tick)` — check NPC count with level≥1 on tile, check no norm exists, return `CULTURAL_NORM_ESTABLISHED` or null

## 6. Runtime Wiring

- [x] 6.1 In `runTick` fan-out, after `RARE_WINDOW_OPEN` accepted: call `planFestivalSeed`, enqueue result
- [x] 6.2 In `runTick` fan-out, after `BUILDING_ENTER` accepted: look up NPC profile + building def, call `planRitualSeed`, enqueue result
- [x] 6.3 In `runTick` fan-out, after `NPC_OBSERVED_SKILL` accepted: collect `(tileId, skillId)` pairs from this tick, call `planNormSeed` for each unique pair, enqueue results

## 7. Tests

- [x] 7.1 Add unit tests for `CulturalElementProjection` — counter increment, festival row creation, norm/ritual rows, idempotency, `rebuildFromEvents`
- [x] 7.2 Add unit tests for `planFestivalSeed` — below threshold (no emit), at threshold (emit), already exists (no re-emit)
- [x] 7.3 Add unit tests for `planRitualSeed` — qualifying entry (emit), wrong faction (no emit), no tag (no emit), window closed (no emit)
- [x] 7.4 Add unit tests for `planNormSeed` — threshold met (emit), below threshold (no emit), already exists (no re-emit)

## 8. Validation & Cleanup

- [x] 8.1 Run `npm run build:server` — confirm zero TypeScript errors
- [x] 8.2 Run `npm test` — confirm all tests pass
- [x] 8.3 Run `npx openspec validate --all --strict` — confirm all specs pass
- [x] 8.4 Update `PROGRESS.md` and `ROADMAP.md` with Phase 3 §37.3 completion

# Design — Ecosystem Pressure & Collapse (Phase E2)

## Architecture Fit

All new state flows through `Command → Rule Engine → Event → Projection`. No FACT_SET mutation. All planners are pure functions returning `SpawnIntent[]` / command lists; the runtime submits them as commands.

---

## D1. New Command / Event Types

Add to `packages/server/src/kernel/livingWorldCommands.ts`:

```typescript
'SPECIES_EXTINCTION_WARNING'   // payload: { speciesId, tileId, population, threshold, tick }
'SPECIES_EXTINCT'              // payload: { speciesId, lastSeenTick, affectedTileIds }
'SPECIES_RECOVERED'            // payload: { speciesId, tileId, population, tick }
'FISHERY_RECOVERED'            // payload: { tileId, density, tick }
'ECOSYSTEM_PRESSURE_RAISED'    // payload: { tileId, pressureLevel, tick }
'ECOSYSTEM_PRESSURE_RECOVERED' // payload: { tileId, tick }
```

Validators: all fields required, population/pressureLevel integers ≥ 0, threshold positive integer.

`FISHERY_COLLAPSED` already exists as a command type — no change needed to its validator. Runtime integration upgraded (D3).

---

## D2. New Projections

### D2.1 `SpeciesExtinctionProjection`

File: `packages/server/src/projections/speciesExtinction.ts`

```typescript
type SpeciesStatus = 'stable' | 'warning' | 'extinct'

type SpeciesExtinctionRow = Readonly<{
  speciesId: string
  status: SpeciesStatus
  warningTileIds: readonly string[]    // tiles below extinctionThreshold
  extinctSince: number | null          // tick, null if not extinct
  lastWarningTick: number | null
}>
```

Projects: `SPECIES_EXTINCTION_WARNING` → `warning`; `SPECIES_EXTINCT` → `extinct`; `SPECIES_RECOVERED` → back to `stable`. First-write-wins for extinction (clears warning state on same species).

Methods: `getStatus(speciesId)`, `list()`, `canonicalHash()`, `rebuildFromEvents()`.

### D2.2 `EcosystemRegionProjection`

File: `packages/server/src/projections/ecosystemRegion.ts`

```typescript
type EcosystemRegionRow = Readonly<{
  tileId: string
  pressureLevel: number   // 0–100, raised by ECOSYSTEM_PRESSURE_RAISED, cleared on RECOVERED
  pollutionLevel: number  // derived from pressureLevel history; simplified as pressureLevel / 2 initially
  lastPressureRaisedTick: number | null
  lastRecoveredTick: number | null
}>
```

Projects: `ECOSYSTEM_PRESSURE_RAISED` → update pressure; `ECOSYSTEM_PRESSURE_RECOVERED` → reset to 0.

Methods: `getForTile(tileId)`, `list()`, `canonicalHash()`, `rebuildFromEvents()`.

---

## D3. Planners

### D3.1 Species Extinction Planner

File: `packages/server/src/ecosystem/extinctionPlanner.ts`

Pure function, runs on reproduction cadence:

```typescript
export function planSpeciesExtinctionCheck(input: {
  tick: number
  animalPopulation: AnimalPopulationRow[]
  extinctionProjection: SpeciesExtinctionProjection
}): SpawnIntent[]  // returns command intents
```

Logic (deterministic, no randomness):
1. For each species in catalog, sum population across all tiles.
2. For each tile: if `count < species.extinctionThreshold && count > 0` and current status ≠ `warning` → emit `SPECIES_EXTINCTION_WARNING`.
3. If total population = 0 for species currently at `warning` status → emit `SPECIES_EXTINCT`.
4. If species currently `extinct` and any tile has population > 0 (via spawn/migration) → emit `SPECIES_RECOVERED`.

### D3.2 Fishery Collapse Planner Upgrade

Existing `planFisheryHarvest` returns `FISHERY_COLLAPSED` intent when `density ≤ FISHERY_COLLAPSE_THRESHOLD` (already defined in `world.ts`). Upgrade:
- Also return `FISHERY_RECOVERED` intent when density crosses back above `FISHERY_COLLAPSE_THRESHOLD + 10` (hysteresis buffer).
- Pass `fisheryProjection.isCollapsed(tileId)` to avoid re-emitting on already-collapsed tile.

### D3.3 Ecosystem Pressure Planner

File: `packages/server/src/ecosystem/pressurePlanner.ts`

Pure function, runs on reproduction cadence:

```typescript
export function planEcosystemPressure(input: {
  tick: number
  tileId: string
  recentWorkActions: number          // count of NPC work actions on high-pressure buildings this window
  currentPressureLevel: number       // from EcosystemRegionProjection
  cadenceWindowTicks: number
}): 'raise' | 'recover' | null
```

Thresholds:
- `recentWorkActions >= ECOSYSTEM_PRESSURE_WORK_THRESHOLD` → `raise` (pressure +20, capped at 100)
- `recentWorkActions === 0 && ticksSinceLastAction > ECOSYSTEM_PRESSURE_RECOVERY_TICKS` → `recover`
- Add constants to `config/world.ts`: `ECOSYSTEM_PRESSURE_WORK_THRESHOLD = 5`, `ECOSYSTEM_PRESSURE_RECOVERY_TICKS = 2 * TICKS_PER_MINUTE`

---

## D4. Runtime Integration

In `packages/server/src/sim/runtime.ts`:

1. **Instantiate** `SpeciesExtinctionProjection` and `EcosystemRegionProjection`.
2. **Boot hydration**: add both to the large-log selective rebuild block (same pattern as other ecosystem projections, using new event types as `EXTINCTION_BOOT_EVENT_TYPES`).
3. **Reproduction cadence block**: after existing reproduction/predation planners, run `planSpeciesExtinctionCheck`. Submit intents as commands via `submitLivingWorldCommand`.
4. **Fishery cadence block**: pass `isCollapsed` to the upgraded fishery planner; handle `FISHERY_RECOVERED` intents.
5. **Per-tick pressure**: after NPC productive-action processing, accumulate work action counts per tile. On reproduction cadence, run `planEcosystemPressure` per tile with active NPCs.
6. **Project events**: `SpeciesExtinctionProjection` and `EcosystemRegionProjection` project accepted events in the per-event fan-out loop.
7. **Snapshot**: `WorldSnapshot.facts.extinctionWarnings = extinctionProjection.list()` and `facts.ecosystemRegions = ecosystemRegionProjection.list()`.

---

## D5. Spawn Rate Modifier

In `packages/server/src/ecosystem/animalSpawning.ts`:

Add `spawnRateModifier(species: Species, pressureLevel: number): number`:
- If `species.civilizationTolerance < 30` and `pressureLevel > 50` → modifier 0.3 (spawn chance reduced 70%)
- If `pressureLevel > 75` → modifier 0.1 (spawn chance reduced 90%)
- Otherwise → modifier 1.0

Apply modifier to spawn probability check in `planAnimalSpawns`.

---

## D6. Admin UI

In `packages/web/src/pages/AdminWorldPage.tsx`:

Add "生態壓力" collapsible section:
- Species extinction table: speciesId | status icon (✅/⚠️/☠️) | warningTileIds
- Ecosystem region table: tileId | pressureLevel bar | pollutionLevel

Data source: `snapshot.facts.extinctionWarnings` and `snapshot.facts.ecosystemRegions`.

---

## D7. Chronicle Integration

In `packages/server/src/kernel/chronicleRenderer.ts`:
- `SPECIES_EXTINCTION_WARNING` → returns `null` (suppress, too noisy)
- `SPECIES_EXTINCT` → returns Chinese narration: `"[speciesId] 已在此區域絕種"`
- `SPECIES_RECOVERED` → returns: `"[speciesId] 族群恢復"`
- `FISHERY_RECOVERED` → returns `null` (suppress)
- `ECOSYSTEM_PRESSURE_RAISED` / `ECOSYSTEM_PRESSURE_RECOVERED` → returns `null` (suppress)

---

## Constants (new additions to `config/world.ts`)

```typescript
export const SPECIES_EXTINCT_GRACE_TICKS = 3 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
export const ECOSYSTEM_PRESSURE_WORK_THRESHOLD = 5
export const ECOSYSTEM_PRESSURE_RECOVERY_TICKS = 2 * TICKS_PER_MINUTE
export const FISHERY_RECOVERY_RATE = 5   // density points per cadence tick (passive)
export const FISHERY_RECOVERY_BUFFER = 10 // hysteresis: recover fires above collapse+buffer
```

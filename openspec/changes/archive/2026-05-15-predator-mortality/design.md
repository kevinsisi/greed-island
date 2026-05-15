## Context

`predation.ts` already implements a deterministic planner that produces `PredationKillPlan` (predator kills prey on same tile) and `PredationStarvationPlan` (predator has no valid prey). Neither plan is wired to commands, events, projections, or the runtime. The `AnimalPopulationProjection` has no handlers for predation events. There is no hunger-tracking state.

This change wires the existing planner into the Command/Event pipeline, adds hunger accumulation to gate starvation, and exposes predator hunger state through the snapshot.

## Goals / Non-Goals

**Goals:**

- Emit `ANIMAL_KILLED` when a predator successfully kills prey on the same tile.
- Emit `ANIMAL_DIED_STARVATION` when a predator has spent ≥ `PREDATOR_STARVATION_THRESHOLD_TICKS` consecutive cadence ticks without prey on its tile.
- Update `AnimalPopulationProjection` to remove the killed/dead animal from the correct row.
- Track per `(predatorSpeciesId, tileId)` last-kill tick in `PredatorHungerProjection`.
- Suppress both event types from public narrative surfaces.

**Non-Goals:**

- No per-individual animal hunger tracking (tile-level last-kill is sufficient for this slice).
- No pack-level cohesion effects (wolves don't hunt together this slice).
- No predation-driven migration or extinction warnings (future slices).
- No `event_driven` species predation (iron_hound, white_marsh_leviathan remain inert).
- No visual predation narrative in the SSE stream (suppressed).

## Decisions

### Decision 1: Tile-level hunger tracking, not per-animal

Track `lastKillAtTick` per `(predatorSpeciesId, tileId)` in `PredatorHungerProjection`, not per individual animal id.

**Why:** Per-animal tracking requires per-animal state in the projection, which means O(n) rows where n = total predator count. Tile-level tracking keeps the projection O(tiles × predator species), matches the granularity of `AnimalPopulationRow`, and is simpler to replay. The starvation threshold is long enough (multiple minutes of real time) that tile-level precision is sufficient — if the tile has no prey at all for that duration, every predator on it is equally hungry.

**Alternative rejected:** Per-animal hunger embedded in `AnimalPopulationRow` — would require adding a `lastFedAtTick` map to the row type, complicating the existing projection and all its tests.

### Decision 2: Reuse `ECOSYSTEM_REPRODUCTION_CADENCE_TICKS` as predation cadence

Use the same cadence constant (`TICKS_PER_MINUTE`) for predation as for reproduction and migration. Add a separate `PREDATOR_STARVATION_THRESHOLD_TICKS` (= 5 × `ECOSYSTEM_REPRODUCTION_CADENCE_TICKS`) to set the starvation window.

**Why:** A single cadence constant keeps ecosystem events temporally aligned and avoids multiple independent clocks. Five cadence periods ≈ 5 minutes of real time, giving predators ample time to find prey before dying.

**Alternative rejected:** A separate `PREDATOR_CADENCE_TICKS` constant — would diverge the cadence clocks and add complexity with no gameplay benefit at this slice.

### Decision 3: `planPredation` returns at most one plan per call; runtime calls it once per cadence tick

The planner already selects the highest-priority predator action (deterministic rank). The runtime calls it once per cadence tick, emits the resulting command, and moves on. Multiple predator species or tiles may not all act every tick — only the top-ranked one does.

**Why:** Matches the established pattern from `planAnimalMigration` and `planAnimalReproduction`. One event per cadence tick keeps the EventLog append rate bounded. Future slices may fan out to multiple predators per tick.

### Decision 4: Starvation fires only when planner returns `starvation` AND hunger threshold exceeded

The planner returning `starvation` is necessary but not sufficient to emit `ANIMAL_DIED_STARVATION`. The runtime also checks `PredatorHungerProjection.getLastKillAtTick(speciesId, tileId)`. If `tick - lastKillAtTick < PREDATOR_STARVATION_THRESHOLD_TICKS`, the predator is hungry but does not yet die.

**Why:** Prevents predators from dying on the very first cadence tick after prey disappears. Gives prey population time to respawn or migrate before predators begin dying.

## Risks / Trade-offs

- **[Risk] Predator extinction spiral:** Once prey drops below pressure threshold, predators may starve en masse within `PREDATOR_STARVATION_THRESHOLD_TICKS` ticks. → Mitigation: Threshold set at 5 cadence periods to give prey time to reproduce or migrate. Extinction warnings are a future slice.
- **[Risk] `PredatorHungerProjection` init state:** On a fresh EventLog (no prior kills), `lastKillAtTick` defaults to `null` / `0`. A world that starts mid-game from a snapshot will not have predators immediately die (threshold comparison uses `tick - 0 >= threshold` which may be true). → Mitigation: Default `lastKillAtTick` to `null`; treat `null` as "never fed" — only starve if `tick >= PREDATOR_STARVATION_THRESHOLD_TICKS` (i.e., world is old enough).
- **[Risk] `planPredation` called on every cadence tick even if predators absent:** Minor CPU cost; negligible given small predator count.

## Migration Plan

1. Add constants → add commands/events → extend projections → integrate runtime → add tests → build.
2. No EventLog migration required — new event types are additive.
3. Rollback: revert `runtime.ts` integration; existing EventLogs with no `ANIMAL_KILLED` or `ANIMAL_DIED_STARVATION` events replay identically.

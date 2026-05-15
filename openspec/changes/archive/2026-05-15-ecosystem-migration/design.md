# Design — Ecosystem Migration Engine (Phase E1.3)

## Context

E1.1 (predation) and E1.2 (reproduction/carrying-capacity) gave animals the ability
to die and reproduce on a single tile. The ecosystem is still siloed per tile:
a tile can become over-full (after reproduction) or depleted (after predation)
with no way for animals to move. `SpeciesMigrationPattern` has four values
(`'none'`, `'pressure'`, `'seasonal'`, `'event_driven'`) already encoded on every
species, but no runtime consumes them yet.

The world's tile adjacency graph (`MAP_ADJACENCY`, `getMapAdjacency`) and the
`ecosystemRegionForTile` utility are already in place. Migration can use both
to find valid destination tiles.

## Goals / Non-Goals

**Goals:**
- `pressure` migration: an animal id moves when its source tile is above a
  configurable occupancy threshold and an adjacent ecosystem tile has room.
- `seasonal` migration: animals move on a periodic tick cadence regardless of
  current occupancy, toward an adjacent ecosystem tile with available capacity.
- `ANIMAL_MIGRATED` event moves the animal id from source row to destination row
  in `AnimalPopulationProjection`.
- `MIGRATION_WAVE_STARTED` event creates an active wave entry in the new
  `AnimalMigrationProjection` (`migration_routes` read model per §30.16).
- At most one migration action per cadence tick, emitted through Rule Engine only.
- Routine migration events are hidden from public recent-event / chronicle surfaces.

**Non-Goals:**
- `event_driven` migration (requires future world-event triggers).
- Multi-tick in-transit animal state (animal is always on exactly one tile; no
  "travelling" limbo state in this slice).
- Migration that crosses non-ecosystem tiles (water, grass) without a compatible
  adjacent ecosystem tile in one step.
- Extinction warnings or predator mortality — those remain follow-up slices.
- Season tracking — "seasonal" cadence in this slice uses a fixed tick period, not
  a true game-calendar season.

## Decisions

### D1 — Single `ANIMAL_MIGRATED` event moves one animal per tick

**Rationale:** Matches the per-tick cadence pattern established by E1.1 predation
and E1.2 reproduction. Keeping the event granular (one animal) lets the projection
do simple atomic remove-add without batch state. A `MIGRATION_WAVE_STARTED` event
precedes the first migration in a wave to create the wave record.

**Alternative considered:** Batch all animals of a species in one event.
Rejected: complex payload, harder replay, breaks the "one meaningful fact per
event" design law.

### D2 — Destination tile selected by deterministic hash ranking

**Rationale:** Same pattern as predation planner and reproduction planner.
Hash includes `{scheme, speciesId, fromTileId, tick}`. Adjacent ecosystem tiles
are sorted by id then ranked by hash. First tile under carrying capacity wins.
This is reproducible and avoids floating-point seasonality math.

### D3 — Pressure threshold = 80% of carrying capacity

**Rationale:** 80% leaves headroom so reproduction and predation can still play
out before triggering migration. This is a named constant
`ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD = 0.8` in `config/world.ts`.

### D4 — Seasonal cadence = same period as reproduction cadence

**Rationale:** Reuses `ECOSYSTEM_REPRODUCTION_CADENCE_TICKS`. Avoids introducing
a new constant for an effect that should be similar in frequency. Can be split into
its own constant in a later slice if tuning is needed.

### D5 — `AnimalPopulationProjection` handles `ANIMAL_MIGRATED` directly

**Rationale:** The projection already manages animal ids per `(speciesId, tileId)`.
Extending it keeps migration state consistent with spawn/kill/reproduce state
without a second authoritative source. The destination tile row uses the biome
region derived from `ecosystemRegionForTile` for the destination tile; if the
destination tile has no ecosystem region the event is treated as a no-op in the
projection (defensive).

### D6 — New `AnimalMigrationProjection` for wave tracking

**Rationale:** Wave data (`waveId`, `fromTileId`, `toTileId`, species, start tick,
count) is a different read model from per-tile animal population. Separate
projection keeps `AnimalPopulationProjection` focused.

## Risks / Trade-offs

- **Cross-biome migration** — A pressure-migrating forest deer that has no
  adjacent forest tile can only move to a non-forest ecosystem tile. The animal's
  `biomeRegion` field stays at the destination tile's region in the migration event
  payload, which could confuse future biome-preference logic.
  Mitigation: prefer adjacent tiles that match `species.biomeAffinity` in the
  destination ranking; fall back to any adjacent ecosystem tile if none matches.

- **Wave ID collision** — Waves are identified by
  `hashCanonicalJson({scheme:'migration-wave.v1', speciesId, fromTileId, toTileId, startedAtTick})`.
  Two waves of the same species between the same tiles in the same tick would
  collide. The cadence gate (one migration per cadence tick) prevents this.

- **Empty source row** — If an animal is killed before its migration is emitted in
  the same tick, the migration planner may reference a stale population snapshot.
  Mitigation: the planner reads from the accepted-event-derived snapshot (same
  pattern as predation), so the reserved-ids set from earlier events in the same
  tick prevents double-use.

## Migration Plan

No data migration. `ANIMAL_MIGRATED` and `MIGRATION_WAVE_STARTED` are new event
types added to the EventLog; old EventLogs that do not contain them project to the
same state as before. `AnimalMigrationProjection` starts empty and fills on first
migration event.

## Open Questions

- None blocking for this slice. Future slices can add true season-calendar gating
  and `event_driven` migration.

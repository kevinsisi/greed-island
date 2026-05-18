## ADDED Requirements

### Requirement: Species extinction warning emitted when population falls below threshold
When a species population on any tile drops below `Species.extinctionThreshold`, the runtime SHALL emit `SPECIES_EXTINCTION_WARNING` via the Rule Engine on the next reproduction cadence tick.

#### Scenario: Warning on low population tile
- **WHEN** `forest_deer` count on `t_forest` drops to 2 and `extinctionThreshold` is 10
- **THEN** `SPECIES_EXTINCTION_WARNING` is emitted with `speciesId = "forest_deer"`, `tileId = "t_forest"`, `population = 2`

#### Scenario: No duplicate warning
- **WHEN** `SPECIES_EXTINCTION_WARNING` for a species+tile was already emitted this cadence
- **THEN** no second `SPECIES_EXTINCTION_WARNING` is emitted for the same species+tile

### Requirement: Species extinction declared after sustained zero population
When a species total population across all its biome-affinity tiles is zero for `SPECIES_EXTINCT_GRACE_TICKS` consecutive cadence ticks, the runtime SHALL emit `SPECIES_EXTINCT`.

#### Scenario: Extinction after grace period
- **WHEN** `fog_wolf` population is zero on all forest tiles for `SPECIES_EXTINCT_GRACE_TICKS` ticks
- **THEN** `SPECIES_EXTINCT` is emitted exactly once

#### Scenario: No extinction within grace period
- **WHEN** `fog_wolf` population is zero but fewer than `SPECIES_EXTINCT_GRACE_TICKS` ticks have elapsed
- **THEN** `SPECIES_EXTINCT` is NOT emitted

### Requirement: Species recovery clears extinction status
When a species previously marked `warning` or `extinct` regains population above `extinctionThreshold` on any tile, the runtime SHALL emit `SPECIES_RECOVERED`.

#### Scenario: Recovery after extinction
- **WHEN** `fog_wolf` status is `extinct` and a `ANIMAL_SPAWNED` brings population to 5 on `t_forest` where `extinctionThreshold = 3`
- **THEN** `SPECIES_RECOVERED` is emitted and `SpeciesExtinctionProjection.getStatus("fog_wolf")` returns `"stable"`

### Requirement: SpeciesExtinctionProjection tracks per-species lifecycle
The `SpeciesExtinctionProjection` SHALL maintain per-species status (`stable | warning | extinct`) rebuilt deterministically from events.

#### Scenario: Projection rebuild consistency
- **WHEN** a sequence of warning/extinct/recovery events is projected incrementally vs rebuilt from events
- **THEN** `canonicalHash()` returns the same value for both

### Requirement: EcosystemRegionProjection tracks per-tile pressure
The `EcosystemRegionProjection` SHALL maintain `pressureLevel` (0–100) per tile, raised by `ECOSYSTEM_PRESSURE_RAISED` and reset by `ECOSYSTEM_PRESSURE_RECOVERED`.

#### Scenario: Pressure accumulation
- **WHEN** `ECOSYSTEM_PRESSURE_RAISED` with `pressureLevel = 40` is projected for `t_forest`
- **THEN** `getForTile("t_forest").pressureLevel` returns `40`

#### Scenario: Pressure recovery
- **WHEN** `ECOSYSTEM_PRESSURE_RECOVERED` is projected for `t_forest` after pressure was 60
- **THEN** `getForTile("t_forest").pressureLevel` returns `0`

### Requirement: High civilization pressure reduces spawn rate for intolerant species
When a tile's `pressureLevel` exceeds threshold, `planAnimalSpawns` SHALL apply a spawn rate modifier that reduces spawn probability for species with low `civilizationTolerance`.

#### Scenario: Low tolerance species suppressed under high pressure
- **WHEN** `t_forest` pressureLevel is 80 and `fog_wolf` has `civilizationTolerance = 10`
- **THEN** `planAnimalSpawns` applies modifier ≤ 0.3 for `fog_wolf` spawn on that tile

### Requirement: Fishery density passively regenerates after collapse
When a fishery's density is above zero but below `FISHERY_DEFAULT_DENSITY`, the runtime SHALL increase density by `FISHERY_RECOVERY_RATE` per reproduction cadence tick.

#### Scenario: Passive regeneration
- **WHEN** `t_salt_marsh` fishery density is 30 (below max, above zero)
- **THEN** after one reproduction cadence tick without harvesting, density increases by `FISHERY_RECOVERY_RATE`

### Requirement: FISHERY_RECOVERED emitted when density crosses recovery threshold
When a collapsed fishery's density rises above `FISHERY_COLLAPSE_THRESHOLD + FISHERY_RECOVERY_BUFFER`, the runtime SHALL emit `FISHERY_RECOVERED`.

#### Scenario: Recovery event on threshold crossing
- **WHEN** `t_salt_marsh` was collapsed and density passively regenerates above `FISHERY_COLLAPSE_THRESHOLD + FISHERY_RECOVERY_BUFFER`
- **THEN** `FISHERY_RECOVERED` is emitted exactly once

### Requirement: WorldSnapshot exposes extinction warnings and ecosystem regions
`WorldSnapshot.facts` SHALL include `extinctionWarnings` (list of `SpeciesExtinctionRow`) and `ecosystemRegions` (list of `EcosystemRegionRow`).

#### Scenario: Snapshot contains ecosystem facts
- **WHEN** `getSnapshot()` is called after a `SPECIES_EXTINCTION_WARNING` event
- **THEN** `snapshot.facts.extinctionWarnings` contains an entry for the warned species

### Requirement: Admin world page shows ecological health
The `/admin/world` page SHALL render a "生態壓力" section displaying per-species extinction status and per-tile pressure level.

#### Scenario: Species status visible in admin
- **WHEN** `SpeciesExtinctionProjection` has a `warning` entry for `fog_wolf`
- **THEN** the admin page renders `fog_wolf` with a ⚠️ status icon in the 生態壓力 section

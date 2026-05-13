# Spec — ecosystem-runtime capability (Fishery Density)

## ADDED Requirements

### Requirement: Fishery density SHALL be a replayable ecosystem projection

The runtime MUST maintain `fisheryDensity` as a projection over typed fishery
events, keyed by coastal tile id. Rebuilding from the same EventLog MUST produce
the same canonical hash.

#### Scenario: Harvest reduces density

- **GIVEN** a coastal tile has default density `100`
- **WHEN** a `FISHERY_HARVESTED` event reduces density by `12`
- **THEN** the projection row MUST report density `88`

### Requirement: Fisher work SHALL reduce local fishery density

Fisher-like NPC productive work on coastal water tiles MUST emit
`FISHERY_HARVESTED` through the Rule Engine. Non-fisher roles and non-coastal
tiles MUST NOT reduce fishery density.

#### Scenario: Fisher on coastal tile harvests

- **GIVEN** an NPC role includes fisher/fishmonger/net mender semantics
- **AND** the NPC productive action is on a coastal water tile
- **WHEN** fishery planning runs
- **THEN** a `FISHERY_HARVESTED` command MUST be planned with deterministic
  `densityAfter`

### Requirement: Fishery collapse SHALL be emitted at low density

Fishery collapse MUST be represented by a typed `FISHERY_COLLAPSED` event.
When a fishery harvest crosses the configured collapse threshold, the runtime
MUST emit one `FISHERY_COLLAPSED` warning event for that tile until density is
recovered by a future slice.

#### Scenario: Crossing collapse threshold emits warning

- **GIVEN** a fishery tile has density above the collapse threshold
- **WHEN** a harvest lowers density to or below the threshold
- **THEN** `FISHERY_COLLAPSED` MUST be emitted for that tile

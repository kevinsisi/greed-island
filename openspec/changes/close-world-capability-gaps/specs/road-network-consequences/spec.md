## ADDED Requirements

### Requirement: Road construction SHALL classify land edges and water-crossing edges deterministically
The server-side map graph SHALL expose deterministic edge metadata for each traversable tile adjacency. `planRoadConstruction()` MUST emit `ROAD_CONSTRUCTED` with `roadType = 'road'` for land edges and `roadType = 'bridge'` for water-crossing edges.

#### Scenario: Water crossing emits bridge
- **WHEN** a qualifying trade-route pair exists on an adjacency marked as a water crossing
- **THEN** the constructed infrastructure event MUST use `roadType = 'bridge'`

#### Scenario: Land crossing emits road
- **WHEN** a qualifying trade-route pair exists on an adjacency marked as land
- **THEN** the constructed infrastructure event MUST use `roadType = 'road'`

### Requirement: Faction collapse SHALL destroy built road infrastructure
When the faction-collapse runtime block emits `FACTION_DOMINANCE_SHIFTED` and closes the affected logistics network, it MUST also emit `ROAD_DESTROYED` for the currently projected built road/bridge segments affected by that collapse so infrastructure failure is observable in EventLog and replayable after restart.

#### Scenario: Collapse emits road destruction
- **WHEN** faction-collapse consequences are committed in a tick where built roads exist
- **THEN** one or more `ROAD_DESTROYED` events MUST be committed in the same tick block

#### Scenario: Road network replay reflects destruction
- **WHEN** `ROAD_CONSTRUCTED` is later followed by `ROAD_DESTROYED` for the same segment
- **THEN** `RoadNetworkProjection` MUST no longer report that segment as built after replay

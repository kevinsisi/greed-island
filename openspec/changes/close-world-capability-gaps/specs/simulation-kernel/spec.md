## ADDED Requirements

### Requirement: Large-log startup SHALL complete deferred projection hydration after HTTP listen
When the EventLog exceeds the synchronous boot replay threshold, the server MAY start with a minimal availability-first projection subset before HTTP listen. However, startup SHALL then schedule deferred hydration that rebuilds the omitted projections from EventLog without requiring a second restart. Completion status MUST be observable to runtime tests.

#### Scenario: Large-log boot reaches eventual full hydration
- **WHEN** the server boots with an EventLog larger than the synchronous replay threshold
- **THEN** HTTP availability MAY be restored before every projection finishes rebuilding
- **AND** deferred hydration MUST continue until the omitted projections are rebuilt from EventLog

### Requirement: Building state projection SHALL be boot-hydrated
`BuildingStateProjection` MUST be rebuilt from EventLog on boot in both small-log and large-log startup paths so damage, abandonment, upgrades, captures, and repairs survive restart without relying on incidental live replay.

#### Scenario: Building health survives restart
- **WHEN** the EventLog contains `BUILDING_DAMAGED` or related building-state events and the runtime boots
- **THEN** `BuildingStateProjection` MUST reflect the latest committed building state after hydration completes

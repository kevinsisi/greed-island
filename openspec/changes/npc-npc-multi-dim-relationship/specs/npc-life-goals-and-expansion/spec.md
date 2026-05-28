# npc-life-goals-and-expansion Delta

## MODIFIED Requirements

### Requirement: Households are committed world facts

The system SHALL represent committed relationships, households, and children as
EventLog-backed facts. Children MAY start as household dependents and MUST NOT be
treated as full NPC actors until a future growth rule promotes them.

Pair-bond formation is no longer purely mechanical: a `NPC_HOUSEHOLD_FORMED` event MUST require **mutual attraction ≥ 50** between the two candidate NPCs (i.e., `dimensions(a→b).attraction ≥ 50 AND dimensions(b→a).attraction ≥ 50` from the `npc-relationship-dimensions` capability) in addition to the existing constraints (same tile, resource thresholds, at least one with `lifeGoal.kind === 'form_family'`). If no candidate pair clears the attraction bar this cadence, no household forms.

#### Scenario: Stable relationship forms a household
- **GIVEN** two eligible NPCs have sufficient relationship stability, housing,
  food, and safety
- **AND** their mutual attraction is ≥ 50
- **WHEN** deterministic policy submits a household command
- **THEN** the Rule Engine MAY accept a household event
- **AND** replaying the EventLog MUST rebuild the same household facts

#### Scenario: Low attraction blocks household formation
- **GIVEN** two co-located NPCs satisfying all material thresholds
- **AND** `dimensions(a→b).attraction < 50` OR `dimensions(b→a).attraction < 50`
- **WHEN** `planHouseholdCommands` runs on a cadence tick
- **THEN** no `NPC_HOUSEHOLD_FORMED` command MUST be emitted for that pair
- **AND** the pair MUST remain eligible for future cadences if attraction later rises

#### Scenario: Child is a dependent
- **WHEN** a child-birth event is accepted
- **THEN** the child MUST appear as a household dependent
- **AND** the child MUST NOT appear in `/api/npcs` as a full actor in the first
  implementation slice

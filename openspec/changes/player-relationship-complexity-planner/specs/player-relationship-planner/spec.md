## ADDED Requirements

### Requirement: NPC planning models multiple relationship pressures

The system SHALL model player↔NPC relationship consequences with more than hostile resentment.

#### Scenario: Positive interaction builds affinity

- **GIVEN** committed `PLAYER_NPC_DIALOGUE` events with positive trust deltas
- **WHEN** `PlayerNpcRelationshipProjection` rebuilds from EventLog
- **THEN** the relationship arc records increased affinity, positive interaction count, and reduced resentment pressure.

#### Scenario: Trusted familiar player creates social affinity pressure

- **GIVEN** an NPC has replayed player relationship bias with high trust and high affinity or familiarity
- **WHEN** the intent planner computes entries
- **THEN** it emits a `social` intent whose reason contains `player_relationship_affinity`.

#### Scenario: Trusted repeated trade creates reciprocity pressure

- **GIVEN** an NPC has replayed player relationship bias with repeated trusted trade
- **WHEN** the intent planner computes entries
- **THEN** it emits an `economic` intent whose reason contains `player_relationship_reciprocity`.

#### Scenario: Hostility still creates caution pressure

- **GIVEN** an NPC has replayed player relationship bias with high resentment or low trust
- **WHEN** the intent planner computes entries
- **THEN** it emits a `social` intent whose reason contains `player_relationship_caution`.

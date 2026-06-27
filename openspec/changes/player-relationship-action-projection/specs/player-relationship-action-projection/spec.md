## ADDED Requirements

### Requirement: Relationship action projection is server-authoritative

The system SHALL maintain a typed projection for accepted player↔NPC relationship-driven freeform actions instead of requiring clients to parse raw freeform prose.

#### Scenario: Accepted relationship caution action becomes typed NPC state

- **WHEN** an accepted `NPC_FREEFORM_ACTION_PROPOSED` event contains relationship caution evidence
- **THEN** the projection records the NPC action as `kind: caution`
- **AND** the row includes the source tick, sequence, label, detail, and optional utterance.

#### Scenario: Non-relationship or rejected freeform actions do not overwrite relationship state

- **WHEN** a freeform proposal is rejected
- **OR** its proposal text does not describe player↔NPC relationship pressure
- **THEN** the relationship action projection SHALL ignore it.

### Requirement: NPC snapshots expose relationship actions

The system SHALL expose the latest typed relationship action on each NPC summary as `relationshipAction`.

#### Scenario: Area clients receive typed relationship action state

- **WHEN** `/api/npcs` returns an NPC with recent accepted relationship action evidence
- **THEN** the NPC summary includes `relationshipAction.kind`, `labelZh`, `detailZh`, `utteranceZh`, `tick`, and `sequence`.

### Requirement: Area badges prefer typed relationship actions

The web area behavior layer SHALL prefer `npc.relationshipAction` over raw recent-event parsing when rendering relationship action badges.

#### Scenario: Server projection drives badge rendering

- **GIVEN** an NPC summary includes `relationshipAction.kind = affinity`
- **WHEN** the area behavior badge is derived
- **THEN** the badge shows the server-provided relationship label/detail without needing recent raw events.

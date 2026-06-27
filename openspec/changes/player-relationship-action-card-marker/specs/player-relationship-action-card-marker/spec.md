## ADDED Requirements

### Requirement: NPC cards expose relationship action markers

The NPC drawer SHALL render compact relationship action markers for NPCs with server-projected relationship actions.

#### Scenario: Marker uses relationship action utterance

- **GIVEN** an NPC has a projected `relationshipAction` with `labelZh` and `utteranceZh`
- **WHEN** the NPC card marker is derived
- **THEN** the marker label includes `關係行動` and the action label
- **AND** the marker detail uses the action utterance.

#### Scenario: Marker falls back to detail

- **GIVEN** an NPC has a projected `relationshipAction` without `utteranceZh`
- **WHEN** the NPC card marker is derived
- **THEN** the marker detail uses `detailZh`.

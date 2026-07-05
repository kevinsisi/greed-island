## ADDED Requirements

### Requirement: Relationship actions appear in nearby subtitles

The area subtitle system SHALL surface server-projected player↔NPC relationship actions as nearby NPC subtitle lines when no fresher committed speech line is available.

#### Scenario: Relationship action with utterance becomes subtitle

- **GIVEN** an NPC summary includes `relationshipAction.utteranceZh`
- **AND** the NPC is socially available and nearby
- **WHEN** ambient nearby subtitles are derived
- **THEN** the subtitle feed includes a line spoken by that NPC using the projected utterance.

#### Scenario: Recent utterance remains primary speech source

- **GIVEN** an NPC has both `recentUtterance.text` and `relationshipAction.utteranceZh`
- **WHEN** ambient nearby subtitles are derived
- **THEN** the subtitle line uses `recentUtterance.text`.

#### Scenario: Relationship action detail is fallback text

- **GIVEN** an NPC has `relationshipAction.detailZh` but no `utteranceZh`
- **WHEN** ambient nearby subtitles are derived
- **THEN** the subtitle line uses `detailZh`.

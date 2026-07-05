## ADDED Requirements

### Requirement: Relationship action subtitles mix with live timeline lines

The area subtitle timeline SHALL include dedicated subtitle rows for server-projected relationship actions even when live speech/social events exist in the same area.

#### Scenario: Dedicated relationship action row is generated

- **GIVEN** a nearby socially available NPC has `relationshipAction.utteranceZh`
- **AND** the NPC does not have a fresher `recentUtterance.text`
- **WHEN** relationship action subtitle rows are derived
- **THEN** the system emits a stable NPC subtitle row keyed by `relationship-action:{npcId}:{sequence}`.

#### Scenario: Live speech does not hide relationship action speech

- **GIVEN** the area has live subtitle lines
- **AND** at least one nearby NPC has a projected relationship action subtitle
- **WHEN** the area subtitle feed is composed
- **THEN** both live lines and relationship action lines are passed into the dedupe/timeline feed.

#### Scenario: Ambient chatter remains fallback

- **GIVEN** there are no live subtitle lines and no relationship action subtitle lines
- **WHEN** the area subtitle feed is composed
- **THEN** ambient nearby chatter may be used as fallback.

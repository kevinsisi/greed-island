## ADDED Requirements

### Requirement: World civilization snapshot SHALL be visible through the world API

The world read model SHALL expose civilization goals and technologies as a first-class `worldCivilization` field on the public world snapshot.

#### Scenario: Client reads world civilization state

- **WHEN** a client requests the world snapshot
- **THEN** the response includes `worldCivilization.goals`
- **AND** the response includes `worldCivilization.technologies`
- **AND** each technology includes its `evidenceEventIds`

### Requirement: Hub SHALL display world goals and technologies

The Hub UI SHALL show a compact civilization panel derived from the world snapshot.

#### Scenario: Player opens the Hub

- **WHEN** the Hub renders with a world civilization snapshot
- **THEN** it shows counts for active goals, completed goals, and technologies
- **AND** it lists prioritized active goals with progress percentages
- **AND** it lists recent technologies with evidence event counts

### Requirement: Civilization visibility SHALL be deterministic

Frontend ordering and summarization of world goals and technologies SHALL be deterministic and covered by tests.

#### Scenario: Multiple goals and technologies exist

- **WHEN** the panel summary is computed
- **THEN** active goals are prioritized before completed goals
- **AND** higher-progress active goals appear first
- **AND** technologies appear newest first

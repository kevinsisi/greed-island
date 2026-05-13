# world-agenda-directives Specification

## Purpose
TBD - created by archiving change world-agenda-directives. Update Purpose after archive.
## Requirements
### Requirement: World agenda directives are deterministic

The system SHALL derive world agenda directives from replayable simulation state
such as area resources, faction influence, and active world events. AI MUST NOT
author or mutate directives.

#### Scenario: Area pressure becomes a directive
- **GIVEN** an area has a low resource score or high faction influence
- **WHEN** the runtime derives agenda for that tile
- **THEN** the directive MUST name a sponsor, scope tile, pressure kind, pressure score, rationale, and directive text
- **AND** the same inputs MUST derive the same directive on replay

#### Scenario: Active world events can become hidden-overseer directives
- **GIVEN** an active world event applies to a tile or the whole world
- **WHEN** agenda is derived for an affected tile
- **THEN** the directive MAY use a hidden-overseer sponsor
- **AND** the directive rationale MUST cite the active world event text

### Requirement: NPC motivation follows top-down causality

Public NPC motivations SHALL prefer the chain `directive sponsor -> directive ->
role interpretation -> personal need`. Personal need MAY explain why an NPC
responded, but MUST NOT be the sole explanation for city-scale action.

#### Scenario: Productive action motivation
- **WHEN** an NPC productive action is emitted
- **THEN** its motivation SHOULD cite the active world agenda directive and the NPC role interpretation
- **AND** it MAY include personal pressure as a secondary reason

#### Scenario: Construction motivation
- **WHEN** an autonomous or expansion construction event is emitted
- **THEN** its motivation SHOULD cite the directive sponsor and directive text
- **AND** construction MUST read as an institutional or faction response, not a building spawned from generic personal desire


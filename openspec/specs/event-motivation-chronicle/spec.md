# event-motivation-chronicle Specification

## Purpose
TBD - created by archiving change event-motivation-chronicle. Update Purpose after archive.
## Requirements
### Requirement: Public events expose deterministic motivation

Public chronicle events SHALL expose why the event happened using deterministic,
replayable context. Motivation MAY come from explicit event payload fields or from
client/server derivation over committed payload data. AI MUST NOT invent or mutate
event motivation.

#### Scenario: Player reads a public event

- **WHEN** a Timeline row represents a public event
- **THEN** the row SHOULD show a visible motivation, pressure, purpose, or trigger
  separate from raw payload JSON
- **AND** the motivation MUST be derived from committed data such as event type,
  event payload, NPC life goals, project purpose, area pressure, or world cycle

#### Scenario: Existing event lacks explicit motivation

- **WHEN** an older event lacks an explicit motivation payload
- **THEN** the UI MAY derive a deterministic fallback motivation from the existing
  committed event type and payload
- **AND** it MUST NOT ask AI to invent missing reasons

### Requirement: Construction events carry authoritative project motivation

Construction progress and unlock events SHALL carry why the project exists using
deterministic, replayable data derived from committed simulation state such as NPC
life goals, needs, area pressure, and project purpose.

#### Scenario: Productive work advances a project

- **WHEN** a committed productive action advances a construction project
- **THEN** the resulting construction progress event MUST include a motivation
  object with a project purpose, primary pressure, pressure score, and explanation
- **AND** the public narration SHOULD mention the reason in human-readable form

#### Scenario: Project unlocks map or building

- **WHEN** a construction project unlocks a tile or building
- **THEN** the unlock event MUST carry the same project motivation
- **AND** clients SHOULD be able to show why the expansion happened without
  parsing unrelated historical events


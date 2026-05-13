# server-event-motivation-payloads Specification

## Purpose
TBD - created by archiving change server-event-motivation-payloads. Update Purpose after archive.
## Requirements
### Requirement: Living-world events can carry authoritative motivation

The system SHALL support deterministic motivation payloads on living-world
commands. When present, the Rule Engine SHALL validate the motivation shape before
accepting the command and appending the resulting event.

#### Scenario: Runtime emits motivated event

- **WHEN** the runtime submits a public living-world command with motivation
- **THEN** the accepted EventLog event MUST preserve that motivation in its payload
- **AND** clients SHOULD prefer the committed motivation over derived fallback text

#### Scenario: Motivation is invalid

- **WHEN** a command includes malformed motivation
- **THEN** the Rule Engine MUST reject the command
- **AND** no event MUST be appended for that command

### Requirement: Common runtime events include motivation

The runtime SHALL attach deterministic motivation to common public events when it
has sufficient local context, including NPC productive actions, interactions,
life goals, households, children, area pressure, movement/activity, building
enter/leave, weather/season changes, rare windows, and spawned world events.

#### Scenario: Player reads recent chronicle

- **WHEN** recent public events were emitted after this change
- **THEN** their payloads SHOULD include motivation explaining the pressure,
  purpose, trigger, or rule that caused the event
- **AND** the motivation MUST NOT be authored by AI


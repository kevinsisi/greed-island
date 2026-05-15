# household-shared-economy Specification

## Purpose
TBD - created by archiving change household-shared-economy. Update Purpose after archive.
## Requirements
### Requirement: Household income SHALL be recorded as pooled gold

The system SHALL represent household pooled income with accepted
`HOUSEHOLD_GOLD_CONTRIBUTED` EventLog facts. A contribution MUST identify
household id, contributing NPC id, amount, source event type, source id, tile id,
and tick.

#### Scenario: Household member contributes income

- **GIVEN** an NPC belongs to an existing household
- **AND** the runtime accepts an income-producing event for that NPC
- **WHEN** household contribution is planned
- **THEN** the runtime MUST emit `HOUSEHOLD_GOLD_CONTRIBUTED` through the Rule
  Engine rather than mutating household projection state directly

### Requirement: Household economy projection SHALL replay pooled balance

The household economy projection MUST rebuild from EventLog facts and expose each
household's contributed total, spent total, inherited total, balance, last tick,
and contributing member ids. Duplicate contribution or spending events with the
same source identity MUST NOT double count.

#### Scenario: Replay produces deterministic balance

- **GIVEN** household contribution and spending events exist in EventLog
- **WHEN** the household economy projection rebuilds from those events
- **THEN** the household balance MUST equal contributed plus inherited minus spent
- **AND** rebuilding the same EventLog MUST produce the same canonical hash

### Requirement: Household spending SHALL be auditable and capped by balance

The system SHALL represent household spending with accepted `HOUSEHOLD_GOLD_SPENT`
EventLog facts. The household economy projection MUST NOT reduce balance below
zero when spending exceeds available pooled gold.

#### Scenario: Overspend is clamped in projection

- **GIVEN** a household has 5 pooled gold
- **WHEN** a `HOUSEHOLD_GOLD_SPENT` event spends 8 pooled gold
- **THEN** the projection MUST record at most 5 spent gold for that event
- **AND** household balance MUST remain zero or greater

### Requirement: Household inheritance SHALL be event-sourced substrate

The system SHALL support `HOUSEHOLD_INHERITANCE_ASSIGNED` EventLog facts that
assign inherited household gold to a child or descendant heir. The event MUST
identify household id, deceased NPC id, heir id, amount, and tick. This capability
MUST NOT require this slice to generate `NPC_DECEASED` events.

#### Scenario: Inheritance increases inherited total

- **GIVEN** a household has a child heir
- **WHEN** an accepted `HOUSEHOLD_INHERITANCE_ASSIGNED` event assigns inherited
  gold to that heir
- **THEN** the household economy projection MUST increase inherited total and
  expose the heir assignment


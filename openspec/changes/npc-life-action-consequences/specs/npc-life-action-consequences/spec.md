## ADDED Requirements

### Requirement: Accepted NPC life actions produce replayable consequences

Accepted NPC freeform life actions SHALL create deterministic consequences in replayable projections rather than only player-facing text.

#### Scenario: Shopping creates NPC supplies

- **GIVEN** a committed accepted `NPC_FREEFORM_ACTION_PROPOSED` event with resolved kind `buy_goods`
- **WHEN** goods inventory is rebuilt from the EventLog
- **THEN** the acting NPC SHALL have positive `daily_supplies` inventory at the target tile.

#### Scenario: Learning grants XP

- **GIVEN** a committed accepted `NPC_FREEFORM_ACTION_PROPOSED` event with resolved kind `learn`
- **WHEN** skill XP is rebuilt from the EventLog
- **THEN** the acting NPC SHALL gain positive `learning` XP.

#### Scenario: Invention creates technology evidence

- **GIVEN** a committed accepted `NPC_FREEFORM_ACTION_PROPOSED` event with resolved kind `invent`
- **WHEN** world civilization state is rebuilt from the EventLog
- **THEN** the world technology list SHALL contain a technology row derived from that accepted invention action and its summary.

#### Scenario: Consequences survive large-log hydration

- **GIVEN** the server uses selective boot/deferred hydration filters
- **WHEN** affected projections hydrate from persisted events
- **THEN** `NPC_FREEFORM_ACTION_PROPOSED` events SHALL be included for goods inventory, skill XP, and world civilization projections.

## ADDED Requirements

### Requirement: Weather agent has deterministic identity and intent

The system SHALL model weather as a stable system actor with actor id `weather.agent`. The weather agent SHALL derive its mood, pressure source, desired weather, and thought from committed EventLog history, current tick, ruleset version, and world config. The policy MUST NOT depend on wall-clock time, external AI output, network timing, or hidden mutable memory.

#### Scenario: Same history produces same weather intent

- **WHEN** two runtimes evaluate the weather agent at the same tick with the same EventLog, ruleset version, and world config
- **THEN** they MUST produce byte-identical weather intent command payloads or both produce no command

#### Scenario: Weather agent does not use AI authority

- **WHEN** AI providers are unavailable or return different text
- **THEN** weather-agent policy and accepted weather outcomes MUST remain unchanged

### Requirement: Weather intent is committed before accepted weather outcome

The system SHALL define a `WEATHER_INTENT_PROPOSED` command/event that records the weather agent's bounded intent. Its payload SHALL include `currentWeather`, `desiredWeather`, `mood`, `pressureSource`, `thought`, `reason`, and `cadenceKey`. Accepted weather changes SHALL still commit a `WEATHER_CHANGE` event through Rule Engine validation.

#### Scenario: Intent precedes weather change

- **WHEN** the weather agent decides to change weather during a tick
- **THEN** the committed EventLog MUST include `WEATHER_INTENT_PROPOSED` before the corresponding accepted `WEATHER_CHANGE` event for that tick

#### Scenario: Invalid desired weather is rejected

- **WHEN** a `WEATHER_INTENT_PROPOSED` command carries a `desiredWeather` outside the supported weather catalog
- **THEN** the Rule Engine MUST reject it with `INVALID_PAYLOAD` and MUST NOT commit a weather intent or weather change event

### Requirement: Weather thoughts are projected world history

The system SHALL expose weather-agent mood and recent thoughts from a projection rebuilt from committed weather-agent and weather-change events. Chronicle, timeline, and world API surfaces MAY display these thoughts, but MUST identify them as committed weather-agent history rather than generated facts.

#### Scenario: Projection rebuild preserves thoughts

- **WHEN** the weather-agent projection is rebuilt from the same EventLog
- **THEN** its current mood, latest thought, recent thoughts, and latest desired weather MUST match the original projection

#### Scenario: Public API remains backward compatible

- **WHEN** a caller reads `/api/world`
- **THEN** the existing `weather` field MUST remain available and any weather-agent metadata MUST be additive

### Requirement: Weather intent influences systems only through accepted events

The weather agent SHALL NOT directly mutate area resources, ecosystem populations, civilization pressure, card drops, NPC state, or world events. Weather-agent intent MAY lead to bounded commands for weather outcomes or weather-scoped world events, but only accepted committed Events SHALL affect projections and downstream systems.

#### Scenario: Rejected intent has no projection side effect

- **WHEN** weather-agent intent is rejected by validation
- **THEN** the projected weather, ecology, civilization, card-drop, and NPC state MUST remain unchanged except for any explicit rejection telemetry that is not part of world truth

#### Scenario: Accepted weather change drives downstream effects

- **WHEN** a weather-agent intent results in an accepted `WEATHER_CHANGE` event
- **THEN** weather-sensitive systems MUST read the committed weather projection, not the uncommitted intent payload

# Spec — ecosystem-predation capability

## ADDED Requirements

### Requirement: Predation SHALL be planned deterministically from population rows

The ecosystem runtime MUST plan predator-on-prey interactions from
`animal_population` rows and species `preyTargets`. A predator species is eligible
only when at least one predator animal and at least one same-tile target prey
animal exist.

#### Scenario: Predator chooses same-tile prey

- **GIVEN** a `fog_wolf` population row and a `forest_deer` population row exist
  on the same tile
- **WHEN** predation is planned for the tick
- **THEN** the plan MUST select one predator id and one prey animal id using a
  deterministic ranking derived from species id, tile id, animal ids, and tick

#### Scenario: Predator ignores non-target species

- **GIVEN** a predator species has `preyTargets = ['forest_deer']`
- **AND** only `moss_boar` exists on the same tile
- **WHEN** predation is planned for the tick
- **THEN** no predation kill MUST be planned for that predator species

### Requirement: Predation SHALL flow through typed living-world events

The runtime MUST represent a successful predator hunt as typed commands accepted
by the Rule Engine. A successful predation chain MUST include
`ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, and `ANIMAL_KILLED` events. The
kill MUST identify the predator species id, predator animal id, prey species id,
prey animal id, tile id, hunt id, and tick either directly or through the linked
event payloads.

#### Scenario: Successful predation emits event chain

- **GIVEN** a valid predation plan exists
- **WHEN** the runtime applies the plan
- **THEN** the accepted EventLog facts MUST include the hunt started, hunt
  resolved, and prey killed events for that plan

### Requirement: Predation SHALL reduce prey population through ANIMAL_KILLED

The `animal_population` projection MUST remove the prey animal id when the
accepted predation `ANIMAL_KILLED` event references an existing animal id in the
prey species/tile row. Replay of the same EventLog MUST produce the same
canonical projection hash.

#### Scenario: Predation kill removes prey

- **GIVEN** a prey animal was spawned into a species/tile population row
- **AND** a later predation `ANIMAL_KILLED` event references that prey animal id
- **WHEN** `animal_population` rebuilds from EventLog
- **THEN** the prey species/tile row count MUST decrease by one and MUST NOT drop
  below zero on duplicate kill events

### Requirement: Predator starvation SHALL be recorded when no prey is available

The ecosystem runtime SHALL record starvation pressure when a predator species has
at least one predator animal on a tile and none of its target prey species have
same-tile population. The runtime MUST be able to emit an `ANIMAL_STARVED`
pressure event. The starvation event MUST identify predator species id, tile id,
predator animal id, starvation stage, and tick. This event MUST NOT directly
remove the predator population in this slice.

#### Scenario: Predator with no prey records starvation pressure

- **GIVEN** a `fog_wolf` population row exists on a tile
- **AND** no same-tile `forest_deer` or `moss_boar` population exists
- **WHEN** predation is planned for the tick
- **THEN** an `ANIMAL_STARVED` pressure event MAY be emitted for one predator id
- **AND** the predator population MUST remain unchanged by that event

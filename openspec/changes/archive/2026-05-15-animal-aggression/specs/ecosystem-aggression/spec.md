# Spec — ecosystem-aggression capability

First slice of the `ecosystem-aggression` capability. Closes the
"ecosystem cannot bite" gap noted in Part I §6.2 — starving predators
gain agency over NPCs on their tile, and hunted prey can land a
retaliation blow before dying.

## ADDED Requirements

### Requirement: Hungry predators SHALL attack NPCs on their tile

The runtime MUST swap the starvation event chain for an aggression
event chain whenever a predator that would normally starve has at
least one NPC on the same tile and `species.aggression > 0`. The
chain MUST be `ANIMAL_TARGETED_NPC` followed by `ANIMAL_ATTACKED_NPC`,
both routed through the Rule Engine and into typed Events.

#### Scenario: Starving wolf attacks the farmer instead of dying

- **GIVEN** a `fog_wolf` on `t_forest` has `hungerDuration >=
  PREDATOR_STARVATION_THRESHOLD_TICKS` and no prey is in its
  `animal_population` row on `t_forest`
- **AND** the NPC `npc_yuna` is also on `t_forest`
- **AND** `species.fog_wolf.aggression > 0`
- **WHEN** the runtime evaluates the predation step for the next tick
- **THEN** the Rule Engine MUST accept `ANIMAL_TARGETED_NPC { wolfAnimalId, npcId: 'npc_yuna', tileId: 't_forest' }`
- **AND** the Rule Engine MUST accept `ANIMAL_ATTACKED_NPC { wolfAnimalId, npcId: 'npc_yuna', damage: { mood, health } }`

#### Scenario: No NPC on tile keeps the starvation path

- **GIVEN** a `fog_wolf` on `t_mountain` is starving
- **AND** no NPC is on `t_mountain`
- **WHEN** the runtime evaluates the predation step
- **THEN** the runtime MUST emit `ANIMAL_STARVED` as today and MUST NOT
  emit any aggression event

### Requirement: NPC injury SHALL flow through NpcStateProjection

The runtime MUST apply attack damage by emitting an `NPC_STATE_RECORDED`
event carrying the post-damage `mood` and `health`, clamped at 0. No
new injury projection is introduced.

#### Scenario: Damage is clamped at zero

- **GIVEN** an NPC with `health = 5` is attacked with `damage.health = 10`
- **WHEN** the aggression chain runs
- **THEN** the resulting `NPC_STATE_RECORDED` event MUST carry
  `state.health = 0` and not a negative number

### Requirement: Attacking animals SHALL flee when fear clears the threshold

The runtime MUST emit `ANIMAL_FLED { animalId, fromTileId, toTileId,
reason: 'attacked' }` after an `ANIMAL_ATTACKED_NPC` event whenever
`species.fear / 100` clears a deterministic threshold derived from
`hashSeed(animalId, tileId, tick, 'flee-trigger')`. The destination
tile MUST be a deterministic adjacent tile from `MAP_ADJACENCY`.

#### Scenario: Fearful wolf retreats after biting

- **GIVEN** an `ANIMAL_ATTACKED_NPC` event just committed for a wolf
  on `t_forest`
- **AND** `species.fog_wolf.fear` is high enough to pass the flee
  threshold
- **WHEN** the runtime continues the predation step
- **THEN** the runtime MUST emit `ANIMAL_FLED { fromTileId: 't_forest', toTileId: <adjacent>, reason: 'attacked' }`

### Requirement: Hunted prey SHALL retaliate when species aggression is non-zero

The retaliation planner MUST evaluate every accepted
`ANIMAL_HUNT_STARTED` against a target whose `species.aggression > 0`
and, if the deterministic check passes, emit `ANIMAL_RETALIATED`
BEFORE the matching `ANIMAL_HUNT_RESOLVED` so the dying animal can
land its blow.

#### Scenario: Wolf bites the hunter on its way down

- **GIVEN** an NPC `npc_kai` initiates `ANIMAL_HUNT_STARTED` against
  a `fog_wolf` on `t_forest`
- **AND** `species.fog_wolf.aggression > retaliation threshold`
- **WHEN** the runtime emits the hunt chain
- **THEN** the event order MUST be `ANIMAL_HUNT_STARTED → ANIMAL_RETALIATED → ANIMAL_HUNT_RESOLVED`
- **AND** `ANIMAL_RETALIATED.payload` MUST include `npcId: 'npc_kai'`,
  `animalId: <wolf>`, and `damage: { mood, health }`

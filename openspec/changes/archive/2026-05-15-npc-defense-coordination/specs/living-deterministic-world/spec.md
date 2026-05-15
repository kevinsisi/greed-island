# Spec — living-deterministic-world delta (defense party command)

Adds the `NPC_DEFENSE_PARTY_FORMED` command to the living-world catalog
so defense party formation goes through the same Command → Rule Engine
→ Event pipeline as every other living-world state change.

## ADDED Requirements

### Requirement: The living-world catalog SHALL register the defense party command

The catalog in `packages/server/src/kernel/livingWorldCommands.ts` MUST
include `NPC_DEFENSE_PARTY_FORMED` with a validator that requires a
non-empty `partyId`, a non-empty `targetAnimalId`, a non-empty
`tileId`, an integer non-negative `formedAtTick`, and a
`memberNpcIds` array of length `>= DEFENSE_PARTY_MIN_MEMBERS`.

#### Scenario: Validator rejects a party with one member

- **GIVEN** a command `NPC_DEFENSE_PARTY_FORMED` with
  `payload.data.memberNpcIds = ['npc_solo']`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST be rejected
- **AND** no event MUST be appended to the EventLog

#### Scenario: Valid party formation passes validation

- **GIVEN** a command `NPC_DEFENSE_PARTY_FORMED` with
  `payload.data = { partyId: 'defense.abc', targetAnimalId: 'a_wolf_001', targetSpeciesId: 'fog_wolf', tileId: 't_forest', victimNpcId: 'npc_yuna', memberNpcIds: ['npc_anton', 'npc_kai'], reactionToAttackId: 'attack.a_wolf_001.t_forest.100', formedAtTick: 101, narration: '...' }`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST pass validation

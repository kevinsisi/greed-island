# Spec — living-deterministic-world delta (animal aggression commands)

Adds four new commands to the living-world catalog so animal aggression
events go through the same Command → Rule Engine → Event pipeline as
every other living-world state change.

## ADDED Requirements

### Requirement: The living-world catalog SHALL register four aggression commands

The catalog in `packages/server/src/kernel/livingWorldCommands.ts` MUST
include `ANIMAL_TARGETED_NPC`, `ANIMAL_ATTACKED_NPC`, `ANIMAL_FLED`,
and `ANIMAL_RETALIATED` with payload validators that enforce non-empty
identifiers and integer non-negative tick fields. The Rule Engine MUST
reject any payload that fails validation.

#### Scenario: Validator rejects an empty animalId on attack

- **GIVEN** a command `ANIMAL_ATTACKED_NPC` with
  `payload.data.animalId = ''`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST be rejected
- **AND** no event MUST be appended to the EventLog

#### Scenario: Valid attack payload passes validation

- **GIVEN** a command `ANIMAL_ATTACKED_NPC` with
  `payload.data = { animalId: 'a_wolf_001', npcId: 'npc_yuna', speciesId: 'fog_wolf', tileId: 't_forest', damage: { mood: -10, health: -10 }, attackedAtTick: 100, narration: '...' }`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST pass validation
- **AND** the matching event MUST be appended to the EventLog

## ADDED Requirements

### Requirement: Player victory MAY drop a canonical combat-victory card

On `COMBAT_RESOLVE` with `player_victory`, the system MUST roll a deterministic loot chance seeded by combatId — base 0.05, plus duration bonus capped at 0.10, ×2 during rare windows, ×1.3 when the tile's area safety is below 30 — and on success spawn one card from the `acquisitionMethod === 'combat_victory'` pool through the existing `CARD_DROP_SPAWN` pipeline (reason `combat_loot`, deterministic position, existence caps enforced by the pipeline).

#### Scenario: Loot is deterministic per combat

- **GIVEN** the same combatId and resolve context
- **WHEN** the loot roll is computed repeatedly
- **THEN** the result (card id or null) MUST be identical every time

### Requirement: Player defeat SHALL cost energy and one held card

On `COMBAT_RESOLVE` with `playerEnergyToZero: true`, the runtime's resolve consumer MUST emit `PLAYER_ENERGY_SET { energy: 0, reason: 'combat_defeat' }` — covering BOTH the Phase B round path and the Phase C sub-tick path through the same consumer. Additionally, on `npc_victory`, if the player holds any unstored card drops, one (deterministically picked by combatId) MUST be released back to the ground via `CARD_RELEASE`, restarting its pickup timer so others can claim it.

#### Scenario: Phase C defeat zeroes energy

- **GIVEN** a sub-tick combat resolving with npc_victory and playerEnergyToZero true
- **WHEN** the resolve event is published
- **THEN** a PLAYER_ENERGY_SET event with energy 0 MUST be committed

#### Scenario: A held card is lost on defeat

- **GIVEN** a defeated player holding two cards
- **WHEN** the resolve hook runs
- **THEN** exactly one deterministic held card MUST be released to the ground

### Requirement: Witnesses SHALL lose respect for the defeated NPC

On `player_victory` against an NPC, up to 6 NPC witnesses on the tile MUST each emit `NPC_RELATIONSHIP_DIMENSION_ADJUSTED { dimension: 'respect', delta: -8 }` toward the defeated NPC, alongside the existing incapacitation and witness-record events.

#### Scenario: Witness respect shift

- **GIVEN** three NPCs on the tile when one is defeated by the player
- **WHEN** the resolve consumer runs
- **THEN** each witness MUST emit one respect −8 adjustment toward the defeated NPC

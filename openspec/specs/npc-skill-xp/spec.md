# npc-skill-xp Specification

## Purpose
TBD - created by archiving change npc-skill-mentorship. Update Purpose after archive.
## Requirements
### Requirement: SkillXpProjection persists per-NPC per-skill XP and level

The system SHALL maintain a `SkillXpProjection` that maps `(npcId, skillId)` to `{ xp: number; level: number; mentorId: string | null }`. It MUST implement `rebuildFromEvents(events)` and `project(event)` so it is rebuilt deterministically from the EventLog on every restart. Valid `skillId` values are `'hunting'`, `'fishing'`, and `'construction'`.

#### Scenario: XP row created on first NPC_OBSERVED_SKILL

- **WHEN** `NPC_OBSERVED_SKILL` is projected for npcId=`npc_a`, skillId=`hunting`
- **THEN** the projection contains a row `{ npcId: 'npc_a', skillId: 'hunting', xp: 5, level: 0, mentorId: null }`

#### Scenario: repeated observations accumulate XP

- **WHEN** `NPC_OBSERVED_SKILL` is projected 20 times for the same `(npcId, skillId)`
- **THEN** `xp >= 100` and `level === 1`

#### Scenario: rebuildFromEvents is idempotent

- **WHEN** `rebuildFromEvents` is called twice with the same event list
- **THEN** the projection state is identical after both calls

### Requirement: SimulationRuntime exposes getNpcSkills accessor

`SimulationRuntime` SHALL expose `getNpcSkills(npcId: string): Array<{ skillId: string; xp: number; level: number }>` that returns all rows for the given NPC with `xp > 0`.

#### Scenario: returns empty array for unknown NPC

- **WHEN** `getNpcSkills('nonexistent')` is called
- **THEN** the result is `[]`

#### Scenario: returns populated rows for NPC with skill history

- **GIVEN** the projection has rows for npcId=`npc_a` with skills `hunting` (xp=50) and `fishing` (xp=10)
- **WHEN** `getNpcSkills('npc_a')` is called
- **THEN** the result contains exactly those two rows


# npc-rumor-propagation Specification

## Purpose
TBD - created by archiving change npc-rumor-propagation. Update Purpose after archive.
## Requirements
### Requirement: World events seed rumors onto same-tile NPCs

When a notable world event is accepted (currently `ANIMAL_STARVED` and `SETTLEMENT_CONSTRUCTION_COMPLETED`), the runtime SHALL emit one `NPC_RUMOR_HEARD` command per NPC currently present on the event tile. Each command SHALL carry a structured rumor payload: `rumorId` (deterministic hash of topic + subjectId + originTick), `topic`, `subjectId`, `originTick`, `accuracy = 100`, and `tileId`.

#### Scenario: Predator starvation seeds a rumor

- **WHEN** an `ANIMAL_STARVED` event is accepted on `tileId = 't_forest'`
- **AND** NPC `shen_ruo_yun` is currently on tile `'t_forest'`
- **THEN** the runtime MUST emit `NPC_RUMOR_HEARD` for `npcId = 'shen_ruo_yun'` with `topic = 'predator_death'` and `accuracy = 100`

#### Scenario: No rumor seeded when tile has no NPCs

- **WHEN** a notable event is accepted on a tile with no NPCs present
- **THEN** the runtime MUST NOT emit any `NPC_RUMOR_HEARD` command

#### Scenario: Each eligible NPC receives its own rumor command

- **WHEN** a notable event fires on a tile with two NPCs present
- **THEN** the runtime MUST emit exactly two `NPC_RUMOR_HEARD` commands, one per NPC

### Requirement: RumorProjection tracks active rumors per NPC

The system SHALL maintain a `RumorProjection` (in-memory, rebuilt from EventLog on boot) that tracks each NPC's active rumors. A rumor is active when its `accuracy >= 10`. Each NPC MAY hold at most 5 active rumors; when a new rumor would exceed this cap the oldest by `heardAtTick` MUST be evicted.

#### Scenario: NPC_RUMOR_HEARD adds an active rumor

- **WHEN** an `NPC_RUMOR_HEARD` event is accepted for `npcId = 'n1'`
- **THEN** `rumorProjection.getActiveRumors('n1')` MUST include the new rumor with the correct `topic`, `subjectId`, and `accuracy = 100`

#### Scenario: Eviction at cap

- **WHEN** NPC `n1` already holds 5 active rumors and a sixth `NPC_RUMOR_HEARD` is accepted
- **THEN** `rumorProjection.getActiveRumors('n1')` MUST contain exactly 5 entries
- **AND** the oldest rumor by `heardAtTick` MUST NOT be present

#### Scenario: Unknown NPC returns empty list

- **WHEN** `rumorProjection.getActiveRumors('nonexistent')` is called
- **THEN** it MUST return an empty array without throwing

### Requirement: NPCs spread rumors during interactions

When `NPC_INTERACT` is processed and at least one participant holds an active rumor, the runtime SHALL emit at most one `NPC_RUMOR_SPREAD` command selecting the highest-accuracy rumor from the first participant who has rumors. The spread command SHALL carry a degraded accuracy: `Math.round(original_accuracy * 85 / 100)`.

#### Scenario: Spread transfers rumor to second participant

- **WHEN** `NPC_INTERACT` is accepted for participants `[npcA, npcB]`
- **AND** `npcA` holds a rumor with `accuracy = 100`
- **AND** `npcB` does NOT hold any rumor with the same `rumorId`
- **THEN** the runtime MUST emit `NPC_RUMOR_SPREAD` with `fromNpcId = 'npcA'`, `toNpcId = 'npcB'`, and `accuracy = 85`

#### Scenario: Accuracy degrades on each hop

- **WHEN** `NPC_RUMOR_SPREAD` is accepted with `accuracy = 85`
- **AND** that NPC later interacts with a third NPC
- **THEN** the next `NPC_RUMOR_SPREAD` MUST carry `accuracy = 72` (Math.round(85 * 85 / 100))

#### Scenario: No spread when all participants lack rumors

- **WHEN** `NPC_INTERACT` is accepted and neither participant holds any active rumor
- **THEN** the runtime MUST NOT emit `NPC_RUMOR_SPREAD`

#### Scenario: No spread when recipient already holds the same rumor

- **WHEN** `NPC_INTERACT` is accepted and `npcB` already holds a rumor with the same `rumorId` as `npcA`'s top rumor
- **THEN** the runtime MUST NOT emit `NPC_RUMOR_SPREAD` for that rumor

### Requirement: Rumors below accuracy threshold are excluded from active list

A rumor with `accuracy < 10` MUST NOT be returned by `getActiveRumors()` and MUST NOT be considered eligible for spreading.

#### Scenario: Expired rumor invisible after threshold

- **WHEN** a rumor's accuracy has decayed below 10 through repeated spreading
- **THEN** `rumorProjection.getActiveRumors(npcId)` MUST NOT include that rumor

### Requirement: Rumor state exposed in world snapshot

`WorldSnapshot.facts.npcRumors` SHALL contain all active rumor rows from `RumorProjection.list()`. Each row MUST include `npcId`, `rumorId`, `topic`, `subjectId`, `tileId`, `originTick`, `accuracy`, and `heardAtTick`.

#### Scenario: Snapshot includes npcRumors after seeding

- **WHEN** `getSnapshot()` is called after at least one `NPC_RUMOR_HEARD` event is accepted
- **THEN** `facts.npcRumors` MUST be an array containing at least one entry matching the seeded NPC and topic

#### Scenario: Empty snapshot before any rumors

- **WHEN** `getSnapshot()` is called before any rumor events
- **THEN** `facts.npcRumors` MUST be an empty array


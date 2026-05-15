## ADDED Requirements

### Requirement: Rumor spread creates event-type memory entries for both participants

When an `NPC_RUMOR_SPREAD` event is accepted, the runtime SHALL create an `event`-type `NpcMemoryRow` for both the spreading NPC (`fromNpcId`) and the receiving NPC (`toNpcId`). The memory content SHALL record the rumor topic, subject, and accuracy at the time of spread. Memory entries MUST be idempotent on `(npc_id, memory_type, tick, content_hash)` per the existing `SqliteNpcMemoryStore` contract.

#### Scenario: Spreading NPC records memory of sharing

- **WHEN** `NPC_RUMOR_SPREAD` is accepted at tick `T` with `fromNpcId = 'npcA'`, `topic = 'predator_death'`, `subjectId = 'fog_wolf'`
- **THEN** `SqliteNpcMemoryStore` MUST contain a row for `npcId = 'npcA'`, `memoryType = 'event'`, `tick = T`
- **AND** `contentJson` MUST reference topic `'predator_death'` and subject `'fog_wolf'`

#### Scenario: Receiving NPC records memory of hearing

- **WHEN** `NPC_RUMOR_SPREAD` is accepted at tick `T` with `toNpcId = 'npcB'`, `topic = 'predator_death'`
- **THEN** `SqliteNpcMemoryStore` MUST contain a row for `npcId = 'npcB'`, `memoryType = 'event'`, `tick = T`
- **AND** `contentJson` MUST reference topic `'predator_death'`

#### Scenario: Duplicate spread at same tick is idempotent

- **WHEN** `NPC_RUMOR_SPREAD` for the same `(fromNpcId, toNpcId, rumorId, tick)` is replayed
- **THEN** `SqliteNpcMemoryStore` MUST NOT create a duplicate row

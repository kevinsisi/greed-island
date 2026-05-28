# npc-relationship-dimensions Specification

## Purpose
TBD - created by archiving change npc-npc-multi-dim-relationship. Update Purpose after archive.
## Requirements
### Requirement: Each ordered NPC pair SHALL hold an eight-axis dimension vector
For every ordered pair `(from: npcId, to: npcId)` where at least one event has ever bound the two together (interact, household, mentorship, combat witness, faction shift, deceased grief), the `npc_relationships` projection SHALL store a row containing `dimensions: { trust, fear, respect, attraction, loyalty, resentment, dependency, familiarity }`. Each dimension MUST be a clamped 0..100 integer. Defaults at first touch: `trust=50, fear=50, respect=50, attraction=50, loyalty=50, resentment=50, dependency=50, familiarity=0`.

#### Scenario: First touch initializes to defaults
- **GIVEN** no row exists for `(from, to)`
- **WHEN** the projection records the first event mutating either direction
- **THEN** the row MUST be inserted with the default vector
- **AND** the chosen direction's delta MUST be applied on top of the defaults

#### Scenario: Each direction stored independently
- **WHEN** an event sets `dimensions(a→b).fear = 75` but does not touch `(b→a)`
- **THEN** the row for `(b→a)` MUST remain at defaults (or its prior value, if it existed)

### Requirement: NPC_INTERACT chat SHALL drift trust + familiarity; argue SHALL drift trust + resentment + familiarity
The existing trust deltas MUST be preserved bit-for-bit:
- `chat`: trust +1
- `argue`: trust −2

New deltas added (applied symmetrically to both directions of the participant pair):
- `chat`: familiarity +1, resentment −1 (clamped at 0)
- `argue`: resentment +2, familiarity +1

#### Scenario: Existing trust math is unchanged
- **GIVEN** a row at base trust 50
- **WHEN** one `NPC_INTERACT mode=chat` is projected
- **THEN** `dimensions.trust` MUST equal 51 for both directions of the participant pair

#### Scenario: Argue raises resentment
- **GIVEN** a row at base resentment 50
- **WHEN** one `NPC_INTERACT mode=argue` is projected
- **THEN** `dimensions.resentment` MUST equal 52 for both directions

#### Scenario: Chat increases familiarity for new acquaintance
- **GIVEN** no existing row (familiarity default 0)
- **WHEN** five `NPC_INTERACT mode=chat` events are projected
- **THEN** `dimensions.familiarity` MUST equal 5 for both directions

### Requirement: NPC_HOUSEHOLD_FORMED SHALL boost attraction, dependency, familiarity, trust between partners
When `NPC_HOUSEHOLD_FORMED` commits with `partnerNpcIds = [a, b]`, both `(a→b)` and `(b→a)` MUST receive: attraction +30, dependency +20, familiarity +20, trust +5 (all clamped).

#### Scenario: Pair-bond raises attraction symmetrically
- **GIVEN** dimensions(a→b) and dimensions(b→a) at defaults
- **WHEN** `NPC_HOUSEHOLD_FORMED` with partners=[a,b] commits
- **THEN** dimensions(a→b).attraction MUST equal 80
- **AND** dimensions(b→a).attraction MUST equal 80
- **AND** dimensions(a→b).dependency MUST equal 70

### Requirement: NPC_MENTORSHIP_COMPLETED SHALL boost respect/loyalty (apprentice→mentor) and attraction/respect (mentor→apprentice)
When `NPC_MENTORSHIP_COMPLETED` commits with `mentor=m, apprentice=a`, the projection MUST apply the following deltas:
- `(a→m)`: respect +20, loyalty +15, familiarity +10
- `(m→a)`: attraction +10 (non-romantic fondness), respect +5, familiarity +10

All deltas MUST be clamped to 0..100.

#### Scenario: Apprentice grows respect for mentor
- **GIVEN** defaults
- **WHEN** `NPC_MENTORSHIP_COMPLETED mentor=m apprentice=a` commits
- **THEN** dimensions(a→m).respect MUST equal 70
- **AND** dimensions(a→m).loyalty MUST equal 65

#### Scenario: Mentor's attraction toward apprentice is bounded fondness
- **WHEN** the same event commits
- **THEN** dimensions(m→a).attraction MUST equal 60 (default 50 + 10)
- **AND** this value MUST NOT trigger `'lover'` type derivation (lover needs ≥ 70)

### Requirement: NPC_DECEASED of a respected target SHALL impart respect, not fear, to admirers
For each NPC `w` such that `dimensions(w→victim).respect ≥ 60` at the time of the victim's death, the projection MUST apply: respect +10 (capped 100), fear −20 (clamped 0), familiarity unchanged. Trust unchanged.

#### Scenario: Death of respected elder elevates respect
- **GIVEN** dimensions(w→victim) = { respect: 70, fear: 30, ... }
- **WHEN** `NPC_DECEASED` for victim commits
- **THEN** dimensions(w→victim).respect MUST equal 80
- **AND** dimensions(w→victim).fear MUST equal 10

### Requirement: COMBAT_RESOLVE with declared winner SHALL raise witness fear toward the winner
For each NPC recorded as a witness of a `COMBAT_RESOLVE` event (via `COMBAT_WITNESS_RECORDED` on the same tile), the projection MUST apply `dimensions(witness→winnerId).fear += 20` (capped 100). Loser-side witnesses also receive `resentment += 10` toward winner.

#### Scenario: Witness fears combat winner
- **GIVEN** dimensions(w→winner) defaults
- **WHEN** `COMBAT_RESOLVE` resolves with winner='alice' and `COMBAT_WITNESS_RECORDED` for w fires same tick
- **THEN** dimensions(w→alice).fear MUST equal 70

### Requirement: FACTION_TILE_SEIZED SHALL raise fear and resentment among defending faction members toward seizers
On `FACTION_TILE_SEIZED` with `seizingFactionId=F, defendingFactionId=D`, the projection MUST iterate every NPC `n` whose current `factionLean === D` and every NPC `s` whose current `factionLean === F` that has any existing relationship row with `n`. For each such ordered pair, the projection MUST apply `dimensions(n→s).fear += 15` and `dimensions(n→s).resentment += 20`. All values MUST be clamped to 0..100.

#### Scenario: Defender fears + resents named seizers
- **GIVEN** dimensions(defender→seizer) with respect=50, fear=50, resentment=50
- **WHEN** seizing faction takes a tile defenders consider home (existing relationship row already exists)
- **THEN** dimensions(defender→seizer).fear MUST equal 65
- **AND** dimensions(defender→seizer).resentment MUST equal 70

### Requirement: NPC_RELATIONSHIP_DIMENSION_ADJUSTED SHALL allow external systems to set a single dimension
A new event type `NPC_RELATIONSHIP_DIMENSION_ADJUSTED` with payload `{ from: npcId, to: npcId, dimension: 'trust'|'fear'|..., delta: number, reason: string, tick }` MUST be supported. The projection MUST clamp the resulting value to 0..100.

#### Scenario: Explicit dimension adjustment works
- **GIVEN** dimensions(a→b).fear = 50
- **WHEN** `NPC_RELATIONSHIP_DIMENSION_ADJUSTED from=a to=b dimension=fear delta=+30 reason='grief'` commits
- **THEN** dimensions(a→b).fear MUST equal 80

### Requirement: Projection SHALL be rebuildable from EventLog
`SqliteNpcRelationshipsStore.rebuildFromEvents(events)` MUST drop all rows and replay all relevant events to produce identical final state. A canonical hash test MUST cover a representative event sequence including all delta sources.

#### Scenario: Rebuild produces identical row state
- **GIVEN** an EventLog with 100 mixed relationship-affecting events
- **WHEN** `rebuildFromEvents` is called twice
- **THEN** both runs MUST produce identical row data (canonical-hash equal)

### Requirement: Trust scalar SHALL remain queryable for backward compatibility
The `npc_relationships` table MUST retain a top-level `trust INTEGER` column (in addition to the JSON blob's `dimensions.trust`) so existing SQL queries continue to function. The column MUST always equal `dimensions.trust`.

#### Scenario: Top-level trust column equals dimensions.trust
- **GIVEN** a row whose dimensions.trust is updated to 67
- **WHEN** the row is read via raw SQL
- **THEN** the `trust` column MUST also read 67


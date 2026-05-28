# npc-naming Specification

## Purpose
Defines deterministic generation of bilingual names for born children, replacing the hardcoded `nameZh: '潮生'` constant in `planHouseholdCommands`. Ensures every child receives a unique-feeling name from a curated bilingual pool, drawn deterministically by `hashSeed`, so the same simulation seed always yields identical names across replay and restart.

## ADDED Requirements

### Requirement: Born children SHALL receive deterministically-generated bilingual names
A pure function `generateChildName(childId: string, householdId: string): { nameZh: string; nameEn: string }` MUST be exported from `packages/server/src/data/npcChildNamePool.ts`. The implementation MUST select a name from a curated bilingual pool of at least 20 entries using `hashInt(childId, 'name') % pool.length`. The pool entries MUST follow 潮鳴市 lore conventions (Chinese names two-or-three character tide/sea/island themed; English names ending in evocative roots like `-tide`, `-born`, `-marsh`, `-stone`).

#### Scenario: Same childId yields same name
- **WHEN** `generateChildName('household.alice.bob.child.1', 'household.alice.bob')` is called twice
- **THEN** both calls MUST return identical `{ nameZh, nameEn }` objects

#### Scenario: Different childIds usually yield different names
- **WHEN** `generateChildName` is called with 20 distinct `childId` values selected from a typical world
- **THEN** at least 15 of the returned `nameZh` values MUST be distinct (the pool size is ≥ 20, so collisions are bounded but acceptable)

#### Scenario: Both fields are non-empty
- **WHEN** `generateChildName(anyChildId, anyHouseholdId)` is called
- **THEN** the returned `nameZh` and `nameEn` MUST both be non-empty strings

### Requirement: planHouseholdCommands SHALL use generateChildName for NPC_CHILD_BORN
`planHouseholdCommands` in `runtime.ts` MUST no longer hardcode `nameZh: '潮生'` and `nameEn: 'Tideborn'`. Instead it MUST call `generateChildName(childId, householdId)` and use the returned values in the `NPC_CHILD_BORN` payload.

#### Scenario: Two siblings from different households get different names (when names exist in pool)
- **WHEN** two `NPC_CHILD_BORN` events are emitted for two different households
- **THEN** the two `nameZh` payloads SHOULD usually differ (occasional pool collisions acceptable)

#### Scenario: No NPC_CHILD_BORN event contains the literal string '潮生'
- **GIVEN** a fresh world running for ≥ 90 ticks past the first household formation
- **WHEN** all `NPC_CHILD_BORN` events emitted during that window are inspected
- **THEN** at most a small fraction of them MAY contain `nameZh = '潮生'` (only if the pool happens to include it as one entry); but the value MUST NOT be hardcoded

### Requirement: Name pool SHALL be authored as a static data module
The bilingual name pool MUST live in `packages/server/src/data/npcChildNamePool.ts` as a `readonly` array of `{ nameZh, nameEn }` entries. The file SHALL contain a header comment documenting that adding entries is non-breaking (existing childIds will continue to hash to the same name only if the pool ordering changes — which it MUST NOT for entries that existed before).

#### Scenario: Pool can be safely extended without breaking determinism
- **GIVEN** initial pool of N entries with order `[A, B, C, ...]`
- **WHEN** new entries are appended (`[A, B, C, ..., NEW_X]`) and existing entry order is preserved
- **THEN** all previously-generated names for existing childIds whose hash `% N` resolved to an existing index MUST continue to resolve to the same name post-extension (because `hashInt(id) % (N+k)` may differ — see Risk note in design; if the pool grows beyond a previously-replayed seed, names for fresh childIds drawn after the change may differ. This is documented and acceptable for non-replayed worlds.)

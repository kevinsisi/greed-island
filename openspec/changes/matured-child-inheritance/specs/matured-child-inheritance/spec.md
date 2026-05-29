## ADDED Requirements

### Requirement: NPC_INHERITANCE_GRANTED event SHALL be a first-class command type

The system SHALL define `NPC_INHERITANCE_GRANTED` as a `LivingWorldCommand` type with a validator in `packages/server/src/kernel/livingWorldCommands.ts`. The payload MUST contain:

- `npcId: string` — the matured child receiving the inheritance, non-empty
- `parentNpcIds: readonly string[]` — non-empty, each entry non-empty string
- `householdId: string` — non-empty
- `gold: number` — non-negative integer
- `skillXp: { construction: number; knowledge: number; commerce: number; civic: number }` — each non-negative integer
- `grantedAtTick: number` — non-negative integer
- `narration: string` — non-empty (used by chronicle renderer)

The validator MUST reject payloads that fail any of the above field-level constraints. The validator MUST NOT inspect projection state; cross-event correlation is enforced by the rule engine, not the schema validator.

#### Scenario: Validator accepts well-formed payload

- **GIVEN** a payload `{ npcId: 'npc.child.1', parentNpcIds: ['p1','p2'], householdId: 'hh.1', gold: 12, skillXp: { construction: 1, knowledge: 0, commerce: 2, civic: 0 }, grantedAtTick: 17280, narration: 'inherits from parents' }`
- **WHEN** the validator runs
- **THEN** it MUST return `null` (no error)

#### Scenario: Validator rejects empty parentNpcIds

- **GIVEN** a payload identical to the well-formed payload except `parentNpcIds: []`
- **WHEN** the validator runs
- **THEN** it MUST return a non-null error string

#### Scenario: Validator rejects negative gold

- **GIVEN** a payload identical to the well-formed payload except `gold: -1`
- **WHEN** the validator runs
- **THEN** it MUST return a non-null error string

#### Scenario: Validator rejects non-integer tick

- **GIVEN** a payload identical to the well-formed payload except `grantedAtTick: 17280.5`
- **WHEN** the validator runs
- **THEN** it MUST return a non-null error string

### Requirement: Maturation inheritance planner SHALL compute deterministic seeds from parent civic state

The system SHALL provide a pure function `planMaturationInheritance(input)` in `packages/server/src/sim/maturationInheritancePlanner.ts` with input:

- `maturationIntent: MaturationIntent` (from existing planner)
- `civicRecords: Record<string, NpcCivicRecord>` (from `lifeExpansion.npcCivicRecords`)
- `tick: number`
- `config: { goldFraction: number; skillFraction: number }`

The function MUST return either a single inheritance grant or `null`. It MUST be referentially transparent (same inputs → same output) and MUST NOT mutate `civicRecords`.

The function MUST compute:

```
parentsWithRecord = parentNpcIds whose entry exists in civicRecords
if parentsWithRecord is empty: return null
meanGold = sum(parent.gold for parent in parentsWithRecord) / parentsWithRecord.length
meanSkill[k] = sum(parent.skillXp[k] for parent in parentsWithRecord) / parentsWithRecord.length, for each skill key
grant.gold = floor(meanGold * goldFraction)
grant.skillXp[k] = floor(meanSkill[k] * skillFraction), for each k
```

The grant MUST be returned only if `grant.gold > 0 OR any(grant.skillXp[k] > 0 for k in keys)`. A pure-zero seed is informationally identical to no inheritance and MUST NOT produce an event.

#### Scenario: Two alive parents, both with civic records

- **GIVEN** `parentNpcIds = ['p1','p2']`, `civicRecords = { p1: { gold: 80, skillXp: { construction: 50, knowledge: 30, commerce: 20, civic: 10 } }, p2: { gold: 40, skillXp: { construction: 10, knowledge: 70, commerce: 0, civic: 30 } } }`, `goldFraction = 0.25`, `skillFraction = 0.10`
- **WHEN** planMaturationInheritance runs
- **THEN** it MUST return a grant with `gold = 15` (mean 60 × 0.25 = 15), `skillXp.construction = 3` (mean 30 × 0.10 = 3.0 → floor 3), `skillXp.knowledge = 5` (mean 50 × 0.10 = 5.0), `skillXp.commerce = 1` (mean 10 × 0.10 = 1.0), `skillXp.civic = 2` (mean 20 × 0.10 = 2.0)

#### Scenario: Both parents lack civic records

- **GIVEN** `parentNpcIds = ['p1','p2']`, `civicRecords = {}`
- **WHEN** planMaturationInheritance runs
- **THEN** it MUST return `null`

#### Scenario: One alive parent with record, one deceased parent with last-known record

- **GIVEN** `parentNpcIds = ['alive','dead']`, both have entries in `civicRecords`
- **WHEN** planMaturationInheritance runs
- **THEN** it MUST treat the deceased parent's last-known record identically to the alive parent in the mean

#### Scenario: All means floor to zero

- **GIVEN** `civicRecords = { p1: { gold: 0, skillXp: { all 0 } }, p2: { gold: 0, skillXp: { all 0 } } }`
- **WHEN** planMaturationInheritance runs
- **THEN** it MUST return `null` (suppress empty grant)

### Requirement: Runtime SHALL emit NPC_INHERITANCE_GRANTED in the same tick block as NPC_MATURED

The runtime MUST, for every `MaturationIntent` it converts into an `NPC_MATURED` command, also invoke `planMaturationInheritance` immediately after. If the planner returns a non-null grant, the runtime MUST emit one `NPC_INHERITANCE_GRANTED` command. The `NPC_MATURED` event MUST appear in the EventLog at a sequence number strictly less than its paired `NPC_INHERITANCE_GRANTED` event in the same tick.

#### Scenario: Maturation with eligible parents emits both events ordered

- **GIVEN** a `MaturationIntent` whose parents have non-zero civic records
- **WHEN** the runtime processes that intent at tick `T`
- **THEN** EventLog at tick `T` MUST contain an `NPC_MATURED` event for that npcId AT sequence `S`
- **AND** EventLog at tick `T` MUST contain an `NPC_INHERITANCE_GRANTED` event for the same npcId AT sequence > `S`
- **AND** the `NPC_INHERITANCE_GRANTED.payload.npcId` MUST equal `NPC_MATURED.payload.npcId`

#### Scenario: Maturation with no eligible parents emits only NPC_MATURED

- **GIVEN** a `MaturationIntent` whose parents have no civic records
- **WHEN** the runtime processes that intent at tick `T`
- **THEN** EventLog at tick `T` MUST contain `NPC_MATURED` for that npcId
- **AND** EventLog at tick `T` MUST NOT contain `NPC_INHERITANCE_GRANTED` for that npcId

### Requirement: Rule engine SHALL reject NPC_INHERITANCE_GRANTED without a paired NPC_MATURED at the same tick

The rule engine MUST treat `NPC_INHERITANCE_GRANTED` as invalid unless an `NPC_MATURED` for the same `npcId` exists in the current tick's processing window. Replay of an EventLog whose `NPC_INHERITANCE_GRANTED` events all satisfy this pairing MUST succeed; replay of a corrupted log violating the pairing MUST surface a determinism error.

#### Scenario: Orphan inheritance event fails validation

- **GIVEN** a command `NPC_INHERITANCE_GRANTED` for `npcId = 'x'` at tick `T`
- **AND** no `NPC_MATURED` for `'x'` was emitted in tick `T`
- **WHEN** the rule engine evaluates the command
- **THEN** evaluation MUST fail with a determinism error

### Requirement: Civic record projection SHALL seed from NPC_INHERITANCE_GRANTED

The `lifeExpansion.npcCivicRecords` projection MUST, upon processing an `NPC_INHERITANCE_GRANTED` event, create an `NpcCivicRecord` for `payload.npcId` with:

- `gold = payload.gold`
- `skillXp = payload.skillXp` (full copy of the four-key record)
- `lastProductiveTick = null`

If a civic record already exists for `payload.npcId` (defensive guard against double-grant), the projection MUST throw rather than silently overwrite. Replay MUST produce a deterministic civic record indistinguishable from the original projection.

#### Scenario: Inheritance event seeds a previously-absent civic record

- **GIVEN** `lifeExpansion.npcCivicRecords[npcId]` is undefined
- **WHEN** an `NPC_INHERITANCE_GRANTED` event with `gold = 15, skillXp = { construction: 3, knowledge: 5, commerce: 1, civic: 2 }` is projected
- **THEN** `lifeExpansion.npcCivicRecords[npcId]` MUST equal `{ npcId, gold: 15, skillXp: { construction: 3, knowledge: 5, commerce: 1, civic: 2 }, lastProductiveTick: null }`

#### Scenario: Double-grant throws

- **GIVEN** `lifeExpansion.npcCivicRecords[npcId]` already exists
- **WHEN** a second `NPC_INHERITANCE_GRANTED` event for the same `npcId` is projected
- **THEN** the projection MUST throw

#### Scenario: Boot replay reproduces seeded record

- **GIVEN** an EventLog containing `NPC_CHILD_BORN`, `NPC_MATURED`, and `NPC_INHERITANCE_GRANTED` for `npcId = 'x'`
- **WHEN** the runtime cold-boots and rebuilds projections
- **THEN** `lifeExpansion.npcCivicRecords['x']` after rebuild MUST equal the canonical record state and the rebuilt canonical hash MUST match the live hash

### Requirement: Inheritance constants SHALL be named in config

The constants `INHERITANCE_GOLD_FRACTION` and `INHERITANCE_SKILL_FRACTION` MUST be exported from `packages/server/src/config/world.ts`. Both MUST be numbers in the open interval `(0, 1)`. The planner MUST read them from config and MUST NOT hard-code numeric literals.

#### Scenario: Constants are exported

- **WHEN** any caller imports from `config/world.ts`
- **THEN** `INHERITANCE_GOLD_FRACTION` and `INHERITANCE_SKILL_FRACTION` MUST be accessible as named exports
- **AND** each value MUST satisfy `0 < value < 1`

### Requirement: Admin npc-stats SHALL surface recent inheritance grants

The `/api/admin/npc-stats` response MUST include a top-level `inheritedRecent` field: an array of the 10 most recent `NPC_INHERITANCE_GRANTED` events sorted by `grantedAtTick` descending. Each entry MUST contain `npcId`, `parentNpcIds`, `gold`, `skillXpTotal: number` (sum of the four skill keys), `grantedAtTick`. If fewer than 10 events exist, the array MUST contain all of them.

#### Scenario: Empty world reports empty array

- **GIVEN** no `NPC_INHERITANCE_GRANTED` events in the EventLog
- **WHEN** `/api/admin/npc-stats` is fetched
- **THEN** the response MUST include `inheritedRecent: []`

#### Scenario: Array is bounded and newest-first

- **GIVEN** 15 `NPC_INHERITANCE_GRANTED` events in the EventLog at varying ticks
- **WHEN** `/api/admin/npc-stats` is fetched
- **THEN** `inheritedRecent` MUST contain exactly 10 entries
- **AND** entries MUST be ordered by `grantedAtTick` descending

# born-npc-maturation Specification

## Purpose
TBD - created by archiving change born-npc-becomes-runtime-entity. Update Purpose after archive.
## Requirements
### Requirement: A child SHALL mature after a deterministic tick threshold
A born NPC SHALL transition from "abstract child id in `LifeExpansionState`" to "runtime NPC entity" exactly once, when `currentTick - childBornAtTick ≥ NPC_MATURATION_TICKS`. Constants: `NPC_MATURATION_TICKS = 17_280`, `MATURATION_CADENCE_TICKS = 720`. The maturation planner SHALL run only when `currentTick % MATURATION_CADENCE_TICKS === 0`.

#### Scenario: Child matures at the maturation threshold
- **GIVEN** an `NPC_CHILD_BORN` event committed at tick 100 with `childId = 'household.a.b.child.1'`
- **WHEN** `currentTick = 100 + NPC_MATURATION_TICKS` and `MaturationPlanner.plan()` is called on a cadence tick
- **THEN** `NPC_MATURED` MUST be emitted with `npcId = 'household.a.b.child.1'`, `maturedAtTick = currentTick`, `householdId`, `parentNpcIds`, `homeTileId`, `nameZh`, `nameEn`

#### Scenario: Child does not mature before threshold
- **GIVEN** an `NPC_CHILD_BORN` at tick 100, `NPC_MATURATION_TICKS = 17_280`
- **WHEN** `currentTick = 100 + 5_000`
- **THEN** no `NPC_MATURED` event MUST be emitted for that child

#### Scenario: Planner is cadence-gated
- **GIVEN** a child eligible for maturation
- **WHEN** `currentTick % MATURATION_CADENCE_TICKS !== 0`
- **THEN** `MaturationPlanner.plan()` MUST return `[]` even if the threshold is satisfied

### Requirement: NPC_MATURED event SHALL include the full payload needed for deterministic profile derivation
The `NPC_MATURED` event payload MUST contain `npcId: string`, `maturedAtTick: number`, `householdId: string`, `parentNpcIds: readonly string[]`, `homeTileId: string`, `nameZh: string`, `nameEn: string`, `bornAtTick: number`. `BornNpcsProjection.deriveProfile` SHALL derive personality, role, routine, and defaultLocation purely from these fields plus `hashSeed(npcId, ...)`.

#### Scenario: Profile derivation is deterministic
- **WHEN** `BornNpcsProjection.deriveProfile(payload)` is called twice with identical payloads
- **THEN** both calls MUST return identical `NpcProfile` objects (deep equal)

#### Scenario: Profile derivation uses hashSeed, not Math.random
- **WHEN** `BornNpcsProjection.deriveProfile` runs with `npcId = 'household.alice.bob.child.1'`
- **THEN** the produced profile's `personality.archetype` MUST equal the deterministic result of `archetypePool[hashInt(npcId + ':archetype') % archetypePool.length]`

### Requirement: BornNpcsProjection SHALL provide runtime NpcProfile records for matured children
`BornNpcsProjection` SHALL project `NPC_CHILD_BORN` (record candidate) and `NPC_MATURED` (promote to runtime). It MUST expose `listMaturedProfiles(): readonly NpcProfile[]`, `getProfile(npcId): NpcProfile | null`, `isMatured(npcId): boolean`, and `rebuildFromEvents(events)`.

#### Scenario: Matured profile appears in listing
- **WHEN** `NPC_MATURED` for `'household.a.b.child.1'` is projected
- **THEN** `projection.listMaturedProfiles()` MUST include exactly one profile with id `'household.a.b.child.1'`
- **AND** `projection.isMatured('household.a.b.child.1')` MUST return `true`

#### Scenario: Born-but-not-matured child is not exposed as profile
- **WHEN** only `NPC_CHILD_BORN` (no matching `NPC_MATURED`) is projected
- **THEN** `projection.listMaturedProfiles()` MUST NOT include that child
- **AND** `projection.isMatured(childId)` MUST return `false`

#### Scenario: Boot hydration restores matured roster
- **GIVEN** an EventLog containing `NPC_CHILD_BORN` followed by `NPC_MATURED` for `'household.a.b.child.1'`
- **WHEN** `BornNpcsProjection.rebuildFromEvents(events)` runs
- **THEN** the projection's matured roster MUST contain `'household.a.b.child.1'`

### Requirement: Maturation planner SHALL skip orphaned children
If all `parentNpcIds` of a child are deceased at the maturation check tick (verified against `NpcMortalityProjection`), the planner MUST NOT emit `NPC_MATURED` for that child. The child remains abstract in `LifeExpansionState.childIds`.

#### Scenario: Both parents deceased before maturation
- **GIVEN** `NPC_CHILD_BORN` at tick 100 with `parentNpcIds = ['alice', 'bob']`
- **AND** `NPC_DECEASED` for both `alice` and `bob` committed before `currentTick`
- **WHEN** `MaturationPlanner.plan()` runs at `currentTick = 100 + NPC_MATURATION_TICKS`
- **THEN** no `NPC_MATURED` event MUST be emitted for that child

#### Scenario: At least one parent alive — child matures normally
- **GIVEN** `NPC_CHILD_BORN` at tick 100, `parentNpcIds = ['alice', 'bob']`
- **AND** `NPC_DECEASED` for `alice` only
- **WHEN** `MaturationPlanner.plan()` runs at `currentTick = 100 + NPC_MATURATION_TICKS`
- **THEN** `NPC_MATURED` MUST be emitted

### Requirement: Maturation planner SHALL not double-emit for already-matured children
For each child id, exactly one `NPC_MATURED` event MUST exist in EventLog. The planner SHALL filter against `BornNpcsProjection.isMatured(childId)` before emitting.

#### Scenario: Planner re-run produces no duplicate event
- **GIVEN** `NPC_MATURED` for `'household.a.b.child.1'` already in EventLog
- **WHEN** the maturation planner runs again on a later cadence tick
- **THEN** the planner MUST NOT emit a second `NPC_MATURED` for that child

### Requirement: NpcEngine SHALL accept dynamically-registered NPC profiles
`NpcEngine` MUST expose `registerDynamicNpc(profile: NpcProfile): void` that adds `profile` to its internal registry and initializes `NpcRuntimeState` with `tile = profile.defaultLocation`, `activity = 'idle'`, `mood = 60`, `health = 80`, `lastActedTick = currentTick`. Subsequent calls to `npcEngine.getState(profile.id)` MUST return that state.

#### Scenario: Dynamic NPC has runtime state immediately after registration
- **GIVEN** `npcEngine` constructed with config profiles
- **WHEN** `npcEngine.registerDynamicNpc(profile)` is called with `profile.id = 'household.a.b.child.1'`
- **THEN** `npcEngine.getState('household.a.b.child.1')` MUST return a non-null `NpcRuntimeState`
- **AND** that state's `tile` MUST equal `profile.defaultLocation`

#### Scenario: Re-registration of same id is idempotent
- **WHEN** `registerDynamicNpc(profile)` is called twice with identical `profile.id`
- **THEN** the second call MUST NOT reset existing runtime state for that NPC

### Requirement: SimulationRuntime.getNpcs SHALL include matured born NPCs
`SimulationRuntime.getNpcs()` MUST return one entry per `(configProfile ∪ bornNpcsProjection.listMaturedProfiles())`. Matured born NPCs MUST be filtered out if they appear in `NpcMortalityProjection.deceasedIds` (consistent with existing behavior for config NPCs).

#### Scenario: Matured NPC appears in getNpcs after NPC_MATURED
- **GIVEN** 50 config profiles loaded
- **AND** `NPC_MATURED` committed for one born NPC
- **WHEN** `runtime.getNpcs()` is called
- **THEN** the returned array length MUST be 51
- **AND** the matured NPC MUST be included with its derived `name`, `role`, and `location`

#### Scenario: Deceased matured NPC marked accordingly in snapshot
- **GIVEN** a matured born NPC who subsequently dies (`NPC_DECEASED` committed)
- **WHEN** `runtime.getNpcs()` is called
- **THEN** that NPC's entry MUST have `deceased: true`

### Requirement: NPC_CHILD_BORN and NPC_MATURED SHALL be wired into runtime boot hydration
`BORN_NPC_BOOT_EVENT_TYPES = ['NPC_CHILD_BORN', 'NPC_MATURED']` MUST be added to the selective large-log hydration set. On boot, `BornNpcsProjection.rebuildFromEvents(events)` MUST be called, and for every matured profile, `npcEngine.registerDynamicNpc(profile)` MUST be invoked before the first tick is processed.

#### Scenario: Post-restart roster contains matured born NPCs
- **GIVEN** an EventLog containing 5 `NPC_CHILD_BORN` events and 3 matching `NPC_MATURED` events
- **WHEN** the server restarts and boot hydration completes
- **THEN** `runtime.getNpcs().length` MUST equal `50 + 3` (assuming 50 config profiles, none deceased)

### Requirement: NPC_MATURED events SHALL feed all NPC-keyed projections
When `NPC_MATURED` is committed, the per-event fan-out loop MUST treat the matured NPC id as a first-class NPC for purposes of `BeliefProjection`, `IntentProjection`, `npc_memory`, `npc_relationships`, and any other projection that tracks per-NPC state. The matured NPC MUST be able to receive future `NPC_INTERACT`, `NPC_MOVE`, etc. events without special-casing.

#### Scenario: BeliefProjection accepts matured NPC as subject
- **GIVEN** `NPC_MATURED` committed for `'household.a.b.child.1'`
- **WHEN** a subsequent `FACTION_TILE_SEIZED` event affects the NPC's home tile
- **THEN** `beliefProjection.getBelief('household.a.b.child.1', 'tile_safety', tileId)` MUST be set to a non-zero confidence value


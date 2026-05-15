# simulation-kernel Specification

## Purpose
TBD - created by archiving change add-deterministic-simulation-kernel. Update Purpose after archive.
## Requirements
### Requirement: Command contract separates intent from world state
The system SHALL represent external input as Commands that express actor intent only. Commands MUST NOT be part of WorldState and MUST NOT affect WorldState unless compiled into Events by the Rule Engine.

#### Scenario: Command alone has no world effect
- **WHEN** a Command is submitted but no Event is appended
- **THEN** reducing the EventLog MUST produce the same WorldState as before the Command existed

#### Scenario: Command shape is explicit
- **WHEN** a Command enters the kernel
- **THEN** it MUST include command identity, command type, actor identity, submission metadata, and payload fields needed for validation

### Requirement: Rule Engine compiles commands into rule results
The Rule Engine SHALL be the only kernel component that validates Commands and compiles valid Commands into Events. The Rule Engine MUST return a RuleResult containing either accepted Events or a rejection.

#### Scenario: Valid command returns events
- **WHEN** the Rule Engine receives a valid Command for the current WorldState
- **THEN** it MUST return an accepted RuleResult containing one or more Events

#### Scenario: Invalid command returns rejection
- **WHEN** the Rule Engine receives an invalid Command for the current WorldState
- **THEN** it MUST return a rejected RuleResult containing rejection details and no Events

### Requirement: Rule Engine has no direct state mutation authority
The Rule Engine SHALL be deterministic and MUST NOT directly mutate WorldState, persist WorldState, rely on hidden mutable runtime state, read external IO, or introduce randomness.

#### Scenario: Rule execution is replayable
- **WHEN** the same Command, prior EventLog, ruleset version, and WorldState projection are provided to the Rule Engine
- **THEN** the Rule Engine MUST return an equivalent RuleResult

### Requirement: Event contract represents immutable facts
The system SHALL represent accepted world facts as Events. Events MUST be immutable after append, MUST include deterministic ordering metadata, and MUST carry enough data for reducers to derive WorldState without reading external state.

#### Scenario: Event is appended as fact
- **WHEN** an accepted RuleResult is committed
- **THEN** each resulting Event MUST be appended to the EventLog with a globally ordered sequence

#### Scenario: Event is immutable
- **WHEN** an Event has been appended to the EventLog
- **THEN** the system MUST NOT update or delete that Event as part of normal simulation behavior

### Requirement: EventLog is the only source of truth
The EventLog SHALL be the only source of truth for simulation state. WorldState, UI data, AI snapshots, and future caches MUST be derived from EventLog.

#### Scenario: Projection can be rebuilt
- **WHEN** all derived state is discarded
- **THEN** the system MUST be able to rebuild WorldState by reducing EventLog in sequence order

### Requirement: Event ordering is deterministic
The system SHALL reduce Events by deterministic total order. The first kernel implementation MUST use sequence-first ordering, and reducers MUST NOT depend on wall-clock timestamps for ordering or rule meaning.

#### Scenario: Same ordered events produce same projection
- **WHEN** two environments reduce identical EventLog entries ordered by sequence
- **THEN** both environments MUST produce identical WorldState

#### Scenario: Timestamp is non-authoritative
- **WHEN** an Event includes a timestamp-like audit field
- **THEN** the Reducer MUST NOT use that field to decide event order or rule outcomes

### Requirement: Rejected commands do not affect truth
Rejected Commands SHALL NOT generate Events and SHALL NOT affect WorldState. If rejected commands are stored for auditing, that audit log MUST NOT participate in WorldState reduction.

#### Scenario: Rejection appends no world event
- **WHEN** a Command is rejected by the Rule Engine
- **THEN** the EventLog MUST remain unchanged for that rejection

#### Scenario: Audit log is non-truth
- **WHEN** a rejected Command is recorded in an audit log
- **THEN** rebuilding WorldState from EventLog MUST ignore that audit record

### Requirement: WorldState is a pure projection
WorldState SHALL be derived by a pure Reducer over EventLog. The Reducer MUST depend only on EventLog input and deterministic rules, and MUST NOT perform external IO or produce side effects that affect correctness.

#### Scenario: Reducer is pure
- **WHEN** the Reducer receives the same EventLog input twice
- **THEN** it MUST produce identical WorldState output without depending on runtime environment state

### Requirement: AI is read-only and non-authoritative
AI SHALL operate only on derived event snapshots and MUST output narrative text only. AI MUST NOT generate Events, modify WorldState, or influence Rule Engine decisions.

#### Scenario: AI cannot create world facts
- **WHEN** AI generates narration from an event snapshot
- **THEN** the narration MUST NOT be appended to the simulation EventLog as a world Event

#### Scenario: AI failure does not affect simulation
- **WHEN** AI narration fails or times out
- **THEN** EventLog and WorldState MUST remain unchanged

### Requirement: Kernel supports deterministic replay validation
The system SHALL include replay validation proving that identical EventLog input produces identical WorldState and identical AI snapshot input. Deterministic world-adjacent engines that feed server-authoritative commands, including card-drop generation, MUST also have replay validation proving identical committed facts for identical tick, ruleset, world fact, and store inputs.

#### Scenario: Replay validates projection identity
- **WHEN** a replay test reduces the same EventLog fixture multiple times
- **THEN** each reduction MUST produce the same WorldState hash or equivalent canonical representation

#### Scenario: Replay validates AI input identity
- **WHEN** a replay test creates AI snapshots from the same EventLog fixture multiple times
- **THEN** each AI snapshot input MUST be identical

#### Scenario: Replay validates deterministic card-drop facts
- **WHEN** a replay test runs card-drop generation twice from identical tick, ruleset, weather, rare-window, catalog, tile, and card-store inputs
- **THEN** each run MUST produce equivalent card-drop facts, excluding non-authoritative audit metadata such as wall-clock timestamps and store-local row ids

### Requirement: Core principle is enforced by interfaces
The kernel SHALL enforce the principle that Command is request, Event is fact, WorldState is projection, AI is renderer, and Rule Engine is compiler.

#### Scenario: Forbidden direct world mutation is blocked
- **WHEN** a caller attempts to modify WorldState without appending Events
- **THEN** the kernel API MUST provide no authoritative path for that mutation to become truth

### Requirement: NPC productive actions persist personal civic state

Accepted `NPC_PRODUCTIVE_ACTION` events SHALL update a deterministic NPC civic projection containing personal gold and skill XP.

#### Scenario: Work changes personal state
- **WHEN** an accepted `NPC_PRODUCTIVE_ACTION` with domain `trade`, `service`, `build`, or `learn` is reduced
- **THEN** the target NPC's civic record SHALL be updated in replayable state derived from the EventLog

#### Scenario: Learning accumulates skill XP
- **WHEN** an accepted `NPC_PRODUCTIVE_ACTION` has domain `learn`
- **THEN** the target NPC's `knowledge` XP SHALL increase even if personal gold does not

#### Scenario: Projection is replayable
- **WHEN** the same productive EventLog is reduced twice
- **THEN** the NPC civic records SHALL be identical

### Requirement: NPC skills affect future productive output

NPC skill XP SHALL deterministically increase future productive action delta for the matching domain without reading external state or randomness.

#### Scenario: Matching skill increases delta
- **WHEN** an NPC has accumulated XP for the skill mapped to a productive domain
- **THEN** future productive actions in that domain SHALL use a skill-adjusted delta

#### Scenario: Non-matching skill does not increase delta
- **WHEN** an NPC has commerce XP but performs a learn action
- **THEN** the commerce XP SHALL NOT increase the learn action delta

### Requirement: Runtime layers are formally defined

The architecture documentation SHALL define six runtime layers: Simulation Kernel,
Living World Runtime, Ecosystem Runtime, Civilization Runtime, Combat Runtime,
and Perception Runtime. Each layer MUST declare its authority boundary and MUST
preserve Command → Rule Engine → Event → Projection as the only path for world
state mutation.

#### Scenario: Layer definitions guide review
- **WHEN** a new OpenSpec change modifies world simulation behavior
- **THEN** the change MUST name which runtime layer owns the behavior
- **AND** it MUST explain how state changes cross into other layers through
  committed Events and projections rather than direct mutation

#### Scenario: AI remains perception-only
- **WHEN** a feature uses AI for narration, dialog, or interpretation
- **THEN** the AI output MUST remain in the Perception Runtime
- **AND** it MUST NOT author Commands, mutate WorldState, choose deterministic
  outcomes, or bypass the Rule Engine

### Requirement: Layer dependencies constrain development order

The architecture documentation SHALL record the dependency rules from
`docs/WORLD_CAPABILITIES.md`: budget enforcement precedes simulation growth,
ecosystem foundation precedes goods/logistics/market, combat outcomes feed
civilization/ecosystem/history projections, and player actions are ordinary
Commands without deterministic privilege.

#### Scenario: Goods cannot predate ecosystem substrate
- **GIVEN** a proposed feature adds goods, logistics, production, or market prices
- **WHEN** the ecosystem substrate for the raw goods does not exist
- **THEN** the proposal MUST be rejected or explicitly scoped as placeholder-only
- **AND** it MUST NOT claim honest civilization metabolism

#### Scenario: Combat cannot remain detached
- **GIVEN** a proposed combat feature resolves damage or victory
- **WHEN** the feature claims persistent world consequences
- **THEN** those consequences MUST be represented as committed Events feeding
  civilization, ecosystem, NPC memory, and history projections

### Requirement: Runtime SHALL track per-tick command count and expose it for GM observability

The `SimulationRuntime` MUST maintain a per-tick count of Commands collected during the build phase of `runTick`, expose the latest count plus the peak since boot, and surface both on the world snapshot so dashboards can size load without scraping events.

#### Scenario: World snapshot reports last and peak tick command counts

- **GIVEN** the runtime has run at least one tick that built N Commands
- **WHEN** a caller invokes `runtime.getSnapshot()`
- **THEN** the snapshot MUST include a `tickCommandStats` field
- **AND** `tickCommandStats.lastTick` MUST equal the Command count of the most recent tick
- **AND** `tickCommandStats.peak` MUST equal the maximum Command count observed across all ticks since boot

### Requirement: Runtime SHALL warn when per-tick command count exceeds the soft cap

A configurable soft cap (`MAX_COMMANDS_PER_TICK_SOFT_CAP`) MUST trigger a single `console.warn` per tick that exceeds it, and the cumulative count of such ticks MUST be exposed on the snapshot. The soft cap MUST NOT reject Commands — it is observability only.

#### Scenario: Soft cap breach is counted and logged

- **GIVEN** the soft cap is configured to value C
- **AND** a tick builds (C + 1) Commands
- **WHEN** the runtime advances that tick
- **THEN** the runtime MUST emit exactly one `console.warn` mentioning the count and the cap
- **AND** `tickCommandStats.softCapHitCount` MUST increment by 1
- **AND** every Command in the tick MUST still flow through the Rule Engine normally (no rejection because of the cap)

#### Scenario: Soft cap not breached is silent

- **GIVEN** the soft cap is configured to value C
- **AND** a tick builds (C - 1) Commands
- **WHEN** the runtime advances that tick
- **THEN** the runtime MUST NOT emit a soft-cap warning
- **AND** `tickCommandStats.softCapHitCount` MUST be unchanged

### Requirement: Soft cap value SHALL be exposed alongside the stats so dashboards render the threshold

`tickCommandStats.softCap` MUST be exposed on the snapshot so a GM dashboard can render headroom (e.g. "1234 / 5000") without hard-coding the constant client-side.

#### Scenario: Snapshot exposes the configured cap

- **WHEN** a caller invokes `runtime.getSnapshot()`
- **THEN** `tickCommandStats.softCap` MUST equal the active `MAX_COMMANDS_PER_TICK_SOFT_CAP` value

### Requirement: Runtime SHALL enforce a deterministic per-tick hard cap on command count

When the per-tick command count exceeds `MAX_COMMANDS_PER_TICK_HARD_CAP`, the runtime MUST partition the commands deterministically and reject the overflow. The partition MUST be reproducible: identical EventLog + identical pending Commands + identical hard-cap value MUST yield identical (kept, rejected) sets across replays. The deterministic ordering is by canonical `commandId` (a content hash of `commandType + actorId + actorType + tick + payload`), ascending lexicographic.

#### Scenario: Under-cap tick produces no rejection

- **GIVEN** the runtime has produced K commands in a tick with K ≤ `MAX_COMMANDS_PER_TICK_HARD_CAP`
- **WHEN** the runtime advances that tick
- **THEN** every command MUST flow through the Rule Engine
- **AND** zero entries with `rejectionCode = 'COMMAND_CAP_EXCEEDED'` MUST appear in `rejected_command_log`
- **AND** `tickCommandStats.hardCapRejectedSinceBoot` MUST be unchanged

#### Scenario: Over-cap tick rejects deterministic overflow into the audit log

- **GIVEN** the runtime has produced K commands in a tick with K > `MAX_COMMANDS_PER_TICK_HARD_CAP`
- **WHEN** the runtime advances that tick
- **THEN** exactly `MAX_COMMANDS_PER_TICK_HARD_CAP` commands MUST flow through the Rule Engine
- **AND** the remaining `K - MAX_COMMANDS_PER_TICK_HARD_CAP` commands MUST be written to `rejected_command_log` with `rejectionCode = 'COMMAND_CAP_EXCEEDED'`
- **AND** `tickCommandStats.hardCapRejectedSinceBoot` MUST increment by `K - MAX_COMMANDS_PER_TICK_HARD_CAP`
- **AND** the kept commands MUST be the lexicographically smallest `MAX_COMMANDS_PER_TICK_HARD_CAP` of the input set when sorted by `commandId`

#### Scenario: Rejected commands do NOT affect WorldState

- **GIVEN** the runtime rejected some commands due to hard-cap overflow on tick N
- **WHEN** WorldState(N) is computed by reducing the EventLog up to tick N
- **THEN** WorldState(N) MUST contain no facts derived from any of the rejected commands
- **AND** `rejected_command_log` MUST remain excluded from the reducer (audit-only surface)

### Requirement: Hard cap value SHALL be exposed on the snapshot

`tickCommandStats.hardCap` MUST be exposed on the snapshot so dashboards can render the enforcement ceiling.

#### Scenario: Snapshot exposes the configured hard cap

- **WHEN** a caller invokes `runtime.getSnapshot()`
- **THEN** `tickCommandStats.hardCap` MUST equal the active `MAX_COMMANDS_PER_TICK_HARD_CAP` value
- **AND** `tickCommandStats.hardCapRejectedSinceBoot` MUST be a non-negative integer (cumulative count since boot)

### Requirement: Runtime SHALL deterministically partition NPCs into round-robin active buckets

A configurable `NPC_PARTITION_PERIOD` MUST partition NPCs into K buckets by stable content-hash of NPC id. On tick T the active bucket is `T mod K`. This partition MUST be deterministic across replays (no wall-clock, no Math.random), MUST cover every NPC exactly once per period, and MUST be exposed on the world snapshot for GM observability.

#### Scenario: Every NPC is active exactly once per period

- **GIVEN** the partition period is K
- **AND** the runtime is bootstrapped with N NPC profiles
- **WHEN** the runtime advances K consecutive ticks
- **THEN** each of the N NPCs MUST appear in the "active" set on exactly one tick across the K-tick window

#### Scenario: Partition is identical across replays

- **GIVEN** two independent runtimes A and B with identical NPC profiles
- **WHEN** both advance to the same tick T
- **THEN** `runtimeA.getSnapshot().npcPartition.activeCount` MUST equal `runtimeB.getSnapshot().npcPartition.activeCount`

#### Scenario: Snapshot exposes partition stats

- **WHEN** a caller invokes `runtime.getSnapshot()`
- **THEN** the snapshot MUST include `npcPartition.activeCount`, `npcPartition.totalCount`, and `npcPartition.period`
- **AND** `npcPartition.totalCount` MUST equal the loaded profile count
- **AND** `npcPartition.period` MUST equal the active `NPC_PARTITION_PERIOD` value

### Requirement: Productive and interaction phases SHALL be filtered to the active NPC set

When `activeNpcSet` is provided to `NpcEngine.tick`, Phase 2 productive-action candidates and Phase 3 interaction candidates MUST be restricted to NPCs in the active set, except for a small continuity allow-list: NPCs with `activity='move'`, an active player-dialog hold task, or a non-null `personalityOverride.targetTile` MUST be treated as active regardless of bucket.

#### Scenario: Inactive NPCs do not emit productive actions

- **GIVEN** two otherwise-eligible productive NPCs on the same tile
- **AND** only one of them is in `activeNpcSet`
- **WHEN** `NpcEngine.tick` runs with that active set
- **THEN** only the active NPC MAY be chosen for a Phase 2 productive event

#### Scenario: Interaction requires both participants to survive active filtering

- **GIVEN** two nearby idle NPCs on the same tile
- **AND** only one of them is in `activeNpcSet`
- **WHEN** `NpcEngine.tick` runs with that active set
- **THEN** no Phase 3 interaction event may be emitted for that pair

#### Scenario: Continuity-sensitive NPCs bypass the bucket filter

- **GIVEN** an NPC is not in `activeNpcSet`
- **AND** the NPC either has `activity='move'`, an active player-dialog hold task, or a non-null `personalityOverride.targetTile`
- **WHEN** `NpcEngine.tick` evaluates productive and interaction candidates
- **THEN** the NPC MUST be treated as active for those candidate filters

### Requirement: The runtime SHALL classify tiles as active per tick

The runtime MUST compute an active-tile set at the top of each tick.
A tile MUST be marked active when any current NPC's `lastActedTick`
is within `TILE_ACTIVITY_RECENCY_TICKS` of the current tick, or when
any active world event's `scope.kind === 'region'` includes the tile.
Active world events with `scope.kind === 'world'` MUST NOT alone make
any specific tile active.

#### Scenario: NPC activity within recency window marks the tile active

- **GIVEN** an NPC on `t_forest` whose `lastActedTick = tick - 30`
- **AND** `TILE_ACTIVITY_RECENCY_TICKS = 60`
- **WHEN** the runtime computes its active-tile set this tick
- **THEN** `t_forest` MUST be in the active set

#### Scenario: Region-scoped world event marks every tile in its scope active

- **GIVEN** an active world event with `scope = { kind: 'region', tileIds: ['t_dock', 't_temple'] }`
- **WHEN** the runtime computes its active-tile set
- **THEN** `t_dock` and `t_temple` MUST both be in the active set

### Requirement: Inactive tiles SHALL only run ecology drift on the periodic tick

The runtime MUST gate the unconditional per-tick ecology planners
(predator predation, animal reproduction, animal migration) by tile
activity: when the source tile of a plan is NOT in the active set,
the runtime MUST emit its events only when
`tick % TILE_INACTIVE_DRIFT_PERIOD === 0`. Tick `0` MUST NOT trigger
a drift pass — this prevents mass cold-start on boot. NPC-triggered
ecology (NPC hunting, fishery harvest) is naturally gated by NPC
presence and MUST remain unchanged.

#### Scenario: Inactive tile skips predation between drift ticks

- **GIVEN** the predation planner returns a plan whose `tileId = 't_central'`
- **AND** `t_central` is NOT in the active-tile set
- **AND** `tick = 5` and `TILE_INACTIVE_DRIFT_PERIOD = 10`
- **WHEN** the runtime evaluates the predation step
- **THEN** the runtime MUST NOT append predation events for that plan

#### Scenario: Inactive tile runs on the periodic drift tick

- **GIVEN** the migration planner returns a plan whose `fromTileId = 't_central'`
- **AND** `t_central` is NOT in the active-tile set
- **AND** `tick = 20` and `TILE_INACTIVE_DRIFT_PERIOD = 10`
- **WHEN** the runtime evaluates the migration step
- **THEN** the runtime MUST append the migration events


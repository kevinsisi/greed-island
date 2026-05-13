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


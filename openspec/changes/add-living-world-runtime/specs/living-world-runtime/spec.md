## ADDED Requirements

### Requirement: Tick is simulation time
The runtime SHALL use tick number as the authoritative simulation time. Wall-clock time MAY trigger runtime execution, but MUST NOT determine rule outcomes, actor decisions, event ordering, or replay results.

#### Scenario: Wall-clock latency does not change simulation result
- **WHEN** the same EventLog, ruleset version, world config, pending command set, and tick number are advanced on two servers with different runtime latency
- **THEN** both executions MUST produce identical accepted Events, rejections, and WorldState output

### Requirement: Tick observation uses prior world state only
For tick `t`, every actor SHALL observe only `WorldState(t-1)` when generating commands. Actors MUST NOT observe same-tick commands, same-tick events, or partial tick resolution output.

#### Scenario: NPC cannot react to same-tick NPC action
- **WHEN** NPC A and NPC B both generate commands for tick `t`
- **THEN** NPC B's decision MUST NOT depend on NPC A's same-tick command or same-tick accepted Events

#### Scenario: Player command cannot observe same-tick world event
- **WHEN** a world rule generates a SystemCommand for tick `t`
- **THEN** player commands assigned to tick `t` MUST still be validated from the tick's frozen base observation, not from an actor-visible post-system state

### Requirement: Tick is atomic
Each tick SHALL be resolved atomically. No intermediate state, partial event effects, or in-progress command resolution results may be visible to actors or clients as authoritative WorldState.

#### Scenario: Partial tick is not observable
- **WHEN** tick `t` resolution is in progress
- **THEN** actors and clients MUST NOT observe `WorldState(t)` until tick `t` has committed its final event set

### Requirement: Tick closure produces one committed transition
Each tick SHALL produce a deterministic final event set and a single committed transition from `WorldState(t-1)` to `WorldState(t)`. No tick may be partially resolved as authoritative simulation truth.

#### Scenario: Failed tick does not publish partial truth
- **WHEN** tick `t` fails before commit
- **THEN** no partial tick `t` WorldState MUST become authoritative

### Requirement: All actors produce commands through a uniform path
Players, NPCs, and system world rules SHALL produce Commands. No actor type may bypass the Rule Engine or append Events directly.

#### Scenario: System command has no bypass privilege
- **WHEN** a world rule wants to change weather or spawn a resource
- **THEN** it MUST produce a SystemCommand that passes through the Rule Engine before any Event is appended

#### Scenario: NPC command has no bypass privilege
- **WHEN** an NPC decides to move, trade, fight, or interact
- **THEN** it MUST produce an NPCCommand that passes through the Rule Engine before any Event is appended

### Requirement: Rule Engine remains the only command-to-event compiler
The Rule Engine SHALL be the only valid compiler from Command to Event during tick resolution. Runtime orchestration, NPC policy execution, world-rule evaluation, and AI narration MUST NOT directly create simulation Events.

#### Scenario: Direct event creation is rejected by design
- **WHEN** a runtime component produces output for tick `t`
- **THEN** the output MUST be a Command or read-only view artifact unless it comes from the Rule Engine's accepted RuleResult

### Requirement: NPC state is derived and deterministic
NPC internal state used for decision-making SHALL be derived from EventLog, world config, deterministic rules, and `WorldState(t-1)`. NPC policies MUST NOT depend on hidden mutable runtime memory, external IO, randomness, or same-tick observations.

#### Scenario: NPC replay produces same command
- **WHEN** the same EventLog, world config, ruleset version, NPC identity, and tick number are replayed
- **THEN** the NPC policy MUST produce the same command output or same no-op result

### Requirement: World rules generate deterministic system commands
World rules SHALL evaluate the frozen tick observation and generate deterministic SystemCommands. World rules MUST NOT directly append Events and MUST NOT depend on wall-clock time, random values, external IO, or mutable process state.

#### Scenario: Resource spawn is command-based
- **WHEN** a resource-spawn world rule triggers at tick `t`
- **THEN** it MUST generate a SystemCommand that the Rule Engine can accept or reject deterministically

### Requirement: Pending player command set is stable per tick
The runtime SHALL process a stable set of player commands assigned to tick `t` before tick resolution begins. Player commands that arrive after the tick cutoff MUST be assigned to a later tick.

#### Scenario: Late command is deferred
- **WHEN** a player command arrives while tick `t` is already resolving
- **THEN** that command MUST NOT affect tick `t` and MUST be eligible only for a later tick

### Requirement: Command batch ordering is deterministic
The runtime SHALL construct a deterministic command batch for each tick. The batch order MUST use fixed phase order and deterministic sort keys, not runtime arrival order or process scheduling order.

#### Scenario: Same commands sort identically
- **WHEN** two environments receive the same set of system, NPC, and player commands for tick `t`
- **THEN** both environments MUST build the same command batch order

### Requirement: Batch resolution handles conflicts deterministically
The runtime SHALL resolve command conflicts as a deterministic pure function over `WorldState(t-1)`, ordered command batch, ruleset version, and world config. Any internal conflict ledger MUST NOT be visible as WorldState during the tick.

#### Scenario: Same resource conflict has stable winner
- **WHEN** two same-tick commands attempt to consume the same unique resource
- **THEN** the deterministic batch order and Rule Engine resolution MUST produce the same accepted command and rejected command on replay

### Requirement: AdvanceTick is deterministic
The runtime SHALL expose or test an `AdvanceTick` behavior where identical inputs produce identical next events, rejections, AI snapshot input, and WorldState.

#### Scenario: Advance replay is identical
- **WHEN** `AdvanceTick` receives identical EventLog, pending commands, world config, ruleset version, and tick number
- **THEN** it MUST produce identical accepted Events, rejections, and resulting WorldState

### Requirement: AI snapshot is asynchronous and non-authoritative
AI snapshot generation SHALL occur only after tick commit and SHALL be read-only. AI narration MUST NOT block tick progression, generate Commands, generate Events, mutate WorldState, or influence future Rule Engine decisions.

#### Scenario: AI lag does not block ticks
- **WHEN** AI narration for tick `t` is slow, fails, or times out
- **THEN** tick `t+1` progression MUST NOT depend on that AI output

#### Scenario: AI input is deterministic
- **WHEN** the same committed EventLog and tick number are used to create AI snapshots
- **THEN** the AI snapshot input MUST be identical even if AI narration text later differs

### Requirement: Living world can evolve without players
The runtime SHALL support world evolution without player commands through deterministic world rules and autonomous NPC command generation.

#### Scenario: Empty player input still advances world
- **WHEN** a tick has no player commands
- **THEN** the runtime MUST still evaluate world rules and NPC policies and commit any accepted resulting Events deterministically

### Requirement: Deterministic living-world law is enforced
The runtime SHALL enforce the law that world never waits for players, world never waits for AI, reality is committed events, time is tick sequence, NPCs and world rules generate commands, and Rule Engine is the only compiler from intent to fact.

#### Scenario: Forbidden same-tick causality leak is blocked
- **WHEN** an actor decision attempts to read same-tick partial Events or command results
- **THEN** the runtime MUST provide no authoritative API path for that read to influence command generation

# Spec — simulation-kernel delta (budget enforcement)

Extends the `simulation-kernel` capability with per-tick budget tracking and enforcement.

## ADDED Requirements

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

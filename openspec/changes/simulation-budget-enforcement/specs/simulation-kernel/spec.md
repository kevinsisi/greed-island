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

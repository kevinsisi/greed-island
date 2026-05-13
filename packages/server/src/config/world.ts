// Single source of truth for world-level runtime constants.
// All daily-cadence, retention, and tick-rate logic MUST derive from
// this module — never hard-code any of these numbers elsewhere.
//
// Replay determinism does not depend on TICK_DURATION_MS. It is a
// runtime scheduling parameter; the kernel's notion of time is the
// integer tick number plus the EventLog ordering. Changing
// TICK_DURATION_MS at runtime changes how often ticks happen in
// wall-clock time, not what each tick does.

export const TICK_DURATION_MS = 5_000

export const TICKS_PER_MINUTE = Math.round(60_000 / TICK_DURATION_MS)
export const TICKS_PER_HOUR = TICKS_PER_MINUTE * 60
export const TICKS_PER_DAY = TICKS_PER_HOUR * 24

export const WORLD_TIMEZONE = 'GMT+8'
export const WORLD_TIMEZONE_OFFSET_MINUTES = 8 * 60

export const EVENT_RETENTION_DAYS = 30
export const EVENT_RETENTION_TICKS = EVENT_RETENTION_DAYS * TICKS_PER_DAY

export const NARRATION_RETENTION_DAYS = EVENT_RETENTION_DAYS
export const NARRATION_RETENTION_TICKS = EVENT_RETENTION_TICKS

// Phase 1 budget gate (ARCHITECTURE.md §11.6, WORLD_CAPABILITIES.md §33.1).
//
// Observability-only soft cap. When per-tick command count exceeds this
// threshold, the runtime emits a one-line warning and increments a
// `softCapHitCount` stat — Commands are still processed normally. Later
// slices add a hard cap with deterministic overflow handling.
//
// 5000 is sized for ~10x the current ~50 NPC + autonomous-construction
// load so we get warning headroom before population/ecosystem expansions
// in Phase 1.4 (settlement) and Phase E0 (ecosystem) increase command
// volume.
export const MAX_COMMANDS_PER_TICK_SOFT_CAP = 5000

// Hard cap (slice 2). When per-tick command count exceeds this value, the
// runtime sorts the commands by canonical `commandId` (already a hash of
// commandType + actorId + actorType + tick + payload, so the order is
// deterministic across replays), keeps the first N, and records the
// overflow in `rejected_command_log` with code `COMMAND_CAP_EXCEEDED`.
// Rejected commands never become world Events — `WorldState` is unaffected.
//
// 8000 leaves a 3000-command buffer above the soft cap so transient spikes
// trigger the warning before they hit the wall.
export const MAX_COMMANDS_PER_TICK_HARD_CAP = 8000

export const COMMAND_CAP_REJECTION_CODE = 'COMMAND_CAP_EXCEEDED'

// Phase 1 NPC partitioning (slice 3 of simulation-budget-enforcement,
// WORLD_CAPABILITIES.md §33.1).
//
// Deterministic round-robin bucketing: each NPC belongs to one of K
// buckets by stable hash of its id. On tick T, the active bucket is
// `T % K`. Every NPC is therefore guaranteed an "active" tick exactly
// once every K ticks regardless of player presence or recent activity.
//
// This slice (3a) only computes the partition and exposes it on the
// snapshot — no behavior change yet. Slice 3b wires the active set into
// the NPC engine's per-tick productive + interaction phases to reduce
// per-tick work.
//
// K = 4 → at 50 NPCs each tick activates ~12-13 NPCs, every NPC active
// once per 4 ticks (~20 seconds at 5s/tick).
export const NPC_PARTITION_PERIOD = 4

// Phase 1 §33.4 — Settlement formation thresholds (Layer 3 Civilization
// Runtime). A tile with at least MIN_NPCS outdoor non-moving NPCs for
// at least MIN_TICKS consecutive ticks emits SETTLEMENT_FORMED. Tuned
// so casual cross-district co-presence does NOT form settlements;
// sustained gathering (e.g. central plaza routines) does.
//
// 12 ticks ≈ 60 seconds of wall clock at 5s/tick — roughly one
// in-world minute. Adjust as observation suggests.
export const SETTLEMENT_FORMATION_MIN_NPCS = 3
export const SETTLEMENT_FORMATION_MIN_TICKS = 12

// Phase E0.2 — Wildlife spawning (Layer 2.5 Ecosystem Runtime).
// The wildlife planner evaluates on a fixed cadence and only one active
// eligible tile per cadence tick, so ecosystem growth stays bounded under
// the Phase 1 per-tick command budget.
export const ECOSYSTEM_SPAWN_CADENCE_TICKS = TICKS_PER_MINUTE
export const ECOSYSTEM_MAX_SPAWNS_PER_ACTIVE_TILE = 1

// Animal positions are deterministic sub-tile coordinates derived from
// hashSeed(speciesId, tileId, tick). Keep these named so rendering scale can
// change later without hiding magic numbers inside the spawn policy.
export const ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS = 16
export const ECOSYSTEM_ANIMAL_SUBGRID_ROWS = 16
export const ECOSYSTEM_TILE_CARRYING_CAPACITY_DIVISOR = 12

// Phase E0.3 — simple hunting. Hunter-role NPCs only hunt when their food
// pressure is genuinely elevated, so hunting is not a generic patrol flavor.
export const ECOSYSTEM_HUNT_FOOD_NEED_THRESHOLD = 60
export const ECOSYSTEM_MEAT_GOLD_VALUE = 2

export type WorldConfig = Readonly<{
  tickDurationMs: number
  ticksPerDay: number
  timezone: string
  timezoneOffsetMinutes: number
  eventRetentionTicks: number
  narrationRetentionTicks: number
}>

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  tickDurationMs: TICK_DURATION_MS,
  ticksPerDay: TICKS_PER_DAY,
  timezone: WORLD_TIMEZONE,
  timezoneOffsetMinutes: WORLD_TIMEZONE_OFFSET_MINUTES,
  eventRetentionTicks: EVENT_RETENTION_TICKS,
  narrationRetentionTicks: NARRATION_RETENTION_TICKS,
}

export function isWithinRetention(
  eventTick: number,
  currentTick: number,
  config: WorldConfig = DEFAULT_WORLD_CONFIG
): boolean {
  return currentTick - eventTick <= config.eventRetentionTicks
}

export function retentionCutoffTick(
  currentTick: number,
  config: WorldConfig = DEFAULT_WORLD_CONFIG
): number {
  return Math.max(0, currentTick - config.eventRetentionTicks)
}

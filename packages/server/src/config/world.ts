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

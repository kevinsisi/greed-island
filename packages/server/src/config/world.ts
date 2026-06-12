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
export const ECOSYSTEM_MAX_SPAWNS_PER_ACTIVE_TILE = 2

// Animal positions are deterministic sub-tile coordinates derived from
// hashSeed(speciesId, tileId, tick). Keep these named so rendering scale can
// change later without hiding magic numbers inside the spawn policy.
export const ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS = 16
export const ECOSYSTEM_ANIMAL_SUBGRID_ROWS = 16
export const ECOSYSTEM_TILE_CARRYING_CAPACITY_DIVISOR = 12

// Phase E1.2 — local reproduction. Reproduction runs on its own cadence so
// population recovery is bounded separately from biome spawning.
export const ECOSYSTEM_REPRODUCTION_CADENCE_TICKS = TICKS_PER_MINUTE

// Phase E1.3 — animal migration. Pressure migration triggers when a tile's
// population for a species exceeds this fraction of carrying capacity.
export const ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD = 0.8

// Phase E1.4 — predator mortality. A predator that has gone this many
// consecutive cadence ticks without a successful kill on its tile starves.
export const PREDATOR_STARVATION_THRESHOLD_TICKS = 20 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS

// Sprint 2C — NPC defense coordination. Recently-committed
// ANIMAL_ATTACKED_NPC events within this window trigger a defense
// party check. Reset on each tick.
export const DEFENSE_REACTION_WINDOW_TICKS = 2
export const DEFENSE_PARTY_MIN_MEMBERS = 2

// Slice 4 — Regional tile activation. A tile is considered "active"
// when (a) any NPC has acted on it within `TILE_ACTIVITY_RECENCY_TICKS`
// ticks, or (b) any active world event has the tile in its scope.
// Inactive tiles run ecology drift only every
// `TILE_INACTIVE_DRIFT_PERIOD` ticks instead of every tick — bounding
// per-tick predator / reproduction / fishery work on empty regions.
export const TILE_ACTIVITY_RECENCY_TICKS = 60
export const TILE_INACTIVE_DRIFT_PERIOD = 10

// Phase E2 — ecosystem pressure, collapse, and recovery.
// Species extinction: once total population = 0 for this many cadence ticks, SPECIES_EXTINCT fires.
export const SPECIES_EXTINCT_GRACE_TICKS = 3 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
// Pressure planner: emit ECOSYSTEM_PRESSURE_RAISED when NPC work-actions on high-pressure
// buildings in one cadence window reach this count.
export const ECOSYSTEM_PRESSURE_WORK_THRESHOLD = 5
// Recovery: if no high-pressure actions occur for this many ticks, emit RECOVERED.
export const ECOSYSTEM_PRESSURE_RECOVERY_TICKS = 2 * TICKS_PER_MINUTE
// Fishery passive regeneration: density points per reproduction cadence tick.
export const FISHERY_RECOVERY_RATE = 5
// Hysteresis buffer above FISHERY_COLLAPSE_THRESHOLD before FISHERY_RECOVERED fires.
export const FISHERY_RECOVERY_BUFFER = 10

// Phase E3 — Domestication.
// Minimum wild population on the same tile before a settlement can domesticate.
export const DOMESTICATION_MIN_WILD_POP = 5
// Ranch building default livestock capacity.
export const RANCH_DEFAULT_CAPACITY = 8
// Cadence for domestication + breeding + slaughter planners.
export const DOMESTICATION_CADENCE_TICKS = 4 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
// Cadence for breeding planner (must be ≥ DOMESTICATION_CADENCE_TICKS).
export const BREEDING_CADENCE_TICKS = 6 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
// Mount speed multiplier applied to NPC travel tick calculations.
export const MOUNT_SPEED_MULTIPLIER = 1.5

// Phase E4 — Mythic Ecology.
// Legendary spawn runs every LEGENDARY_SPAWN_CADENCE_TICKS (10× reproduction cadence).
export const LEGENDARY_SPAWN_CADENCE_TICKS = 10 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
// 0.5% probability: hash(tick + speciesId) % 1000 < 5 passes.
export const LEGENDARY_SPAWN_PROBABILITY = 5
// Legendary spawn is blocked when tile pressure exceeds this level.
export const LEGENDARY_MAX_PRESSURE = 50
// Minimum prey population on the target tile before legendary spawn is allowed.
export const LEGENDARY_SPAWN_MIN_PREY = 10
// Severity subtracted from areaSafety for tiles with an active legendary world event.
export const LEGENDARY_WORLD_EVENT_SEVERITY = 30
// Hunt arc: minimum hunter-role NPCs on the tile to start the hunt arc counter.
export const LEGENDARY_HUNT_MIN_HUNTERS = 3
// Hunt arc: consecutive ticks with ≥ MIN_HUNTERS required to emit LEGENDARY_HUNT_STARTED.
export const LEGENDARY_HUNT_THRESHOLD_TICKS = 5 * TICKS_PER_MINUTE
// Faction ecology planner cadence (8× reproduction cadence).
export const FACTION_ECOLOGY_CADENCE_TICKS = 8 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
// Ecosystem pressure threshold above which guild faction emits FOREST_CLEARCUT_ORDERED.
export const GUILD_CLEARCUT_PRESSURE_THRESHOLD = 60
// Fishery density threshold below which tide_hunters faction emits FISHING_QUOTA_ENFORCED.
export const TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD = 20
// Settlement livestock count threshold above which free_runners faction emits INDUSTRIAL_SITE_SABOTAGED.
export const FREE_RUNNERS_LIVESTOCK_THRESHOLD = 12

// Combat Phase C Slice 1 — sub-tick loop default rate. The runtime
// spawns a setInterval per active combat at this rate. Range 5–20 Hz
// (50 ms – 200 ms); default 10 Hz (100 ms). Configurable so future
// load tests can dial it without re-deploying.
export const COMBAT_TICK_RATE_MS = 100
export const COMBAT_TICK_RATE_MIN_MS = 50  // 20 Hz
export const COMBAT_TICK_RATE_MAX_MS = 200 // 5 Hz

export function validateCombatTickRateMs(ms: number): boolean {
  if (!Number.isFinite(ms)) return false
  if (!Number.isInteger(ms)) return false
  return ms >= COMBAT_TICK_RATE_MIN_MS && ms <= COMBAT_TICK_RATE_MAX_MS
}

// Phase 3 §37.3 — NPC culture & emergent festivals.
export const CULTURAL_FESTIVAL_THRESHOLD = 3
export const CULTURAL_NORM_NPC_THRESHOLD = 3
export const RITUAL_FACTION_LEANS = ['monastic', 'temple'] as const
export type RitualFactionLean = (typeof RITUAL_FACTION_LEANS)[number]

// Phase 3 §37.4 — household shared economy. This is an accounting
// contribution layered on top of individual civic gold in the first slice.
export const HOUSEHOLD_GOLD_CONTRIBUTION_RATE = 0.25

// Phase 3 §37.2 — NPC skill learning & mentorship.
export const SKILL_IDS = ['hunting', 'fishing', 'construction'] as const
export type SkillId = (typeof SKILL_IDS)[number]
export const SKILL_XP_PER_OBSERVE = 5
export const SKILL_XP_PER_MENTOR_TICK = 8
export const SKILL_XP_LEVEL_THRESHOLD = 100

// Phase 3 Slice 1 — NPC rumor propagation.
// Accuracy is an integer 0–100. Each NPC-to-NPC spread step multiplies
// by this factor (integer math: Math.round(acc * DECAY / 100)).
export const RUMOR_ACCURACY_DECAY = 85
// Rumors at or below this accuracy are considered expired / ineligible.
export const RUMOR_ACCURACY_THRESHOLD = 10
// Maximum active rumors per NPC; oldest by heardAtTick is evicted on overflow.
export const RUMOR_MAX_PER_NPC = 5

// Phase E0.3 — simple hunting. Hunter-role NPCs only hunt when their food
// pressure is genuinely elevated, so hunting is not a generic patrol flavor.
export const ECOSYSTEM_HUNT_FOOD_NEED_THRESHOLD = 60
export const ECOSYSTEM_MEAT_GOLD_VALUE = 2

// Phase E0.4 — tile-level fishery density.
export const FISHERY_DEFAULT_DENSITY = 100
export const FISHERY_HARVEST_DELTA = 12
export const FISHERY_COLLAPSE_THRESHOLD = 20

// settlement-runtime-v2 Slice 2 — settlement pressure planner. These values
// are deliberately simple and bounded; the pure planner turns projection rows
// into Command intents, while Events remain the only state authority.
export const SETTLEMENT_FOOD_GOODS = ['fish', 'meat'] as const
export const SETTLEMENT_FOOD_UNITS_PER_NPC = 2
export const SETTLEMENT_FOOD_SHORTAGE_MAX_PRESSURE = 85
export const SETTLEMENT_FISHERY_COLLAPSE_PRESSURE = 30
export const SETTLEMENT_FISHERY_LOW_DENSITY_MAX_PRESSURE = 20
export const SETTLEMENT_MARKET_SCARCITY_MAX_PRESSURE = 45
export const SETTLEMENT_SAFETY_PREDATOR_PRESSURE_PER_ANIMAL = 12
export const SETTLEMENT_SAFETY_AGGRESSION_WEIGHT = 0.4
export const SETTLEMENT_ECONOMY_HOUSEHOLD_TARGET_GOLD_PER_NPC = 5
export const SETTLEMENT_ECONOMY_HOUSEHOLD_MAX_PRESSURE = 45
export const SETTLEMENT_LOGISTICS_LOST_TRANSPORT_PRESSURE = 35
export const SETTLEMENT_LOGISTICS_CLOSED_ROUTE_PRESSURE = 20
export const SETTLEMENT_LOGISTICS_MISSING_FOOD_ROUTE_PRESSURE = 25
export const SETTLEMENT_LOGISTICS_RECENT_LOSS_WINDOW_TICKS = TICKS_PER_HOUR
export const SETTLEMENT_STABILITY_STRAINED_BELOW = 75
export const SETTLEMENT_STABILITY_DECLINING_BELOW = 40
// Goods Primitives (v0.34.0) — periodic food consumption from settlement storage
export const SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS = TICKS_PER_HOUR

// NPC Mortality & Lineage (v0.32.0)
// Base lifespan: 1 real week (7 × 17,280 ticks). Variance: ±3.5 days.
// All existing NPCs default to bornAtTick=0; at tick ~25,000 they are
// ~21% through their lifespan — no mass die-off on first deploy.
export const NPC_BASE_LIFESPAN_TICKS = 120_960
export const NPC_LIFESPAN_VARIANCE_TICKS = 60_480
export const MORTALITY_CADENCE_TICKS = TICKS_PER_HOUR

// Born NPC Maturation (v0.86.0)
// A child becomes a full runtime NPC entity after `NPC_MATURATION_TICKS` ticks
// since the NPC_CHILD_BORN event. At 17,280 ticks = 1 in-game day = ~1 real day
// of continuous server uptime. Cadence is one in-game hour, aligning with
// MORTALITY_CADENCE_TICKS.
export const NPC_MATURATION_TICKS = TICKS_PER_DAY
export const MATURATION_CADENCE_TICKS = TICKS_PER_HOUR

// NPC life goals — cadence for NPC_LIFE_GOAL_SET emission（top-8 壓力 NPC）。
export const LIFE_GOAL_CADENCE_TICKS = 30

// NPC AI agent（v0.89.0）— 每個 NPC 以此節奏輪到一次 AI 自主決策
// （由 npcId hash 錯相），AI 只能在 server 算好的合法 intent 選項中選擇。
// TICKS_PER_HOUR=720 → 每 NPC 約每小時（牆鐘）一次、52 NPC ≈ 每 70 秒一次呼叫。
export const NPC_AGENT_DECISION_INTERVAL_TICKS = TICKS_PER_HOUR
// AI 自述 utterance 上限長度（防 prompt 失控輸出灌爆 ticker）。
export const NPC_AGENT_UTTERANCE_MAX_CHARS = 60

// Matured-child inheritance (v0.88.0)
// 成年的孩子以父母 civic 紀錄的平均值乘上比例做為起步 seed（不是轉移，
// 父母不會扣 — 這模擬「從父母身上學到的東西」）。調參背景見
// openspec/changes/matured-child-inheritance/design.md Decision 3/4。
export const INHERITANCE_GOLD_FRACTION = 0.25
export const INHERITANCE_SKILL_FRACTION = 0.10

// Household reproduction (v0.87.0)
// Households can produce multiple children, gated by `MIN_BIRTH_INTERVAL_TICKS`
// after the most recent birth (or household formation if no children yet) and
// capped at `MAX_CHILDREN_PER_HOUSEHOLD`. Prior to v0.87.0 each household was
// hard-capped at one child via `if (childIds.length > 0) continue`.
export const MIN_BIRTH_INTERVAL_TICKS = TICKS_PER_DAY  // ~24 in-game hours between births
export const MAX_CHILDREN_PER_HOUSEHOLD = 4

// NPC Household Migration (v0.74.0)
export const HOUSEHOLD_MIGRATION_CADENCE_TICKS = TICKS_PER_DAY * 2

// Road Network (v0.75.0)
export const ROAD_CONSTRUCTION_CADENCE_TICKS = TICKS_PER_DAY * 3
export const ROAD_TRAVEL_SPEED_MULTIPLIER = 1.5  // roads reduce cross-tile travel to ceil(baseTicks/multiplier)
export const MIGRATION_PUSH_SAFETY_THRESHOLD = 20   // home tile safety must be below this
export const MIGRATION_PULL_SAFETY_MIN = 50          // target tile safety must be above this
export const MIGRATION_MAX_PER_CADENCE = 1           // at most one NPC migrates per cadence tick
export const NPC_LONG_INCAP_TICKS = TICKS_PER_DAY * 3  // combat defeat → 3 days of incapacitation
export const NPC_LOCAL_TRADE_CADENCE_TICKS = TICKS_PER_HOUR * 4  // local NPC-to-NPC market trade cadence
export const WALL_CONSTRUCTION_CADENCE_TICKS = TICKS_PER_DAY * 5  // wall auto-builds on contested borders
export const HOUSEHOLD_JOINT_DECISION_CADENCE_TICKS = TICKS_PER_DAY * 3  // household joint decision sweep
export const HOUSEHOLD_JOINT_DECISION_GOLD_THRESHOLD = 100  // min household balance to trigger invest decision
// Building Upgrade & Capture (v0.83.0)
export const BUILDING_UPGRADE_CADENCE_TICKS = TICKS_PER_DAY * 7        // weekly upgrade sweep
export const BUILDING_UPGRADE_MIN_AGE_TICKS = TICKS_PER_DAY * 14       // must be operational 14 days
export const BUILDING_MAX_UPGRADE_LEVEL = 3
export const BUILDING_CAPTURE_CADENCE_TICKS = TICKS_PER_DAY * 2        // faction capture check every 2 days
// Dynamic Tile Generation (v0.84.0)
export const TILE_GENERATION_CADENCE_TICKS = TICKS_PER_DAY * 30       // monthly frontier expansion check
export const TILE_GENERATION_MIN_TRADE_ROUTES = 2                      // min open trade routes before expansion
export const TILE_GENERATION_MAX_WORLD_TILES = 12                      // cap total tiles (core + expansion + generated)

// NPC Intention Layer (v0.51.0)
export const INTENT_RECOMPUTE_INTERVAL = TICKS_PER_HOUR * 2
export const INTENT_OVERRIDE_DURATION_TICKS = TICKS_PER_HOUR * 6
export const INTENT_URGENCY_THRESHOLD = 30
export const REFLECTION_DURATION_TICKS = TICKS_PER_DAY * 30
export const MAX_REFLECTIONS_PER_NPC = 20
export const MAX_REFLECTION_CONTEXT_BULLETS = 5

export const MEMORY_DIALOG_MAX_BULLETS = 5
// Decay thresholds: memories older than these tick counts are excluded from dialog context.
// importance >= 9 (permanent) never expires.
export const MEMORY_VERY_HIGH_DECAY_TICKS = 30 * TICKS_PER_DAY  // importance 7–8
export const MEMORY_HIGH_DECAY_TICKS = 7 * TICKS_PER_DAY         // importance 5–6
export const MEMORY_NORMAL_DECAY_TICKS = 2 * TICKS_PER_DAY       // importance 1–4

// v0.54.0 — Memory Urgency Boost. Fear/grief memories amplify NPC survival intent.
// PERMANENT applies when importance >= 9 (never decays).
// HIGH applies when importance 7–8 and within MEMORY_VERY_HIGH_DECAY_TICKS.
export const MEMORY_URGENCY_BOOST_PERMANENT = 1.0
export const MEMORY_URGENCY_BOOST_HIGH = 0.5

// v0.55.0 — Forest Depletion (Phase E2.2). Forest tiles emit FOREST_DEPLETED when
// ecosystem pressure reaches this level (pressureLevel steps of 20, so 60 = 3 raises).
// Recovery: emit FOREST_RECOVERED when pressure returns to 0.
export const FOREST_DEPLETION_PRESSURE_THRESHOLD = 60

// v0.59.0 — Species Population Shift. A SPECIES_POPULATION_SHIFTED event fires when a
// species' global count drops by at least this fraction from the last reported total.
// 0.25 = 25% decline triggers a shift event (provides NPC dialog grounding).
export const POPULATION_SHIFT_MIN_PERCENT = 0.25

// v0.60.0 — Pollution Threshold. POLLUTION_INCREASED fires when a tile's ecosystem
// pressureLevel first reaches or exceeds this value (steps of 20, so 40 = 2nd raise).
// POLLUTION_RECOVERED fires when pressure drops back below it.
export const POLLUTION_THRESHOLD = 40

/** Deterministic per-NPC lifespan using FNV-1a hash of npcId. Replay-safe. */
export function npcLifespanTicks(npcId: string): number {
  let h = 2166136261
  for (let i = 0; i < npcId.length; i++) {
    h ^= npcId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return NPC_BASE_LIFESPAN_TICKS + ((h >>> 0) % NPC_LIFESPAN_VARIANCE_TICKS)
}

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

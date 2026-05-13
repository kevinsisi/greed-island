// Simulation runtime — drives a 5-second tick loop on top of the
// append-only kernel event log. Every tick the runtime:
//   1. Increments world.tick
//   2. Hands off to NpcEngine for per-NPC decisioning (move tile-by-tile,
//      activity transitions, mood/health drift, NPC↔NPC interaction)
//   3. On a fixed cadence, rotates weather / season and toggles the
//      tide_festival rare window
//   4. Spawns / expires WorldEventEngine entries
//
// Transitional domains still persist some FACT_SET snapshots for restart
// hydration, but NPC state now also has a typed projection path
// (`NPC_STATE_RECORDED` -> `NpcStateProjection`). The runtime also keeps
// in-memory projections so HTTP reads don't have to re-reduce the entire
// event log on every request.

import {
  DEFAULT_RULESET_VERSION,
  KERNEL_EVENT_VERSION,
  type Event,
  type EventDraft,
  type FactSetPayload
} from '../kernel/types.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import {
  COMMAND_SET_FACT,
  EVENT_FACT_SET,
  KernelRuleEngine
} from '../kernel/ruleEngine.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { createInitialWorldState } from '../kernel/reducer.js'
import type { Command } from '../kernel/types.js'
import {
  LivingWorldRuleEngine,
  isLivingWorldCommandType,
  makeLivingWorldCommand,
  type ConstructionMotivation,
  type EventMotivation,
  type GoodsHolderType,
  type LivingWorldCommand,
  type LivingWorldEventPayload
} from '../kernel/livingWorldCommands.js'
import type { SqliteNpcMemoryStore } from '../kernel/npcMemory.js'
import type { SqliteNpcRelationshipsStore } from '../kernel/npcRelationships.js'
import {
  TICK_DURATION_MS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  WORLD_TIMEZONE,
  WORLD_TIMEZONE_OFFSET_MINUTES,
  MAX_COMMANDS_PER_TICK_SOFT_CAP,
  MAX_COMMANDS_PER_TICK_HARD_CAP,
  COMMAND_CAP_REJECTION_CODE,
  NPC_PARTITION_PERIOD
} from '../config/world.js'
import { applyCommandHardCap } from './commandBudget.js'
import { partitionNpcsForTick } from './npcPartition.js'
import {
  detectSettlementFormation,
  type CopresenceHistoryRow,
  type DetectedSettlementFormation,
} from './settlementDetection.js'
import { SettlementsProjection, type SettlementRow } from '../projections/settlements.js'
import type { NpcProfile } from '../npcs/types.js'
import { derivePersonalityGreetLine } from '../npcs/greetLine.js'
import type { CardCatalog } from '../cards/types.js'
import { WorldEventEngine, rebuildActiveEvent } from '../events/engine.js'
import type { ActiveWorldEvent } from '../events/types.js'
import { MAP_TILES, TILE_BY_ID, TILE_NAME_BY_ID, listMapTiles } from './mapGraph.js'
import { planAnimalSpawns } from '../ecosystem/animalSpawning.js'
import { planFisheryHarvest } from '../ecosystem/fishery.js'
import { planSimpleHunt } from '../ecosystem/hunting.js'
import { requireSpecies } from '../ecosystem/species.js'
import { discoverMarketPrices } from '../goods/marketPricing.js'
import { planGoodsProduction } from '../goods/productionChains.js'
import {
  NpcEngine,
  NPC_PLAYER_DIALOG_HOLD_TICKS,
  type NpcActivity,
  type NpcStateChange,
  type NpcRuntimeState
} from './npcEngine.js'
import { deriveNpcIntentLine, type NpcIntentLine } from './npcIntent.js'
import {
  AreaStateEngine,
  type AreaState,
  type FactionId,
  FACTIONS
} from './areaStateEngine.js'
import { BuildingRuntime } from '../buildings/buildingRuntime.js'
import type { BuildingDef, BuildingRuntimeView } from '../buildings/types.js'
import { completedConstructionBuildingDef, completedConstructionBuildingView } from '../buildings/dynamicConstruction.js'
import { findBuildingById, listAllBuildings, listBuildingsForTile } from '../buildings/catalog.js'
import { AmbientNarrator, type AmbientContext } from './ambientNarrator.js'
import type { SettingsStore } from '../http/settings.js'
import {
  LIFE_EXPANSION_FACT_KEY,
  CIV_EVO_MAX_AUTONOMOUS_BUILDINGS_PER_TILE,
  SALT_MARSH_BUILDING_ID,
  SALT_MARSH_PROJECT_ID,
  SALT_MARSH_PROJECT_TARGET,
  SALT_MARSH_TILE_ID,
  createInitialLifeExpansionState,
  deriveNpcLifeView,
  decideCivEvoConstructionInitiate,
  hydrateLifeExpansionState,
  householdIdForNpc,
  productiveDeltaWithNpcSkill,
  withMeatHarvestedRecorded,
  withChildBorn,
  withConstructionInitiated,
  withConstructionProgress,
  withHouseholdFormed,
  withNpcProductiveActionRecorded,
  withUnlockedExpansion,
  type LifeExpansionState,
  type NpcCivicRecord,
  type NpcLifeView
} from './cityLife.js'
import { ConstructionProjectsProjection, visibleAutonomousConstructionProjects, type ConstructionProjectRow } from '../projections/constructionProjects.js'
import { NpcStateProjection } from '../projections/npcState.js'
import { AnimalPopulationProjection, type AnimalPopulationRow } from '../projections/animalPopulation.js'
import { FisheryDensityProjection, type FisheryDensityRow } from '../projections/fisheryDensity.js'
import { GoodsInventoryProjection, type GoodsInventoryRow } from '../projections/goodsInventory.js'
import { LogisticsProjection, type LogisticsSnapshot } from '../projections/logistics.js'
import { MarketPricesProjection, type MarketPriceRow } from '../projections/marketPrices.js'
import { ProductionChainsProjection, type ProductionChainsSnapshot } from '../projections/productionChains.js'
import { deriveWorldAgendaDirective, roleInterpretationZh, type WorldAgendaDirective } from './worldAgenda.js'

const SIM_ACTOR_WORLD = 'system'
const NARRATIVE_KEY_PREFIX = 'narrative.'
const FACT_TICK = 'world.tick'
const FACT_WEATHER = 'world.weather'
const FACT_SEASON = 'world.season'
const FACT_RARE_WINDOW = 'world.rareWindow.tide_festival'
const FACT_ACTIVE_EVENTS = 'world.activeEvents'
const NPC_STATE_PREFIX = 'npc.state.'
const AREA_STATE_PREFIX = 'area.state.'
const FACT_BUILDING_OCCUPANTS = 'world.buildingOccupants'
const CENTRAL_SETTLEMENT_HOLDER_ID = 'settlement.t_central'

const WEATHERS = ['晴', '陰', '霧雨', '驟雨', '微風'] as const
const SEASONS = ['霜之月', '雨之月', '潮之月', '熾之月'] as const

const WEATHER_CADENCE_TICKS = TICKS_PER_MINUTE
const SEASON_CADENCE_TICKS = TICKS_PER_HOUR
const RARE_WINDOW_PERIOD_TICKS = TICKS_PER_MINUTE * 10
const RARE_WINDOW_OPEN_TICKS = TICKS_PER_MINUTE * 4
const BOOT_PROJECTION_REBUILD_EVENT_LIMIT = 20_000

export type NarrativeEventPayload = Readonly<{
  eventType: string
  actorId: string
  payload: Record<string, unknown>
  narration: string | null
}>

export type SimNpcState = Readonly<{
  id: string
  name: { zh: string; en: string }
  role: { zh: string; en: string }
  location: string
  relationshipScore: number
  lastActedTick: number
  internalState: Record<string, unknown>
  activity: NpcActivity
  mood: number
  health: number
  faction: string
  targetTile: string
  /** Area canvas 子格欄座標（後端權威）— 前端只負責畫 */
  subCol: number
  /** Area canvas 子格列座標（後端權威） */
  subRow: number
  /** 高度 / 樓層座標；目前預設 0，未來支援高低差互動。 */
  subZ: number
  /** NPC 目前所在建築；null 表示在區域室外。 */
  buildingId: string | null
  /** NPC 正在跨區移動時的 worldline segment；非移動時為 null。 */
  travelRoute: {
    fromTile: string
    toTile: string
    targetTile: string
    startedAtTick: number
  } | null
  /** 24-bit 整數色（0xRRGGBB），前端用做 sprite 主色 */
  color: number
  /** 玩家剛打開對話框、還沒輸入時顯示的 placeholder line。
   *  根據 personality 派生（純函式），同一 NPC 永遠回同一句。 */
  greetLine: { zh: string; en: string }
  /** Deterministic public summary of the NPC's current task/intent. */
  intentLine: NpcIntentLine
  /** Deterministic life pressure and current long-term goal. */
  life: NpcLifeView
  /** Deterministic personal economic and skill state derived from productive actions. */
  civic: NpcCivicRecord | null
}>

export type TickCommandStats = Readonly<{
  /** Command count from the most recent completed tick (post-rejection). */
  lastTick: number
  /** Peak command count observed since boot (pre-rejection count). */
  peak: number
  /** Active soft-cap threshold (warning, not enforcement). */
  softCap: number
  /** Number of ticks since boot whose command count exceeded the soft cap. */
  softCapHitCount: number
  /** Active hard-cap threshold (deterministic overflow rejection). */
  hardCap: number
  /** Total commands rejected since boot due to hard-cap overflow. */
  hardCapRejectedSinceBoot: number
}>

export type NpcPartitionStats = Readonly<{
  /** Number of NPCs in the "active" bucket for the most recent tick. */
  activeCount: number
  /** Total NPC count considered. */
  totalCount: number
  /** Bucketing period (every `period` ticks each NPC is active once). */
  period: number
}>

export type WorldSnapshot = Readonly<{
  tick: number
  lastSequence: number
  eventCount: number
  npcCount: number
  facts: Record<string, unknown>
  worldConfig: Readonly<{
    tickDurationMs: number
    ticksPerDay: number
    timezone: string
    timezoneOffsetMinutes: number
  }>
  /** Per-tick budget gate observability (Phase 1 simulation-budget-enforcement). */
  tickCommandStats: TickCommandStats
  /** NPC active/background partition for the most recent tick (Phase 1 slices 3a/3b). */
  npcPartition: NpcPartitionStats
  generatedAt: string
}>

export type NarrativeEvent = Readonly<{
  sequence: number
  tick: number
  eventType: string
  actorId: string
  occurredAt: string
  payload: Record<string, unknown>
  narration: string | null
}>

type Listener = (event: NarrativeEvent) => void
type TickListener = (tick: number) => void

const RECENT_EVENTS_BUFFER = 200

export class SimulationRuntime {
  private currentTick = 0
  private weather: string = WEATHERS[0]
  private season: string = SEASONS[0]
  private rareWindowOpen = false
  private rareWindowClosesAtTick = 0
  private readonly recentEvents: NarrativeEvent[] = []
  private readonly listeners = new Set<Listener>()
  private readonly tickListeners = new Set<TickListener>()
  private timer: NodeJS.Timeout | null = null
  private lastSequence = 0
  private eventCount = 0
  // Per-tick budget gate (simulation-budget-enforcement).
  // Slice 1: observability counters (softCap = warn-only).
  // Slice 2: deterministic hard-cap rejection (commands sorted by canonical
  // commandId; overflow recorded in rejected_command_log; WorldState
  // unaffected because rejected_command_log is excluded from reduction).
  private lastTickCommandCount = 0
  private peakTickCommandCount = 0
  private softCapHitCount = 0
  private hardCapRejectedSinceBoot = 0
  // Phase 1 slices 3a/3b: NPC active/background partition for the most
  // recent tick. Computed each tick in runTick (cheap: O(N) char-code
  // hash) and fed into NpcEngine to gate productive/interaction phases.
  private lastActiveNpcCount = 0
  // Phase 1 §33.4 Settlement domain — first Layer 3 civilization entity.
  // The projection rebuilds from SETTLEMENT_FORMED events on boot; the
  // copresence history tracks how long each tile's cohort has been
  // stable across consecutive ticks (in-memory cache — deterministic
  // because it's derived from npc engine state which itself is a
  // projection of EventLog).
  private readonly settlementsProjection = new SettlementsProjection()
  private settlementCopresenceHistory: ReadonlyMap<string, CopresenceHistoryRow> = new Map()
  private readonly eventEngine = new WorldEventEngine()
  private readonly npcEngine: NpcEngine
  private readonly areaEngine: AreaStateEngine
  private readonly buildingRuntime: BuildingRuntime
  private readonly npcFactionLean: Map<string, FactionId>
  private readonly livingWorldRuleEngine = new LivingWorldRuleEngine()
  private readonly kernelRuleEngine = new KernelRuleEngine()
  private npcMemory: SqliteNpcMemoryStore | null = null
  private npcRelationships: SqliteNpcRelationshipsStore | null = null
  private ambientNarrator: AmbientNarrator | null = null
  private lifeExpansion: LifeExpansionState = createInitialLifeExpansionState()
  private readonly constructionProjects = new ConstructionProjectsProjection()
  private readonly npcStateProjection = new NpcStateProjection()
  private readonly animalPopulationProjection = new AnimalPopulationProjection()
  private readonly fisheryDensityProjection = new FisheryDensityProjection()
  private readonly goodsInventoryProjection = new GoodsInventoryProjection()
  private readonly logisticsProjection = new LogisticsProjection()
  private readonly marketPricesProjection = new MarketPricesProjection()
  private readonly productionChainsProjection = new ProductionChainsProjection()

  constructor(
    private readonly store: SqliteEventStore,
    private readonly profiles: readonly NpcProfile[],
    private readonly cards: CardCatalog,
    private readonly tickDurationMs: number = TICK_DURATION_MS
  ) {
    this.npcEngine = new NpcEngine(profiles)
    this.areaEngine = new AreaStateEngine(MAP_TILES.map((t) => t.id))
    this.buildingRuntime = new BuildingRuntime()
    this.npcFactionLean = buildNpcFactionLean(profiles)
    this.hydrateFromEventLog()
  }

  /**
   * Wire the NPC memory and NPC relationship projections. Called from
   * the HTTP boot path after the SQLite tables exist. The runtime
   * keeps emitting typed living-world events whether or not these are
   * attached, so existing integrations that don't care about memory
   * stay decoupled.
   */
  attachLivingWorldProjections(input: {
    memory: SqliteNpcMemoryStore
    relationships: SqliteNpcRelationshipsStore
  }): void {
    this.npcMemory = input.memory
    this.npcRelationships = input.relationships
    // First boot or fresh tables: replay the entire event log so the
    // projections match the source-of-truth EventLog. Check table-level
    // row counts, not a synthetic NPC id, otherwise every boot rebuilds.
    const memoryRows = input.memory.countAll()
    const relationshipRows = input.relationships.countAll()
    if (memoryRows === 0 || relationshipRows === 0) {
      const eventCount = this.store.countEvents()
      if (eventCount > BOOT_PROJECTION_REBUILD_EVENT_LIMIT) {
        console.warn(
          `[boot] skipped living-world projection rebuild for ${eventCount} events; ` +
            'projection tables will repopulate from new events'
        )
        return
      }
      const events = this.store.readEvents()
      if (memoryRows === 0) input.memory.rebuildFromEvents(events)
      if (relationshipRows === 0) input.relationships.rebuildFromEvents(events)
      console.log(
        `[boot] living-world projections rebuilt from ${events.length} events`
      )
    }
  }

  getNpcMemory(): SqliteNpcMemoryStore | null {
    return this.npcMemory
  }

  getNpcRelationships(): SqliteNpcRelationshipsStore | null {
    return this.npcRelationships
  }

  attachAmbientNarrator(settings: SettingsStore): AmbientNarrator {
    if (this.ambientNarrator) return this.ambientNarrator
    const narrator = new AmbientNarrator(settings)
    this.ambientNarrator = narrator
    // v0.15.1：每 tick 主動推「最近被玩家請求過、cache 已過期」的 tile 進下一輪
    // refresh，這樣下次 polling 拿到的 ambient 文字真的會變動，而不是靜止 30 tick。
    this.subscribeTick((tick) => {
      narrator.tickRefresh(tick, (tileId) => this.buildAmbientContext(tileId))
    })
    return narrator
  }

  getAmbientNarrator(): AmbientNarrator | null {
    return this.ambientNarrator
  }

  /**
   * v0.15.1：建立 AmbientContext 給定 tileId。供 buildings router 與
   * AmbientNarrator.tickRefresh 共用，避免 ambient context 在兩處重複組裝
   * 失同步。回傳 null 表示 tile 不存在於此世界。
   */
  buildAmbientContext(tileId: string): AmbientContext | null {
    const state = this.areaEngine.getState(tileId)
    if (!state) return null
    const presentNpcNames = this.getOutdoorNpcNamesAt(tileId)
    const presentBuildingNames = this.buildingRuntime
      .snapshotForTile(tileId, this.npcEngine.snapshotAll(), this.completedConstructionBuildingDefs())
      .map((b) => b.def.nameZh)
    const recentNarrations = this.getRecentEvents(20)
      .filter((e) => e.narration)
      .slice(0, 5)
      .map((e) => e.narration!)
    return {
      tileId,
      weather: this.weather,
      season: this.season,
      presentNpcNames,
      presentBuildingNames,
      recentNarrations,
      areaState: state,
      worldEvents: this.eventEngine.getActive()
    }
  }

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.runTickSafely(), this.tickDurationMs)
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 額外的 per-tick callback。runs after the tick has incremented. */
  subscribeTick(listener: TickListener): () => void {
    this.tickListeners.add(listener)
    return () => this.tickListeners.delete(listener)
  }

  getRecentEvents(limit = 50): NarrativeEvent[] {
    return this.recentEvents.slice(-limit).reverse()
  }

  getSnapshot(): WorldSnapshot {
    return {
      tick: this.currentTick,
      lastSequence: this.lastSequence,
      eventCount: this.eventCount,
      npcCount: this.profiles.length,
      facts: {
        weather: this.weather,
        season: this.season,
        rareWindowOpen: this.rareWindowOpen,
        rareWindowClosesAtTick: this.rareWindowOpen ? this.rareWindowClosesAtTick : null,
        activeEvents: this.eventEngine.getActive(),
        areaStates: this.getAreaStates(),
        lifeExpansion: this.lifeExpansion,
        animalPopulation: this.animalPopulationProjection.list(),
        fisheryDensity: this.fisheryDensityProjection.list(),
        goodsInventory: this.goodsInventoryProjection.list(),
        logistics: this.logisticsProjection.snapshot(),
        marketPrices: this.marketPricesProjection.list(),
        productionChains: this.productionChainsProjection.snapshot()
      },
      worldConfig: {
        tickDurationMs: this.tickDurationMs,
        ticksPerDay: TICKS_PER_DAY,
        timezone: WORLD_TIMEZONE,
        timezoneOffsetMinutes: WORLD_TIMEZONE_OFFSET_MINUTES,
      },
      tickCommandStats: {
        lastTick: this.lastTickCommandCount,
        peak: this.peakTickCommandCount,
        softCap: MAX_COMMANDS_PER_TICK_SOFT_CAP,
        softCapHitCount: this.softCapHitCount,
        hardCap: MAX_COMMANDS_PER_TICK_HARD_CAP,
        hardCapRejectedSinceBoot: this.hardCapRejectedSinceBoot,
      },
      npcPartition: {
        activeCount: this.lastActiveNpcCount,
        totalCount: this.profiles.length,
        period: NPC_PARTITION_PERIOD,
      },
      generatedAt: new Date().toISOString()
    }
  }

  getAreaStates(): readonly AreaState[] {
    return [
      ...this.areaEngine.snapshotAll(),
      ...this.lifeExpansion.unlockedTileIds
        .filter((tileId) => !this.areaEngine.getState(tileId))
        .map((tileId) => makeExpansionAreaState(tileId, this.currentTick))
    ]
  }

  getAreaState(tileId: string): AreaState | null {
    return this.areaEngine.getState(tileId) ?? (
      this.lifeExpansion.unlockedTileIds.includes(tileId)
        ? makeExpansionAreaState(tileId, this.currentTick)
        : null
    )
  }

  getBuildingsOnTile(tileId: string): readonly BuildingRuntimeView[] {
    return this.mergeCompletedConstructionBuildings(
      tileId,
      this.mergeUnlockedBuildings(
        tileId,
        this.buildingRuntime.snapshotForTile(
          tileId,
          this.npcEngine.snapshotAll(),
          this.completedConstructionBuildingDefs()
        )
      )
    )
  }

  getInProgressConstructionProjects(tileId?: string): readonly ConstructionProjectRow[] {
    return this.visibleAutonomousConstructionProjects()
      .filter((project) => project.completedAtTick === null)
      .filter((project) => tileId === undefined || project.targetTileId === tileId)
  }

  getAllBuildings(): readonly BuildingRuntimeView[] {
    const existing = this.buildingRuntime.snapshotAll(
      this.npcEngine.snapshotAll(),
      this.completedConstructionBuildingDefs()
    )
    const byId = new Map(existing.map((view) => [view.def.id, view] as const))
    for (const def of listAllBuildings(this.lifeExpansion.unlockedBuildingIds)) {
      if (!byId.has(def.id)) byId.set(def.id, { def, occupants: [] })
    }
    for (const view of this.completedConstructionBuildingViews()) {
      if (!byId.has(view.def.id)) byId.set(view.def.id, view)
    }
    return [...byId.values()]
  }

  private mergeCompletedConstructionBuildings(tileId: string, existing: readonly BuildingRuntimeView[]): readonly BuildingRuntimeView[] {
    const byId = new Map(existing.map((view) => [view.def.id, view] as const))
    for (const view of this.completedConstructionBuildingViews()) {
      if (view.def.tileId === tileId && !byId.has(view.def.id)) byId.set(view.def.id, view)
    }
    return [...byId.values()]
  }

  private completedConstructionBuildingViews(): readonly BuildingRuntimeView[] {
    return this.cappedCompletedConstructionProjects()
      .map((project) => completedConstructionBuildingView(project))
      .filter((view): view is BuildingRuntimeView => view !== null)
  }

  private completedConstructionBuildingDefs(): readonly BuildingDef[] {
    return this.cappedCompletedConstructionProjects()
      .map((project) => project.completedAtTick !== null && project.initiatedByNpcId ? completedConstructionBuildingDef(project) : null)
      .filter((def): def is BuildingDef => def !== null)
  }

  private constructionDemandForNpc(npcId: string, profile: NpcProfile | null, tileId: string, tick: number): number {
    const state = this.npcEngine.getState(npcId)
    if (!profile || !state) return 0
    const life = deriveNpcLifeView({
      profile,
      state,
      areaState: this.getAreaState(tileId),
      lifeExpansion: this.lifeExpansion,
      tick
    })
    return life.goal.kind === 'build_city' || life.goal.kind === 'secure_home' ? life.goal.pressure : 0
  }

  private worldAgendaFor(tileId: string, tick: number): WorldAgendaDirective {
    return deriveWorldAgendaDirective({
      areas: this.getAreaStates(),
      activeEvents: this.eventEngine.getActive(),
      tick,
      preferredTileId: tileId
    })
  }

  private cappedCompletedConstructionProjects(): readonly ConstructionProjectRow[] {
    return this.visibleAutonomousConstructionProjects()
      .filter((project) => project.completedAtTick !== null)
  }

  private visibleAutonomousConstructionProjects(): readonly ConstructionProjectRow[] {
    return visibleAutonomousConstructionProjects(
      this.constructionProjects.list(),
      CIV_EVO_MAX_AUTONOMOUS_BUILDINGS_PER_TILE
    )
  }

  private findRuntimeBuildingById(id: string): BuildingDef | null {
    return findBuildingById(id) ?? this.completedConstructionBuildingDefs().find((def) => def.id === id) ?? null
  }

  private mergeUnlockedBuildings(tileId: string, existing: readonly BuildingRuntimeView[]): readonly BuildingRuntimeView[] {
    const byId = new Map(existing.map((view) => [view.def.id, view] as const))
    for (const def of listBuildingsForTile(tileId, this.lifeExpansion.unlockedBuildingIds)) {
      if (!byId.has(def.id)) byId.set(def.id, { def, occupants: [] })
    }
    return [...byId.values()]
  }

  getCurrentWeather(): string {
    return this.weather
  }

  getCurrentSeason(): string {
    return this.season
  }

  getNpcFaction(npcId: string): FactionId | null {
    return this.npcFactionLean.get(npcId) ?? null
  }

  isNpcInsideBuilding(npcId: string, buildingId: string): boolean {
    const state = this.npcEngine.getState(npcId)
    return state ? this.buildingRuntime.isNpcInside(npcId, buildingId, state, this.completedConstructionBuildingDefs()) : false
  }

  getOutdoorNpcsAt(tileId: string): string[] {
    const all = this.npcEngine.snapshotAll()
    return this.buildingRuntime.npcsOutsideOnTile(all, this.completedConstructionBuildingDefs()).get(tileId) ?? []
  }

  getOutdoorNpcNamesAt(tileId: string): string[] {
    const ids = this.getOutdoorNpcsAt(tileId)
    return ids
      .map((id) => this.profiles.find((p) => p.id === id)?.name.zh ?? id)
      .slice(0, 8)
  }

  getActiveWorldEvents(): readonly ActiveWorldEvent[] {
    return this.eventEngine.getActive()
  }

  /** Phase 1 §33.4 — current settlements (Layer 3 Civilization Runtime). */
  getSettlements(): readonly SettlementRow[] {
    return this.settlementsProjection.getAll()
  }

  /** Phase 1 §33.4 — single settlement by id. */
  getSettlementById(id: string): SettlementRow | null {
    return this.settlementsProjection.getById(id)
  }

  /** Phase E0.2 — current animal population projection (Layer 2.5). */
  getAnimalPopulation(): readonly AnimalPopulationRow[] {
    return this.animalPopulationProjection.list()
  }

  /** Phase E0.4 — current fishery density projection (Layer 2.5). */
  getFisheryDensity(): readonly FisheryDensityRow[] {
    return this.fisheryDensityProjection.list()
  }

  /** Phase 2 §35.1 — current goods inventory projection (Layer 3). */
  getGoodsInventory(): readonly GoodsInventoryRow[] {
    return this.goodsInventoryProjection.list()
  }

  /** Phase 2 §35.2 — trade routes and goods transports (Layer 3). */
  getLogistics(): LogisticsSnapshot {
    return this.logisticsProjection.snapshot()
  }

  /** Phase 2 §35.3 — deterministic goods production chains (Layer 3). */
  getProductionChains(): ProductionChainsSnapshot {
    return this.productionChainsProjection.snapshot()
  }

  /** Phase 2 §35.4 — deterministic settlement market prices (Layer 3). */
  getMarketPrices(): readonly MarketPriceRow[] {
    return this.marketPricesProjection.list()
  }

  getManualNpcIds(): readonly string[] {
    return Object.freeze(this.profiles.map((profile) => profile.id))
  }

  getNpcs(): SimNpcState[] {
    return this.profiles.map((profile) => {
      const s =
        this.npcEngine.getState(profile.id) ??
        ({
          tile: profile.defaultLocation,
          mood: 60,
          health: 80,
          activity: 'idle',
          faction: 'neutral',
          targetTile: profile.defaultLocation,
          lastActedTick: 0,
          subCol: 7,
          subRow: 5,
          subZ: 0
        } as NpcRuntimeState)
      const buildingId = this.getNpcBuildingId(profile.id)
      return {
        id: profile.id,
        name: { zh: profile.name.zh, en: profile.name.en },
        role: { zh: profile.role.zh, en: profile.role.en },
        location: s.tile,
        relationshipScore: this.deriveRelationshipScore(profile),
        lastActedTick: s.lastActedTick,
        internalState: {
          patience: profile.personality.patience ?? null,
          greed: profile.personality.greed ?? null,
          agent: s.agent ?? null
        },
        activity: s.activity,
        mood: Math.round(s.mood),
        health: Math.round(s.health),
        faction: s.faction,
        targetTile: s.targetTile,
        subCol: s.subCol,
        subRow: s.subRow,
        subZ: s.subZ,
        buildingId,
        travelRoute: s.travelRoute ?? null,
        color: deriveNpcColor(profile.id, s.faction),
        greetLine: derivePersonalityGreetLine(profile),
        intentLine: deriveNpcIntentLine(s),
        life: deriveNpcLifeView({
          profile,
          state: s,
          areaState: this.getAreaState(s.tile),
          lifeExpansion: this.lifeExpansion,
          tick: this.currentTick
        }),
        civic: this.lifeExpansion.npcCivicRecords[profile.id] ?? null
      }
    })
  }

  getCardCatalog(): CardCatalog {
    return this.cards
  }

  getMap(): Readonly<{
    width: number
    height: number
    tiles: Array<{
      id: string
      name: string
      x: number
      y: number
      biome: string
      npcIds: string[]
    }>
  }> {
    // 室內 NPC 不算在 area scene 上 — 玩家進建築才看到
    const tiles = listMapTiles(this.lifeExpansion.unlockedTileIds).map((tile) => ({
      ...tile,
      npcIds: this.profiles
        .filter((p) => {
          const tileMatch = (this.npcEngine.getState(p.id)?.tile ?? p.defaultLocation) === tile.id
          if (!tileMatch) return false
          const insideBuildingId = this.getNpcBuildingId(p.id)
          return insideBuildingId === null
        })
        .map((p) => p.id)
    }))
    return { width: 9, height: 6, tiles }
  }

  /** 此 NPC 是否在某棟建築內？回傳建築 id 或 null。 */
  getNpcBuildingId(npcId: string): string | null {
    const state = this.npcEngine.getState(npcId)
    return state ? this.buildingRuntime.resolveNpcBuildingId(npcId, state) : null
  }

  isRareWindowOpen(): boolean {
    return this.rareWindowOpen
  }

  getCurrentTick(): number {
    return this.currentTick
  }

  holdNpcForPlayerDialog(
    playerAccountId: string,
    npcId: string
  ): { npcId: string; tick: number; expiresAtTick: number } | null {
    const state = this.npcEngine.getState(npcId)
    if (!state) return null
    const command = makeLivingWorldCommand(
      'NPC_DIALOG_HOLD',
      playerAccountId,
      'player',
      this.currentTick,
      Date.now(),
      {
        playerAccountId,
        npcId,
        tile: state.tile,
        holdTicks: NPC_PLAYER_DIALOG_HOLD_TICKS,
        narration: null
      }
    )
    const result = this.livingWorldRuleEngine.evaluate(command)
    if (!result.accepted) {
      console.warn(
        `[runtime] rejected ${command.commandType} from ${command.actorId}: ${result.rejection.reason}`
      )
      return null
    }
    const change = this.npcEngine.commitPlayerDialogHoldTask(npcId, this.currentTick)
    if (!change) return null
    const expiresAtTick = change.state.agent.activeTask.expiresAtTick
    const committed = this.store.appendEvents([
      ...(result.events as EventDraft[]),
      this.factSetDraft(
        `${NPC_STATE_PREFIX}${change.npcId}`,
        { ...change.state },
        change.npcId,
        this.currentTick
      )
    ])
    if (committed.length > 0) {
      this.lastSequence = committed[committed.length - 1]!.sequence
      this.eventCount += committed.length
    }
    return {
      npcId: change.npcId,
      tick: this.currentTick,
      expiresAtTick: typeof expiresAtTick === 'number' ? expiresAtTick : this.currentTick
    }
  }

  findProfile(npcId: string): NpcProfile | null {
    for (const profile of this.profiles) {
      if (profile.id === npcId) return profile
    }
    return null
  }

  /**
   * v0.14.0：對外暴露的 player command 提交入口。Player 動作（介入爭執、
   * 未來的紋卡戰鬥等）必須走這條路：build typed Command → LivingWorldRuleEngine
   * 驗證 → typed Event 寫進 EventLog → fan out projections + listeners。
   *
   * 回傳已 commit 的 event；rule engine 拒絕時回 null（caller 自己處理錯誤）。
   * 嚴格遵守 ARCHITECTURE.md §1.1 命令-事件分離 + §9 AI read-only：
   *   - intentClass 必須在進這個 method 之前由 caller 決定（可由 AI 預先分類，
   *     但 AI 不直接寫 EventLog）
   *   - Rule Engine 在這層驗證命令格式、產生 deterministic event id
   */
  submitLivingWorldCommand(command: LivingWorldCommand): Event | null {
    const result = this.livingWorldRuleEngine.evaluate(command)
    if (!result.accepted) {
      console.warn(
        `[runtime] rejected ${command.commandType} from ${command.actorId}: ${result.rejection.reason}`
      )
      return null
    }
    const drafts = result.events as EventDraft[]
    const committed = this.store.appendEvents(drafts)
    if (committed.length === 0) return null
    const last = committed[committed.length - 1]!
    this.lastSequence = last.sequence
    this.eventCount += committed.length
    for (const ev of committed) {
      if (this.npcMemory) this.npcMemory.project(ev)
      if (this.npcRelationships) this.npcRelationships.project(ev)
      this.constructionProjects.project(ev)
      this.npcStateProjection.project(ev)
      this.animalPopulationProjection.project(ev)
      this.fisheryDensityProjection.project(ev)
      this.goodsInventoryProjection.project(ev)
      this.logisticsProjection.project(ev)
      this.marketPricesProjection.project(ev)
      this.productionChainsProjection.project(ev)
      this.settlementsProjection.project(ev)
      const narrativeEvent = readNarrativeFromAnyEvent(ev, this.currentTick)
      if (narrativeEvent) {
        this.pushRecent(narrativeEvent)
        for (const listener of this.listeners) {
          try {
            listener(narrativeEvent)
          } catch (err) {
            console.error('[runtime] listener error', err)
          }
        }
      }
    }
    return committed[0] ?? null
  }

  private runTickSafely(): void {
    try {
      this.runTick()
    } catch (err) {
      console.error('[sim] tick failed', err)
    }
  }

  private runTick(): void {
    const nextTick = this.currentTick + 1
    // Two parallel collections per Living Deterministic World law:
    //   1. stateDrafts — FACT_SET state snapshots (npc state, area
    //      state, building occupants, weather, season, rare window,
    //      active events). These drive `hydrateFromEventLog` on
    //      restart.
    //   2. commands — typed living-world Commands. Each one passes
    //      through the Rule Engine to become a typed Event. These
    //      drive listeners (UI), NPC memory projection, NPC
    //      relationship projection, and offline catch-up summary.
    const stateDrafts: EventDraft[] = []
    const commands: LivingWorldCommand[] = []
    const plannedRouteIds = new Set<string>()
    const plannedProductionRecipeIds = new Set<string>()
    const submittedAt = Date.now()

    stateDrafts.push(this.factSetDraft(FACT_TICK, nextTick, SIM_ACTOR_WORLD, nextTick))
    commands.push(
      makeLivingWorldCommand(
        'WORLD_TICK',
        SIM_ACTOR_WORLD,
        'system',
        nextTick,
        submittedAt,
        { tick: nextTick }
      )
    )

    // ---- Phase 1 slice 3a: NPC partition computation ----
    // Deterministic round-robin partition of NPCs into "active" (full
    // policy) vs "background" (cheap policy) buckets. This slice only
    // computes + exposes the partition for GM observability. Slice 3b
    // wires `activeNpcSet` into productive + interaction phases while
    // leaving movement / schedule progression deterministic for everyone.
    const npcPartition = partitionNpcsForTick(
      this.profiles.map((p) => p.id),
      nextTick,
      NPC_PARTITION_PERIOD
    )
    this.lastActiveNpcCount = npcPartition.activeCount

    // ---- NPC engine：tile-by-tile 移動、活動、互動 ----
    // v0.14.0：傳入 area resources / weather / rare-window 給 NPC personality
    // nudge 用，讓 archetype 化決策能看到「最危險的鄰居 tile」/「最熱鬧的 tile」
    const areaSafety = new Map<string, number>()
    const areaEconomy = new Map<string, number>()
    for (const a of this.areaEngine.snapshotAll()) {
      areaSafety.set(a.tileId, a.resources.safety)
      areaEconomy.set(a.tileId, a.resources.economy)
    }
    // v0.14.0：同時把「目前在建築物裡」的 NPC 名單算出來。Phase 2 互動會排除
    // 這些 NPC，避免事件出現「鏽灣區起爭執」但玩家進到鏽灣區看不到那兩位 NPC
    // (因為他們其實在某棟建築內)。
    const npcsInsideBuildings = new Set<string>()
    for (const view of this.buildingRuntime.snapshotAll(this.npcEngine.snapshotAll(), this.completedConstructionBuildingDefs())) {
      for (const occupant of view.occupants) {
        npcsInsideBuildings.add(occupant.npcId)
      }
    }
    const npcResult = this.npcEngine.tick(nextTick, {
      areaSafety,
      areaEconomy,
      weather: this.weather,
      rareWindowOpen: this.rareWindowOpen,
      activeNpcSet: npcPartition.active,
      npcsInsideBuildings
    })
    const saltMarshProject = this.lifeExpansion.constructionProjects[SALT_MARSH_PROJECT_ID]
    let plannedSaltMarshProgress = saltMarshProject?.progress ?? 0
    let plannedSaltMarshCompleted =
      this.lifeExpansion.unlockedTileIds.includes(SALT_MARSH_TILE_ID) ||
      plannedSaltMarshProgress >= SALT_MARSH_PROJECT_TARGET
    const plannedHuntedAnimalIds = new Set<string>()
    for (const event of npcResult.events) {
      const profile = this.profiles.find((p) => p.id === ('npcId' in event ? event.npcId : ''))
      if (event.kind === 'move') {
        const name = profile?.name.zh ?? event.npcId
        const fromName = TILE_NAME_BY_ID[event.from] ?? event.from
        const toName = TILE_NAME_BY_ID[event.to] ?? event.to
        const npcState = this.npcEngine.getState(event.npcId)
        const reachedDest = npcState !== null && npcState.tile === npcState.targetTile
        const narration = reachedDest
          ? `${name}抵達了${toName}。`
          : `${name}離開了${fromName}，前往${toName}。`
        commands.push(
          makeLivingWorldCommand(
            'NPC_MOVE',
            event.npcId,
            'npc',
            nextTick,
            submittedAt,
            {
              npcId: event.npcId,
              from: event.from,
              to: event.to,
              activity: event.activity,
              reachedDest,
              motivation: makeMotivation(
                reachedDest
                  ? `${name}依照排程或目標抵達${toName}，讓 server-authoritative presence 反映新的所在位置。`
                  : `${name}離開${fromName}前往${toName}，通常是排程、職責或生活需求把人帶往下一個區域。`
              ),
              narration
            }
          )
        )
      } else if (event.kind === 'activity') {
        const name = profile?.name.zh ?? event.npcId
        const tileName = TILE_NAME_BY_ID[event.tile] ?? event.tile
        commands.push(
          makeLivingWorldCommand(
            'NPC_ACTIVITY_CHANGE',
            event.npcId,
            'npc',
            nextTick,
            submittedAt,
            {
              npcId: event.npcId,
              tile: event.tile,
              from: event.from,
              to: event.to,
              motivation: makeMotivation(`${name}的日程或生活需求把活動從 ${event.from} 調整為 ${event.to}，地點是${tileName}。`),
              narration: `${name}在${tileName}${activityVerb(event.to)}。`
            }
          )
        )
      } else if (event.kind === 'productive') {
        const productiveDelta = productiveDeltaWithNpcSkill(this.lifeExpansion, {
          npcId: event.npcId,
          domain: event.domain,
          baseDelta: event.delta
        })
        commands.push(
          makeLivingWorldCommand(
            'NPC_PRODUCTIVE_ACTION',
            event.npcId,
            'npc',
            nextTick,
            submittedAt,
            {
              npcId: event.npcId,
              tile: event.tile,
              activity: event.activity,
              domain: event.domain,
              metric: event.metric,
              delta: productiveDelta,
              motivation: this.buildProductiveActionMotivation(
                event.npcId,
                profile ?? null,
                this.npcEngine.getState(event.npcId),
                event.domain,
                event.metric,
                nextTick
              ),
              narration: event.narration
            }
          )
        )
        const lifeForHunt = profile ? deriveNpcLifeView({
          profile,
          state: this.npcEngine.getState(event.npcId) ?? makeFallbackNpcState(event.tile, nextTick),
          areaState: this.getAreaState(event.tile),
          lifeExpansion: this.lifeExpansion,
          tick: nextTick,
        }) : null
        const hunt = profile && lifeForHunt ? planSimpleHunt({
          tick: nextTick,
          npcId: event.npcId,
          tileId: event.tile,
          roleZh: profile.role.zh,
          roleEn: profile.role.en,
          foodNeed: lifeForHunt.needs.food,
          animalPopulation: this.animalPopulationProjection.list(),
          reservedAnimalIds: plannedHuntedAnimalIds,
        }) : null
        if (hunt && profile && lifeForHunt) {
          plannedHuntedAnimalIds.add(hunt.targetAnimalId)
          const species = requireSpecies(hunt.targetSpeciesId)
          const tileName = TILE_NAME_BY_ID[hunt.tileId] ?? hunt.tileId
          const npcName = profile.name.zh
          const motivation = makeMotivation(`${npcName}因食物壓力 ${lifeForHunt?.needs.food ?? 0} 在${tileName}追蹤 ${hunt.targetSpeciesId}，把巡獵工作轉成真實 ecosystem 事件。`)
          commands.push(
            makeLivingWorldCommand(
              'ANIMAL_HUNT_STARTED',
              event.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                huntId: hunt.huntId,
                npcId: hunt.npcId,
                tileId: hunt.tileId,
                targetSpeciesId: hunt.targetSpeciesId,
                targetAnimalId: hunt.targetAnimalId,
                startedAtTick: nextTick,
                motivation,
                narration: `${npcName}在${tileName}開始追蹤${hunt.targetSpeciesId}。`
              }
            ),
            makeLivingWorldCommand(
              'ANIMAL_HUNT_RESOLVED',
              event.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                huntId: hunt.huntId,
                npcId: hunt.npcId,
                tileId: hunt.tileId,
                targetSpeciesId: hunt.targetSpeciesId,
                targetAnimalId: hunt.targetAnimalId,
                outcome: 'success',
                resolvedAtTick: nextTick,
                motivation,
                narration: `${npcName}在${tileName}完成一次成功狩獵。`
              }
            ),
            makeLivingWorldCommand(
              'ANIMAL_KILLED',
              event.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                huntId: hunt.huntId,
                animalId: hunt.targetAnimalId,
                speciesId: hunt.targetSpeciesId,
                tileId: hunt.tileId,
                killedByNpcId: hunt.npcId,
                killedAtTick: nextTick,
                motivation,
                narration: `${npcName}獵倒了一隻${hunt.targetSpeciesId}。`
              }
            ),
            makeLivingWorldCommand(
              'CARCASS_CREATED',
              SIM_ACTOR_WORLD,
              'system',
              nextTick,
              submittedAt,
              {
                huntId: hunt.huntId,
                carcassId: hunt.carcassId,
                animalId: hunt.targetAnimalId,
                speciesId: hunt.targetSpeciesId,
                tileId: hunt.tileId,
                edibleYield: hunt.quantity,
                byproducts: species.byproducts,
                createdAtTick: nextTick,
                motivation,
                narration: `${hunt.targetSpeciesId}的屍體留在${tileName}，可被採收。`
              }
            ),
            makeLivingWorldCommand(
              'MEAT_HARVESTED',
              event.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                huntId: hunt.huntId,
                carcassId: hunt.carcassId,
                animalId: hunt.targetAnimalId,
                speciesId: hunt.targetSpeciesId,
                tileId: hunt.tileId,
                npcId: hunt.npcId,
                quantity: hunt.quantity,
                goldValue: hunt.goldValue,
                harvestedAtTick: nextTick,
                motivation,
                narration: `${npcName}從${hunt.targetSpeciesId}取得 ${hunt.quantity} 份肉，換算 ${hunt.goldValue} 金的生活補給。`
              }
            )
          )
        }
        if (profile) {
          const fishery = planFisheryHarvest({
            tick: nextTick,
            npcId: event.npcId,
            roleZh: profile.role.zh,
            roleEn: profile.role.en,
            tile: TILE_BY_ID[event.tile] ?? null,
            fishery: this.fisheryDensityProjection.getByTile(event.tile),
          })
          if (fishery) {
            const tileName = TILE_NAME_BY_ID[fishery.tileId] ?? fishery.tileId
            const motivation = makeMotivation(`${profile.name.zh}以${profile.role.zh}身分在${tileName}採收漁獲，直接降低該 tile 的 fisheryDensity。`)
            commands.push(
              makeLivingWorldCommand(
                'FISHERY_HARVESTED',
                event.npcId,
                'npc',
                nextTick,
                submittedAt,
                {
                  tileId: fishery.tileId,
                  npcId: fishery.npcId,
                  delta: fishery.delta,
                  densityBefore: fishery.densityBefore,
                  densityAfter: fishery.densityAfter,
                  harvestedAtTick: nextTick,
                  motivation,
                  narration: `${profile.name.zh}在${tileName}採收漁獲，漁場密度降到 ${fishery.densityAfter}。`
                }
              )
            )
            if (fishery.collapsed) {
              commands.push(
                makeLivingWorldCommand(
                  'FISHERY_COLLAPSED',
                  SIM_ACTOR_WORLD,
                  'system',
                  nextTick,
                  submittedAt,
                  {
                    tileId: fishery.tileId,
                    density: fishery.densityAfter,
                    collapsedAtTick: nextTick,
                    motivation,
                    narration: `${tileName}的漁場密度跌破警戒線，漁獲暫時枯竭。`
                  }
                )
              )
            }
          }
        }
        if (!plannedSaltMarshCompleted && isExpansionProductiveDomain(event.domain)) {
          const delta = productiveDeltaWithNpcSkill(this.lifeExpansion, {
            npcId: event.npcId,
            domain: event.domain,
            baseDelta: event.domain === 'build' ? 2 : 1
          })
          plannedSaltMarshProgress = Math.min(SALT_MARSH_PROJECT_TARGET, plannedSaltMarshProgress + delta)
          const motivation = this.buildSaltMarshConstructionMotivation(
            event.npcId,
            profile ?? null,
            this.npcEngine.getState(event.npcId),
            nextTick
          )
          commands.push(
            makeLivingWorldCommand(
              'CONSTRUCTION_PROJECT_PROGRESS',
              event.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                projectId: SALT_MARSH_PROJECT_ID,
                kind: 'settlement',
                targetTileId: SALT_MARSH_TILE_ID,
                buildingId: SALT_MARSH_BUILDING_ID,
                npcId: event.npcId,
                delta,
                progressAfter: plannedSaltMarshProgress,
                targetProgress: SALT_MARSH_PROJECT_TARGET,
                motivation,
                narration: `城市建設隊把${profile?.name.zh ?? event.npcId}的成果記入鹽沼外環拓荒工程：${plannedSaltMarshProgress}/${SALT_MARSH_PROJECT_TARGET}。原因：${motivation.explanation}`
              }
            )
          )
          if (plannedSaltMarshProgress >= SALT_MARSH_PROJECT_TARGET) {
            plannedSaltMarshCompleted = true
            commands.push(
              makeLivingWorldCommand(
                'MAP_TILE_UNLOCKED',
                SIM_ACTOR_WORLD,
                'system',
                nextTick,
                submittedAt,
                {
                  projectId: SALT_MARSH_PROJECT_ID,
                  tileId: SALT_MARSH_TILE_ID,
                  adjacentTo: ['t_dock', 't_ruin'],
                  motivation,
                  narration: `鹽沼外環的步道終於打通，潮鳴市的地圖向外多了一片可抵達的新邊界。原因：${motivation.explanation}`
                }
              ),
              makeLivingWorldCommand(
                'BUILDING_CONSTRUCTED',
                SIM_ACTOR_WORLD,
                'system',
                nextTick,
                submittedAt,
                {
                  projectId: SALT_MARSH_PROJECT_ID,
                  buildingId: SALT_MARSH_BUILDING_ID,
                  tileId: SALT_MARSH_TILE_ID,
                  motivation,
                  narration: `鹽沼拓荒站掛上第一盞燈，工匠、巡衛與商販有了新的落腳處。原因：${motivation.explanation}`
                }
              )
            )
          }
        }
        // v0.15.43 civ-evo-construction Slice 3: every productive build
        // event is also an opportunity for the NPC to autonomously start a
        // brand-new project on their current tile (not salt-marsh). The
        // pure decision function gates on Slice-3 rules; idempotency on
        // the reducer side (`withConstructionInitiated`) makes repeated
        // ticks safe.
        if (event.domain === 'build') {
          const decision = decideCivEvoConstructionInitiate({
            npcId: event.npcId,
            tile: event.tile,
            areaState: this.getAreaState(event.tile),
            lifeExpansion: this.lifeExpansion,
            constructionDemand: this.constructionDemandForNpc(event.npcId, profile ?? null, event.tile, nextTick),
            availableGold: this.lifeExpansion.npcCivicRecords[event.npcId]?.gold ?? 0
          })
          if (decision) {
            const motivation = this.buildAutonomousConstructionMotivation(
              event.npcId,
              profile ?? null,
              this.npcEngine.getState(event.npcId),
              decision.tileId,
              decision.goldCost,
              nextTick
            )
            commands.push(
              makeLivingWorldCommand(
                'CONSTRUCTION_INITIATE',
                event.npcId,
                'npc',
                nextTick,
                submittedAt,
                {
                  npcId: decision.npcId,
                  tileId: decision.tileId,
                  buildingId: decision.buildingId,
                  duration: decision.duration,
                  goldCost: decision.goldCost,
                  motivation,
                  narration: `${profile?.name.zh ?? event.npcId}承接${motivation.projectPurpose}，在${event.tile}支付 ${decision.goldCost} 金開一處新建案 ${decision.buildingId}，預計 ${decision.duration} tick 完工。`
                }
              )
            )
          }
        }
        // v0.15.47: advance any open NPC-initiated project on this tile
        for (const project of Object.values(this.lifeExpansion.constructionProjects)) {
          if (project.completedAtTick !== null) continue
          if (project.projectId === SALT_MARSH_PROJECT_ID) continue
          if (project.targetTileId !== event.tile) continue
          const delta = productiveDeltaWithNpcSkill(this.lifeExpansion, {
            npcId: event.npcId,
            domain: event.domain,
            baseDelta: event.domain === 'build' ? 2 : 1
          })
          const projectName = profile?.name.zh ?? event.npcId
          const tileName = TILE_NAME_BY_ID[event.tile] ?? event.tile
          const progressAfter = Math.min(project.targetProgress, project.progress + delta)
          commands.push(
            makeLivingWorldCommand(
              'CONSTRUCTION_PROJECT_PROGRESS',
              event.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                projectId: project.projectId,
                kind: project.kind,
                targetTileId: project.targetTileId,
                buildingId: project.buildingId,
                npcId: event.npcId,
                delta,
                progressAfter,
                targetProgress: project.targetProgress,
                narration: `${projectName}在${tileName}的自主建案進度前進 ${delta}（${progressAfter}/${project.targetProgress}）。`
              }
            )
          )
          if (progressAfter >= project.targetProgress) {
            commands.push(
              makeLivingWorldCommand(
                'BUILDING_CONSTRUCTED',
                SIM_ACTOR_WORLD,
                'system',
                nextTick,
                submittedAt,
                {
                  projectId: project.projectId,
                  buildingId: project.buildingId,
                  tileId: project.targetTileId,
                  narration: `${projectName}在${tileName}的自主建案 ${project.buildingId} 完工。`
                }
              )
            )
          }
        }
      } else if (event.kind === 'interact') {
        const [a, b] = event.participants
        commands.push(
          makeLivingWorldCommand(
            'NPC_INTERACT',
            a,
            'npc',
            nextTick,
            submittedAt,
            {
              tile: event.tile,
              participants: [a, b],
              positions: event.positions,
              mode: event.mode,
              motivation: makeMotivation(
                event.mode === 'argue'
                  ? '兩位 NPC 同處一地，派系、資源或情緒壓力浮上檯面，因此互動變成爭執。'
                  : '兩位 NPC 同處一地，透過交談交換情報、協調關係或維持日常社交網絡。'
              ),
              narration: event.narration
            }
          )
        )
      }
    }
    for (const command of this.planHouseholdCommands(nextTick, submittedAt)) {
      commands.push(command)
    }
    for (const command of this.planLifeGoalCommands(nextTick, submittedAt)) {
      commands.push(command)
    }
    // Phase 1 §33.2 — NPC state now persists through typed
    // NPC_STATE_RECORDED events + NpcStateProjection. Legacy npc.state.*
    // FACT_SET facts remain boot fallback for pre-migration event logs.
    for (const change of npcResult.changedStates) {
      commands.push(
        this.makeNpcStateRecordedCommand(change, nextTick, submittedAt)
      )
    }

    // ---- BuildingRuntime：reconcile 室內 NPC 狀態 ----
    const npcSnapshot = this.npcEngine.snapshotAll()
    const buildingDeltas = this.buildingRuntime.reconcile(npcSnapshot, this.completedConstructionBuildingDefs())
    for (const delta of buildingDeltas) {
      const profile = this.profiles.find((p) => p.id === delta.npcId)
      const name = profile?.name.zh ?? delta.npcId
      if (delta.to !== null) {
        const def = this.findRuntimeBuildingById(delta.to)
        if (def) {
          commands.push(
            makeLivingWorldCommand(
              'BUILDING_ENTER',
              delta.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                npcId: delta.npcId,
                buildingId: delta.to,
                tileId: def.tileId,
                motivation: makeMotivation(`${name}因工作、休息、交易或路線目的進入${def.nameZh}，室內 presence 由同一份 server 狀態投影。`),
                narration: `${name}走進了${def.nameZh}。`
              }
            )
          )
        }
      } else if (delta.from !== null) {
        const def = this.findRuntimeBuildingById(delta.from)
        if (def) {
          commands.push(
            makeLivingWorldCommand(
              'BUILDING_LEAVE',
              delta.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                npcId: delta.npcId,
                buildingId: delta.from,
                tileId: def.tileId,
                motivation: makeMotivation(`${name}在${def.nameZh}的室內任務結束或下一段行程開始，因此離開建築回到區域流動。`),
                narration: `${name}從${def.nameZh}走了出來。`
              }
            )
          )
        }
      }
    }
    if (buildingDeltas.length > 0) {
      stateDrafts.push(
        this.factSetDraft(
          FACT_BUILDING_OCCUPANTS,
          this.buildingRuntime.toJSON(),
          SIM_ACTOR_WORLD,
          nextTick
        )
      )
    }

    // ---- Phase E0.2: deterministic wildlife spawning ----
    // Routine animal spawns are typed EventLog truth and projection material,
    // not public narration. The planner evaluates one active eligible tile per
    // cadence tick so ecosystem work remains budget-bounded.
    for (const spawn of planAnimalSpawns({
      tick: nextTick,
      tiles: listMapTiles(this.lifeExpansion.unlockedTileIds),
      getPopulation: (speciesId, tileId) => this.animalPopulationProjection.countSpeciesOnTile(speciesId, tileId),
    })) {
      const tileName = TILE_NAME_BY_ID[spawn.animal.tileId] ?? spawn.animal.tileId
      commands.push(
        makeLivingWorldCommand(
          'ANIMAL_SPAWNED',
          SIM_ACTOR_WORLD,
          'system',
          nextTick,
          submittedAt,
          {
            animal: spawn.animal,
            spawnedAtTick: spawn.spawnedAtTick,
            motivation: makeMotivation(
              `${spawn.animal.speciesId} spawned on ${tileName} by deterministic Layer 2.5 biome policy.`
            ),
            narration: null,
          }
        )
      )
    }

    // ---- AreaState engine：每 tile 派系 / 資源演化 ----
    const areaResult = this.areaEngine.tick(nextTick, {
      weather: this.weather,
      npcStates: npcSnapshot,
      npcFactionLean: this.npcFactionLean
    })
    for (const next of areaResult.changed) {
      stateDrafts.push(
        this.factSetDraft(`${AREA_STATE_PREFIX}${next.tileId}`, next, SIM_ACTOR_WORLD, nextTick)
      )
    }
    for (const pe of areaResult.pressureEvents) {
      const agenda = this.worldAgendaFor(pe.tileId, nextTick)
      commands.push(
        makeLivingWorldCommand(
          'AREA_PRESSURE',
          SIM_ACTOR_WORLD,
          'system',
          nextTick,
          submittedAt,
          {
            tileId: pe.tileId,
            kind: pe.kind,
            detail: pe.detail,
            motivation: makeMotivation(`${agenda.sponsorZh}把${agenda.scopeNameZh}列入「${agenda.directiveZh}」；${areaPressureMotivation(pe.kind)} 這不是單一事件的孤立警報，而是上位指令調整街區資源與派系部署的依據。`, `上位指令 ${agenda.id}`),
            narration: pe.narration
          }
        )
      )
    }

    // ---- 天氣 / 季節 / 稀有窗口 / 世界事件 ----
    if (nextTick % WEATHER_CADENCE_TICKS === 0) {
      const next = pickFromCycle(WEATHERS, Math.floor(nextTick / WEATHER_CADENCE_TICKS))
      if (next !== this.weather) {
        const before = this.weather
        stateDrafts.push(this.factSetDraft(FACT_WEATHER, next, SIM_ACTOR_WORLD, nextTick))
        commands.push(
          makeLivingWorldCommand(
            'WEATHER_CHANGE',
            SIM_ACTOR_WORLD,
            'system',
            nextTick,
            submittedAt,
            {
              from: before,
              to: next,
              motivation: makeMotivation('世界天氣週期推進到新的階段，後續會影響 NPC 行為、區域狀態與事件生成。'),
              narration: `天空從${before}轉為${next}。`
            }
          )
        )
        this.weather = next
      }
    }

    if (nextTick % SEASON_CADENCE_TICKS === 0) {
      const next = pickFromCycle(SEASONS, Math.floor(nextTick / SEASON_CADENCE_TICKS))
      if (next !== this.season) {
        const before = this.season
        stateDrafts.push(this.factSetDraft(FACT_SEASON, next, SIM_ACTOR_WORLD, nextTick))
        commands.push(
          makeLivingWorldCommand(
            'SEASON_CHANGE',
            SIM_ACTOR_WORLD,
            'system',
            nextTick,
            submittedAt,
            {
              from: before,
              to: next,
              motivation: makeMotivation('世界季節週期推進到新的階段，作為長週期背景壓力影響城市生活。'),
              narration: `${before}悄然遠去，${next}降臨貪婪之島。`
            }
          )
        )
        this.season = next
      }
    }

    const phase = nextTick % RARE_WINDOW_PERIOD_TICKS
    if (phase === 0 && !this.rareWindowOpen) {
      this.rareWindowOpen = true
      this.rareWindowClosesAtTick = nextTick + RARE_WINDOW_OPEN_TICKS
      stateDrafts.push(
        this.factSetDraft(
          FACT_RARE_WINDOW,
          { open: true, closesAt: this.rareWindowClosesAtTick },
          SIM_ACTOR_WORLD,
          nextTick
        )
      )
      commands.push(
        makeLivingWorldCommand(
          'RARE_WINDOW_OPEN',
          SIM_ACTOR_WORLD,
          'system',
          nextTick,
          submittedAt,
          {
            windowId: 'tide_festival',
            closesAtTick: this.rareWindowClosesAtTick,
            motivation: makeMotivation('稀有窗口依世界週期開啟，短時間改變卡牌與城市事件機會。'),
            narration: '潮汐節的窗口開啟了，碼頭區會在二十分鐘內進入慶典。'
          }
        )
      )
    } else if (this.rareWindowOpen && nextTick >= this.rareWindowClosesAtTick) {
      this.rareWindowOpen = false
      stateDrafts.push(
        this.factSetDraft(FACT_RARE_WINDOW, { open: false, closesAt: null }, SIM_ACTOR_WORLD, nextTick)
      )
      commands.push(
        makeLivingWorldCommand(
          'RARE_WINDOW_CLOSE',
          SIM_ACTOR_WORLD,
          'system',
          nextTick,
          submittedAt,
          {
            windowId: 'tide_festival',
            motivation: makeMotivation('稀有窗口時間耗盡，世界回到日常生成規則。'),
            narration: '潮汐節的窗口悄然閉合，碼頭區回歸日常喧囂。'
          }
        )
      )
    }

    const eventDelta = this.eventEngine.tick(nextTick, {
      weather: this.weather,
      season: this.season
    })
    if (eventDelta.spawned.length > 0 || eventDelta.expired.length > 0) {
      stateDrafts.push(this.factSetDraft(FACT_ACTIVE_EVENTS, eventDelta.active, SIM_ACTOR_WORLD, nextTick))
      for (const event of eventDelta.spawned) {
        commands.push(
          makeLivingWorldCommand(
            'WORLD_EVENT_SPAWN',
            SIM_ACTOR_WORLD,
            'system',
            nextTick,
            submittedAt,
            {
              worldEventId: event.id,
              templateId: event.templateId,
              type: event.type,
              scope: stringifyScope(event.scope),
              endsAtTick: event.endsAtTick,
              motivation: makeMotivation('世界事件引擎依照時間、地區與模板條件觸發事件，讓城市承受非 NPC 個體行為的外部壓力。'),
              narration: event.text.zh,
              data: event.payload as Record<string, unknown>
            }
          )
        )
        // 非阻塞：AI 增強敘事仍走 in-memory NarrativeEvent，不寫 EventLog
        const ambient = this.ambientNarrator
        if (ambient) {
          void ambient
            .narrateWorldEvent(event)
            .then((res) => {
              if (res.source !== 'ai') return
              const enhanced: NarrativeEvent = {
                sequence: this.lastSequence + 0.5,
                tick: nextTick,
                eventType: 'WORLD_EVENT_AI_NARRATION',
                actorId: SIM_ACTOR_WORLD,
                occurredAt: new Date().toISOString(),
                payload: {
                  worldEventId: event.id,
                  templateId: event.templateId
                },
                narration: res.text
              }
              this.pushRecent(enhanced)
              for (const listener of this.listeners) {
                try {
                  listener(enhanced)
                } catch {
                  // ignore
                }
              }
            })
            .catch(() => {})
        }
      }
      for (const event of eventDelta.expired) {
        commands.push(
          makeLivingWorldCommand(
            'WORLD_EVENT_END',
            SIM_ACTOR_WORLD,
            'system',
            nextTick,
            submittedAt,
            {
              worldEventId: event.id,
              templateId: event.templateId,
              type: event.type,
              scope: stringifyScope(event.scope),
              motivation: makeMotivation('世界事件達到結束 tick，暫時性壓力或窗口從 active projection 中移除。')
            }
          )
        )
      }
    }

    // ---- Phase 1 §33.4: Settlement formation detection ----
    // After all NPC state updates have been queued, look at where NPCs
    // currently sit (outdoor, non-moving) and detect any tile whose
    // cohort has sustained co-presence past the threshold. Each detection
    // becomes a SETTLEMENT_FORMED command flowing through the Rule Engine
    // like any other living-world command.
    const outdoorByTile = this.buildingRuntime.npcsOutsideOnTile(
      this.npcEngine.snapshotAll(),
      this.completedConstructionBuildingDefs()
    )
    const settlementDetection = detectSettlementFormation({
      npcsByTile: outdoorByTile,
      previousHistory: this.settlementCopresenceHistory,
      existingSettlementTiles: this.settlementsProjection.getTilesWithSettlement(),
      tick: nextTick,
    })
    this.settlementCopresenceHistory = settlementDetection.nextHistory
    for (const detection of settlementDetection.detections) {
      const settlementId = deriveSettlementId(detection)
      const founderNames = detection.founderNpcIds
        .map((id) => this.profiles.find((p) => p.id === id)?.name.zh ?? id)
        .slice(0, 3)
      const tileName = TILE_NAME_BY_ID[detection.tileId] ?? detection.tileId
      commands.push(
        makeLivingWorldCommand(
          'SETTLEMENT_FORMED',
          'system',
          'system',
          nextTick,
          submittedAt,
          {
            settlementId,
            tileId: detection.tileId,
            formedAtTick: detection.formedAtTick,
            founderNpcIds: detection.founderNpcIds,
            motivation: makeMotivation(
              `${founderNames.join('、')} 等 ${detection.founderNpcIds.length} 位 NPC 已連續在 ${tileName} 聚集達門檻，自然形成新聚落。`
            ),
            narration: `${tileName} 出現新聚落 — ${founderNames.join('、')} 為奠基成員。`,
          }
        )
      )
    }

    for (const production of planGoodsProduction({
      inventory: this.goodsInventoryProjection.list(),
      plannedRecipeIds: plannedProductionRecipeIds,
    })) {
      const recipe = production.recipe
      plannedProductionRecipeIds.add(recipe.recipeId)
      commands.push(
        makeLivingWorldCommand(
          'GOODS_PROCESSED',
          recipe.holderId,
          'system',
          nextTick,
          submittedAt,
          {
            recipeId: recipe.recipeId,
            inputGoodsId: recipe.inputGoodsId,
            inputQuantity: recipe.inputQuantity,
            outputGoodsId: recipe.outputGoodsId,
            outputQuantity: recipe.outputQuantity,
            holderType: recipe.holderType,
            holderId: recipe.holderId,
            tileId: recipe.tileId,
            processedAtTick: nextTick,
            motivation: makeMotivation(
              `中央聚落已有足量 ${recipe.inputGoodsId}，生產鏈依固定配方 ${recipe.recipeId} 將原料轉成 ${recipe.outputGoodsId}。`,
              'Phase 2 §35.3 production chain'
            ),
            narration: `${recipe.holderId}把 ${recipe.inputQuantity} 份 ${recipe.inputGoodsId} 加工成 ${recipe.outputQuantity} 份 ${recipe.outputGoodsId}。`
          }
        )
      )
    }

    for (const price of discoverMarketPrices({ inventory: this.goodsInventoryProjection.list() })) {
      const currentPrice = this.marketPricesProjection.get({ settlementId: price.settlementId, goodsId: price.goodsId })
      if (
        currentPrice &&
        currentPrice.supplyQuantity === price.supplyQuantity &&
        currentPrice.demandQuantity === price.demandQuantity &&
        currentPrice.priceGold === price.priceGold
      ) continue
      commands.push(
        makeLivingWorldCommand(
          'MARKET_PRICE_DISCOVERED',
          price.marketId,
          'system',
          nextTick,
          submittedAt,
          {
            marketId: price.marketId,
            settlementId: price.settlementId,
            goodsId: price.goodsId,
            supplyQuantity: price.supplyQuantity,
            demandQuantity: price.demandQuantity,
            priceGold: price.priceGold,
            discoveredAtTick: nextTick,
            motivation: makeMotivation(
              `${price.settlementId} 的 ${price.goodsId} 供給為 ${price.supplyQuantity}、基準需求為 ${price.demandQuantity}，市場投影據此形成 ${price.priceGold} 金價格。`,
              'Phase 2 §35.4 market formation'
            ),
            narration: `${price.marketId} 形成 ${price.goodsId} 價格：${price.priceGold} 金。`
          }
        )
      )
    }

    // ---- Phase 1 budget gate ----
    // Slice 1 (observability): record raw command volume, update peak,
    // warn once per tick when over the soft cap.
    // Slice 2 (deterministic hard-cap rejection): if the raw count
    // exceeds the hard cap, sort commands by canonical commandId and
    // slice the first N; the overflow is recorded in
    // rejected_command_log with code COMMAND_CAP_EXCEEDED. Rejected
    // commands NEVER become world Events — rejected_command_log is
    // explicitly excluded from WorldState reduction (ARCHITECTURE.md §6,
    // §11.6). Replay determinism: identical inputs produce identical
    // kept/rejected partitions because commandId is a content hash.
    const rawCommandCount = commands.length
    if (rawCommandCount > this.peakTickCommandCount) {
      this.peakTickCommandCount = rawCommandCount
    }
    if (rawCommandCount > MAX_COMMANDS_PER_TICK_SOFT_CAP) {
      this.softCapHitCount += 1
      console.warn(
        `[sim] tick ${nextTick} produced ${rawCommandCount} commands ` +
          `(soft cap ${MAX_COMMANDS_PER_TICK_SOFT_CAP}); ` +
          `softCapHitCount=${this.softCapHitCount}`
      )
    }
    const partition = applyCommandHardCap(commands, MAX_COMMANDS_PER_TICK_HARD_CAP)
    if (partition.rejected.length > 0) {
      this.hardCapRejectedSinceBoot += partition.rejected.length
      console.warn(
        `[sim] tick ${nextTick} hit hard cap: ${rawCommandCount} > ${MAX_COMMANDS_PER_TICK_HARD_CAP}; ` +
          `rejecting ${partition.rejected.length} command(s); ` +
          `hardCapRejectedSinceBoot=${this.hardCapRejectedSinceBoot}`
      )
      for (const overflow of partition.rejected) {
        this.store.recordRejectedCommand(
          overflow,
          {
            commandId: overflow.commandId,
            commandType: overflow.commandType,
            actorId: overflow.actorId,
            code: COMMAND_CAP_REJECTION_CODE,
            reason: `per-tick hard cap ${MAX_COMMANDS_PER_TICK_HARD_CAP} exceeded; overflow rejected by deterministic commandId sort`,
            details: { rawCommandCount, hardCap: MAX_COMMANDS_PER_TICK_HARD_CAP, tick: nextTick },
          }
        )
      }
    }
    const acceptedCommands = partition.kept
    this.lastTickCommandCount = acceptedCommands.length

    // ---- Compile commands → typed event drafts via the Rule Engine ----
    const typedDrafts: EventDraft[] = []
    const postAcceptedStateDrafts: EventDraft[] = []
    const postAcceptedCommands: LivingWorldCommand[] = []
    let lifeExpansionChanged = false
    for (const cmd of acceptedCommands) {
      const result = this.livingWorldRuleEngine.evaluate(cmd)
      if (result.accepted) {
        for (const draft of result.events) typedDrafts.push(draft as EventDraft)
        if (cmd.commandType === 'CONSTRUCTION_INITIATE') {
          const payload = cmd.payload as {
            npcId: string
            tileId: string
            buildingId: string
            duration: number
            goldCost?: number
          }
          this.lifeExpansion = withConstructionInitiated(this.lifeExpansion, {
            npcId: payload.npcId,
            tileId: payload.tileId,
            buildingId: payload.buildingId,
            duration: payload.duration,
            ...(payload.goldCost !== undefined ? { goldCost: payload.goldCost } : {}),
            tick: nextTick
          })
          lifeExpansionChanged = true
        } else if (cmd.commandType === 'NPC_PRODUCTIVE_ACTION') {
          const payload = cmd.payload as {
            npcId: string
            domain: 'build' | 'learn' | 'trade' | 'service'
            delta: number
          }
          this.lifeExpansion = withNpcProductiveActionRecorded(this.lifeExpansion, {
            npcId: payload.npcId,
            domain: payload.domain,
            delta: payload.delta,
            tick: nextTick
          })
          lifeExpansionChanged = true
        } else if (cmd.commandType === 'CONSTRUCTION_PROJECT_PROGRESS') {
          const payload = cmd.payload as { delta: number; projectId?: string }
          this.lifeExpansion = withConstructionProgress(this.lifeExpansion, {
            tick: nextTick,
            delta: payload.delta,
            ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {})
          })
          lifeExpansionChanged = true
        } else if (cmd.commandType === 'MAP_TILE_UNLOCKED' || cmd.commandType === 'BUILDING_CONSTRUCTED') {
          this.lifeExpansion = withUnlockedExpansion(this.lifeExpansion)
          lifeExpansionChanged = true
        } else if (cmd.commandType === 'NPC_HOUSEHOLD_FORMED') {
          const payload = cmd.payload as { householdId: string; partnerNpcIds: readonly [string, string]; homeTileId: string }
          this.lifeExpansion = withHouseholdFormed(this.lifeExpansion, {
            householdId: payload.householdId,
            partnerNpcIds: payload.partnerNpcIds,
            homeTileId: payload.homeTileId,
            tick: nextTick
          })
          lifeExpansionChanged = true
        } else if (cmd.commandType === 'NPC_CHILD_BORN') {
          const payload = cmd.payload as { householdId: string; childId: string; nameZh: string; nameEn: string }
          this.lifeExpansion = withChildBorn(this.lifeExpansion, {
            householdId: payload.householdId,
            childId: payload.childId,
            nameZh: payload.nameZh,
            nameEn: payload.nameEn,
            tick: nextTick
          })
          lifeExpansionChanged = true
        } else if (cmd.commandType === 'MEAT_HARVESTED') {
          const payload = cmd.payload as { npcId: string; quantity: number; goldValue: number }
          this.lifeExpansion = withMeatHarvestedRecorded(this.lifeExpansion, {
            npcId: payload.npcId,
            quantity: payload.quantity,
            goldValue: payload.goldValue,
            tick: nextTick
          })
          lifeExpansionChanged = true
          const goodsPayload = cmd.payload as { huntId: string; npcId: string; quantity: number; tileId: string; motivation?: unknown }
          const motivation = isEventMotivation(goodsPayload.motivation) ? goodsPayload.motivation : undefined
          postAcceptedCommands.push(
            makeLivingWorldCommand(
              'GOODS_EXTRACTED',
              goodsPayload.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                goodsId: 'meat',
                quantity: goodsPayload.quantity,
                sourceEventType: 'MEAT_HARVESTED',
                sourceId: goodsPayload.huntId,
                sourceTileId: goodsPayload.tileId,
                extractedByNpcId: goodsPayload.npcId,
                extractedAtTick: nextTick,
                ...(motivation ? { motivation } : {}),
                narration: `${goodsPayload.npcId}取得 ${goodsPayload.quantity} 份 meat goods。`
              }
            ),
            makeLivingWorldCommand(
              'GOODS_STORED',
              goodsPayload.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                goodsId: 'meat',
                quantity: goodsPayload.quantity,
                holderType: 'npc',
                holderId: goodsPayload.npcId,
                tileId: goodsPayload.tileId,
                storedAtTick: nextTick,
                ...(motivation ? { motivation } : {}),
                narration: `${goodsPayload.npcId}把 ${goodsPayload.quantity} 份 meat 存入個人貨物。`
              }
            )
          )
          postAcceptedCommands.push(...this.planGoodsLogisticsCommands({
            goodsId: 'meat',
            quantity: goodsPayload.quantity,
            sourceHolderType: 'npc',
            sourceHolderId: goodsPayload.npcId,
            sourceTileId: goodsPayload.tileId,
            carrierNpcId: goodsPayload.npcId,
            tick: nextTick,
            submittedAt,
            activeEvents: eventDelta.active,
            motivation,
            plannedRouteIds,
          }))
        } else if (cmd.commandType === 'FISHERY_HARVESTED') {
          const goodsPayload = cmd.payload as { npcId: string; delta: number; tileId: string; harvestedAtTick: number; motivation?: unknown }
          const motivation = isEventMotivation(goodsPayload.motivation) ? goodsPayload.motivation : undefined
          const sourceId = `fishery:${goodsPayload.tileId}:${goodsPayload.harvestedAtTick}:${goodsPayload.npcId}`
          postAcceptedCommands.push(
            makeLivingWorldCommand(
              'GOODS_EXTRACTED',
              goodsPayload.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                goodsId: 'fish',
                quantity: goodsPayload.delta,
                sourceEventType: 'FISHERY_HARVESTED',
                sourceId,
                sourceTileId: goodsPayload.tileId,
                extractedByNpcId: goodsPayload.npcId,
                extractedAtTick: nextTick,
                ...(motivation ? { motivation } : {}),
                narration: `${goodsPayload.npcId}取得 ${goodsPayload.delta} 份 fish goods。`
              }
            ),
            makeLivingWorldCommand(
              'GOODS_STORED',
              goodsPayload.npcId,
              'npc',
              nextTick,
              submittedAt,
              {
                goodsId: 'fish',
                quantity: goodsPayload.delta,
                holderType: 'npc',
                holderId: goodsPayload.npcId,
                tileId: goodsPayload.tileId,
                storedAtTick: nextTick,
                ...(motivation ? { motivation } : {}),
                narration: `${goodsPayload.npcId}把 ${goodsPayload.delta} 份 fish 存入個人貨物。`
              }
            )
          )
          postAcceptedCommands.push(...this.planGoodsLogisticsCommands({
            goodsId: 'fish',
            quantity: goodsPayload.delta,
            sourceHolderType: 'npc',
            sourceHolderId: goodsPayload.npcId,
            sourceTileId: goodsPayload.tileId,
            carrierNpcId: goodsPayload.npcId,
            tick: nextTick,
            submittedAt,
            activeEvents: eventDelta.active,
            motivation,
            plannedRouteIds,
          }))
        }
        if (cmd.commandType === 'NPC_INTERACT') {
          const accepted = readAcceptedNpcInteraction(cmd.payload)
          if (accepted) {
            for (const change of this.npcEngine.commitSocialInteractionTask(
              accepted.participants,
              accepted.tile,
              accepted.mode,
              nextTick
            )) {
              postAcceptedCommands.push(
                this.makeNpcStateRecordedCommand(change, nextTick, submittedAt)
              )
            }
          }
        }
      } else {
        console.warn(
          `[sim] rule engine rejected ${result.rejection.commandType} ` +
            `from ${result.rejection.actorId}: ${result.rejection.reason}`
        )
      }
    }
    if (lifeExpansionChanged) {
      postAcceptedStateDrafts.push(
        this.factSetDraft(LIFE_EXPANSION_FACT_KEY, this.lifeExpansion, SIM_ACTOR_WORLD, nextTick)
      )
    }

    for (const cmd of postAcceptedCommands) {
      const result = this.livingWorldRuleEngine.evaluate(cmd)
      if (result.accepted) {
        for (const draft of result.events) typedDrafts.push(draft as EventDraft)
      } else {
        console.warn(
          `[sim] rule engine rejected ${result.rejection.commandType} ` +
            `from ${result.rejection.actorId}: ${result.rejection.reason}`
        )
      }
    }

    // Append in one transaction. Normal state snapshots stay before typed events;
    // state that depends on an accepted typed command (for example NPC social
    // active-task metadata) is appended after the accepted event draft.
    const committed = this.store.appendEvents([...stateDrafts, ...typedDrafts, ...postAcceptedStateDrafts])
    if (committed.length > 0) {
      this.lastSequence = committed[committed.length - 1]!.sequence
      this.eventCount += committed.length
      // Fan out: NPC memory + relationships projections, listeners.
      for (const ev of committed) {
        if (this.npcMemory) this.npcMemory.project(ev)
        if (this.npcRelationships) this.npcRelationships.project(ev)
        this.constructionProjects.project(ev)
        this.npcStateProjection.project(ev)
        this.animalPopulationProjection.project(ev)
        this.fisheryDensityProjection.project(ev)
        this.goodsInventoryProjection.project(ev)
        this.logisticsProjection.project(ev)
        this.marketPricesProjection.project(ev)
        this.productionChainsProjection.project(ev)
        this.settlementsProjection.project(ev)

        const narrativeEvent = readNarrativeFromAnyEvent(ev, nextTick)
        if (narrativeEvent) {
          this.pushRecent(narrativeEvent)
          for (const listener of this.listeners) {
            try {
              listener(narrativeEvent)
            } catch (err) {
              console.error('[sim] listener error', err)
            }
          }
        }
      }
    }

    this.currentTick = nextTick

    for (const tl of this.tickListeners) {
      try {
        tl(nextTick)
      } catch (err) {
        console.error('[sim] tick listener error', err)
      }
    }
  }

  /**
   * Build a state-snapshot Event draft by routing a SET_FACT Command
   * through the KernelRuleEngine, then re-hashing the deterministic
   * key with the simulation tick so different-tick same-value entries
   * remain distinct events. This is the only path the runtime uses
   * to write FACT_SET state snapshots — direct draft construction is
   * forbidden per ARCHITECTURE.md §4.
   *
   * Wall-clock `submittedAt` is audit-only and does not participate
   * in the deterministic key.
   */
  private makeNpcStateRecordedCommand(
    change: NpcStateChange,
    tick: number,
    submittedAt: number
  ): LivingWorldCommand {
    return makeLivingWorldCommand(
      'NPC_STATE_RECORDED',
      change.npcId,
      'npc',
      tick,
      submittedAt,
      {
        npcId: change.npcId,
        state: { ...change.state },
        narration: 'internal npc state projection'
      }
    )
  }

  private factSetDraft(
    key: string,
    value: unknown,
    actorId: string,
    tick: number
  ): EventDraft<FactSetPayload> {
    const payload: FactSetPayload = { key, value }
    const commandIdSeed = { commandType: COMMAND_SET_FACT, actorId, tick, payload }
    const commandId = `cmd_${hashCanonicalJson(commandIdSeed).slice(0, 32)}`
    const cmd: Command<FactSetPayload> = {
      commandId,
      commandType: COMMAND_SET_FACT,
      actorId,
      submittedAt: Date.now(),
      payload
    }
    const result = this.kernelRuleEngine.evaluate(cmd, {
      worldState: createInitialWorldState()
    })
    if (!result.accepted) {
      throw new Error(
        `[sim] kernel rejected SET_FACT key=${key}: ${result.rejection.reason}`
      )
    }
    const base = result.events[0] as EventDraft<FactSetPayload>
    // KernelRuleEngine has no concept of simulation tick. Re-hash the
    // event seed with tick included so two same-(key,value) writes at
    // different ticks produce different deterministic keys.
    const seed = {
      eventType: EVENT_FACT_SET,
      actorId,
      commandId,
      tick,
      payload,
      rulesetVersion: base.rulesetVersion ?? DEFAULT_RULESET_VERSION,
      version: base.version
    }
    const deterministicKey = hashCanonicalJson(seed)
    return {
      ...base,
      tick,
      eventId: `event_${deterministicKey.slice(0, 32)}`,
      deterministicKey
    }
  }

  private deriveRelationshipScore(profile: NpcProfile): number {
    const base = typeof profile.personality.trustBase === 'number' ? profile.personality.trustBase : 50
    return base
  }

  private pushRecent(event: NarrativeEvent): void {
    this.recentEvents.push(event)
    if (this.recentEvents.length > RECENT_EVENTS_BUFFER) {
      this.recentEvents.splice(0, this.recentEvents.length - RECENT_EVENTS_BUFFER)
    }
  }

  private planHouseholdCommands(nextTick: number, submittedAt: number): LivingWorldCommand[] {
    const commands: LivingWorldCommand[] = []
    const households = Object.values(this.lifeExpansion.households)
    if (nextTick % 30 === 0) {
      const candidates = this.profiles
        .map((profile) => ({ profile, state: this.npcEngine.getState(profile.id) }))
        .filter((item): item is { profile: NpcProfile; state: NpcRuntimeState } => item.state !== null)
        .filter((item) => !householdIdForNpc(this.lifeExpansion, item.profile.id))
        .sort((a, b) => a.profile.id.localeCompare(b.profile.id))
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          const a = candidates[i]!
          const b = candidates[j]!
          if (a.state.tile !== b.state.tile) continue
          const area = this.getAreaState(a.state.tile)
          if (!area || area.resources.food < 50 || area.resources.safety < 50 || area.resources.economy < 45) continue
          const lifeA = deriveNpcLifeView({ profile: a.profile, state: a.state, areaState: area, lifeExpansion: this.lifeExpansion, tick: nextTick })
          const lifeB = deriveNpcLifeView({ profile: b.profile, state: b.state, areaState: area, lifeExpansion: this.lifeExpansion, tick: nextTick })
          if (lifeA.goal.kind !== 'form_family' && lifeB.goal.kind !== 'form_family') continue
          const householdId = `household.${a.profile.id}.${b.profile.id}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
          commands.push(
            makeLivingWorldCommand(
              'NPC_HOUSEHOLD_FORMED',
              householdId,
              'system',
              nextTick,
              submittedAt,
              {
                householdId,
                partnerNpcIds: [a.profile.id, b.profile.id],
                homeTileId: a.state.tile,
                motivation: makeMotivation(
                  `${a.profile.name.zh}與${b.profile.name.zh}在同一區域達到成家條件；食物、安全與經濟門檻足夠，且至少一方的生活目標是建立家庭。`,
                  `穩定 ${TILE_NAME_BY_ID[a.state.tile] ?? a.state.tile} 的家庭與照護網絡`
                ),
                narration: `${a.profile.name.zh}和${b.profile.name.zh}決定合組家庭，把生活壓力變成共同計畫。`
              }
            )
          )
          return commands
        }
      }
    }

    for (const household of households) {
      if (household.childIds.length > 0) continue
      if (nextTick - household.formedAtTick < 90) continue
      const childId = `${household.householdId}.child.1`
      commands.push(
        makeLivingWorldCommand(
          'NPC_CHILD_BORN',
          childId,
          'system',
          nextTick,
          submittedAt,
          {
            householdId: household.householdId,
            childId,
            nameZh: '潮生',
            nameEn: 'Tideborn',
            motivation: makeMotivation('既有家庭經過足夠時間後新增被照顧者，讓人口壓力與家庭責任進入世界狀態。'),
            narration: '一個孩子在新的家庭裡出生，潮鳴市多了一份必須被照顧的未來。'
          }
        )
      )
      return commands
    }
    return commands
  }

  private planLifeGoalCommands(nextTick: number, submittedAt: number): LivingWorldCommand[] {
    if (nextTick % 30 !== 0) return []
    return this.profiles
      .map((profile) => {
        const state = this.npcEngine.getState(profile.id)
        if (!state) return null
        const life = deriveNpcLifeView({
          profile,
          state,
          areaState: this.getAreaState(state.tile),
          lifeExpansion: this.lifeExpansion,
          tick: nextTick
        })
        return { profile, state, life }
      })
      .filter((item): item is { profile: NpcProfile; state: NpcRuntimeState; life: NpcLifeView } => item !== null)
      .sort((a, b) => b.life.goal.pressure - a.life.goal.pressure || a.profile.id.localeCompare(b.profile.id))
      .slice(0, 8)
      .map(({ profile, state, life }) => {
        const agenda = this.worldAgendaFor(state.tile, nextTick)
        return makeLivingWorldCommand(
          'NPC_LIFE_GOAL_SET',
          profile.id,
          'npc',
          nextTick,
          submittedAt,
          {
            npcId: profile.id,
            tile: state.tile,
            needs: life.needs,
            goal: life.goal,
            motivation: makeMotivation(
              `上位指令：${agenda.sponsorZh}正在${agenda.scopeNameZh}推動「${agenda.directiveZh}」（${agenda.rationaleZh}）。${profile.name.zh}以${profile.role.zh}身分${roleInterpretationZh(`${profile.role.zh} ${profile.role.en}`, agenda)}，再用自己的食物、休息、收入、住房與安全需求決定眼前目標：「${life.goal.narration}」。`,
              `上位指令 ${agenda.id}；目標壓力 ${life.goal.pressure}`
            ),
            narration: `${profile.name.zh}把眼前生活目標定為：${life.goal.narration}`
          }
        )
      })
  }

  private buildProductiveActionMotivation(
    npcId: string,
    profile: NpcProfile | null,
    state: NpcRuntimeState | null,
    domain: string,
    metric: string,
    tick: number
  ): EventMotivation {
    const fallbackTile = state?.tile ?? profile?.defaultLocation ?? 't_central'
    const fallbackProfile = profile ?? makeFallbackProfile(npcId, fallbackTile)
    const fallbackState = state ?? makeFallbackNpcState(fallbackTile, tick)
    const life = deriveNpcLifeView({
      profile: fallbackProfile,
      state: fallbackState,
      areaState: this.getAreaState(fallbackTile),
      lifeExpansion: this.lifeExpansion,
      tick
    })
    const primary = strongestNeed(life.needs)
    const tileName = TILE_NAME_BY_ID[fallbackTile] ?? fallbackTile
    const purpose = metricPurpose(metric)
    const domainText = productiveDomainText(domain)
    const agenda = this.worldAgendaFor(fallbackTile, tick)
    return makeMotivation(
      `${agenda.sponsorZh}對${agenda.scopeNameZh}的上位指令是「${agenda.directiveZh}」；原因是：${agenda.rationaleZh}${fallbackProfile.name.zh}以${fallbackProfile.role.zh}身分${roleInterpretationZh(`${fallbackProfile.role.zh} ${fallbackProfile.role.en}`, agenda)}，個人最高壓力是${needLabel(primary.key)} ${primary.value}，因此這次${domainText}不是隨機善行，而是對制度壓力的角色回應。`,
      `${purpose}；上位指令 ${agenda.id}`
    )
  }

  private buildSaltMarshConstructionMotivation(
    npcId: string,
    profile: NpcProfile | null,
    state: NpcRuntimeState | null,
    tick: number
  ): ConstructionMotivation {
    const fallbackTile = state?.tile ?? profile?.defaultLocation ?? 't_central'
    const fallbackProfile = profile ?? makeFallbackProfile(npcId, fallbackTile)
    const fallbackState = state ?? makeFallbackNpcState(fallbackTile, tick)
    const life = deriveNpcLifeView({
      profile: fallbackProfile,
      state: fallbackState,
      areaState: this.getAreaState(fallbackTile),
      lifeExpansion: this.lifeExpansion,
      tick
    })
    const primary = strongestNeed(life.needs)
    const sourceTileName = TILE_NAME_BY_ID[fallbackTile] ?? fallbackTile
    const targetTileName = TILE_NAME_BY_ID[SALT_MARSH_TILE_ID] ?? '鹽沼外環'
    const agenda = this.worldAgendaFor(fallbackTile, tick)
    const projectPurpose = `回應上位指令「${agenda.directiveZh}」，把鹽沼外環變成新的住所、巡衛落腳點與補給節點，分散舊街區的住房與安全壓力。`
    return {
      projectPurpose,
      primaryPressure: primary.key,
      pressureScore: Math.max(primary.value, life.goal.pressure),
      sourceGoalKind: life.goal.kind,
      sourceNpcId: npcId,
      sourceTileId: fallbackTile,
      explanation: `上位指令：${agenda.sponsorZh}正在${agenda.scopeNameZh}推動「${agenda.directiveZh}」，原因是：${agenda.rationaleZh}${fallbackProfile.name.zh}以${fallbackProfile.role.zh}身分${roleInterpretationZh(`${fallbackProfile.role.zh} ${fallbackProfile.role.en}`, agenda)}；他在${sourceTileName}的個人目標是「${life.goal.narration}」，${needLabel(primary.key)}壓力 ${primary.value}，所以${targetTileName}拓荒站成為可被執行的制度工程。`
    }
  }

  private buildAutonomousConstructionMotivation(
    npcId: string,
    profile: NpcProfile | null,
    state: NpcRuntimeState | null,
    targetTileId: string,
    goldCost: number,
    tick: number
  ): ConstructionMotivation {
    const fallbackTile = state?.tile ?? targetTileId
    const fallbackProfile = profile ?? makeFallbackProfile(npcId, fallbackTile)
    const fallbackState = state ?? makeFallbackNpcState(fallbackTile, tick)
    const life = deriveNpcLifeView({
      profile: fallbackProfile,
      state: fallbackState,
      areaState: this.getAreaState(targetTileId),
      lifeExpansion: this.lifeExpansion,
      tick
    })
    const primary = strongestNeed(life.needs)
    const agenda = this.worldAgendaFor(targetTileId, tick)
    const targetTileName = TILE_NAME_BY_ID[targetTileId] ?? targetTileId
    return {
      projectPurpose: `${agenda.sponsorZh}的「${agenda.directiveZh}」`,
      primaryPressure: primary.key,
      pressureScore: Math.max(primary.value, life.goal.pressure, agenda.pressureScore),
      sourceGoalKind: life.goal.kind,
      sourceNpcId: npcId,
      sourceTileId: targetTileId,
      explanation: `上位指令：${agenda.sponsorZh}把${targetTileName}列入「${agenda.directiveZh}」，原因是：${agenda.rationaleZh}${fallbackProfile.name.zh}以${fallbackProfile.role.zh}身分${roleInterpretationZh(`${fallbackProfile.role.zh} ${fallbackProfile.role.en}`, agenda)}，並用自己的 ${goldCost} 金承擔開工成本；個人目標「${life.goal.narration}」只是他願意響應上位指令的原因，不是世界憑空蓋房的原因。`
    }
  }

  private planGoodsLogisticsCommands(input: {
    goodsId: string
    quantity: number
    sourceHolderType: GoodsHolderType
    sourceHolderId: string
    sourceTileId: string
    carrierNpcId: string
    tick: number
    submittedAt: number
    activeEvents: readonly ActiveWorldEvent[]
    motivation?: EventMotivation | undefined
    plannedRouteIds: Set<string>
  }): LivingWorldCommand[] {
    if (input.sourceTileId === 't_central') return []
    if (input.quantity <= 0) return []
    const routeId = tradeRouteId(input.sourceTileId, 't_central', input.goodsId)
    const transportId = goodsTransportId(routeId, input.tick, input.sourceHolderId, input.goodsId)
    const destinationName = TILE_NAME_BY_ID.t_central ?? 't_central'
    const sourceName = TILE_NAME_BY_ID[input.sourceTileId] ?? input.sourceTileId
    const stormActive = isStormActive(input.activeEvents)
    const commands: LivingWorldCommand[] = []

    if (!this.logisticsProjection.isRouteOpen(routeId) && !input.plannedRouteIds.has(routeId)) {
      input.plannedRouteIds.add(routeId)
      commands.push(
        makeLivingWorldCommand(
          'TRADE_ROUTE_OPENED',
          SIM_ACTOR_WORLD,
          'system',
          input.tick,
          input.submittedAt,
          {
            routeId,
            fromTileId: input.sourceTileId,
            toTileId: 't_central',
            goodsId: input.goodsId,
            openedAtTick: input.tick,
            ...(input.motivation ? { motivation: input.motivation } : {}),
            narration: `${sourceName}到${destinationName}的 ${input.goodsId} 貨物流通路線被登記。`
          }
        )
      )
    }

    commands.push(
      makeLivingWorldCommand(
        'GOODS_CONSUMED',
        input.carrierNpcId,
        'npc',
        input.tick,
        input.submittedAt,
        {
          goodsId: input.goodsId,
          quantity: input.quantity,
          holderType: input.sourceHolderType,
          holderId: input.sourceHolderId,
          tileId: input.sourceTileId,
          consumerNpcId: input.carrierNpcId,
          consumedAtTick: input.tick,
          ...(input.motivation ? { motivation: input.motivation } : {}),
          narration: `${input.carrierNpcId}裝載 ${input.quantity} 份 ${input.goodsId}，準備送往${destinationName}。`
        }
      ),
      makeLivingWorldCommand(
        'GOODS_TRANSPORT_STARTED',
        input.carrierNpcId,
        'npc',
        input.tick,
        input.submittedAt,
        {
          transportId,
          routeId,
          goodsId: input.goodsId,
          quantity: input.quantity,
          carrierNpcId: input.carrierNpcId,
          fromHolderType: input.sourceHolderType,
          fromHolderId: input.sourceHolderId,
          fromTileId: input.sourceTileId,
          toHolderType: 'settlement',
          toHolderId: CENTRAL_SETTLEMENT_HOLDER_ID,
          toTileId: 't_central',
          startedAtTick: input.tick,
          ...(input.motivation ? { motivation: input.motivation } : {}),
          narration: `${input.carrierNpcId}從${sourceName}啟運 ${input.quantity} 份 ${input.goodsId}。`
        }
      )
    )

    if (stormActive) {
      commands.push(
        makeLivingWorldCommand(
          'GOODS_TRANSPORT_LOST',
          SIM_ACTOR_WORLD,
          'system',
          input.tick,
          input.submittedAt,
          {
            transportId,
            routeId,
            goodsId: input.goodsId,
            quantity: input.quantity,
            carrierNpcId: input.carrierNpcId,
            fromTileId: input.sourceTileId,
            toTileId: 't_central',
            reason: 'storm',
            lostAtTick: input.tick,
            ...(input.motivation ? { motivation: input.motivation } : {}),
            narration: `暴風雨打斷 ${routeId}，${input.quantity} 份 ${input.goodsId} 在運輸途中遺失。`
          }
        )
      )
      return commands
    }

    commands.push(
      makeLivingWorldCommand(
        'GOODS_TRANSPORT_ARRIVED',
        input.carrierNpcId,
        'npc',
        input.tick,
        input.submittedAt,
        {
          transportId,
          routeId,
          goodsId: input.goodsId,
          quantity: input.quantity,
          carrierNpcId: input.carrierNpcId,
          toHolderType: 'settlement',
          toHolderId: CENTRAL_SETTLEMENT_HOLDER_ID,
          toTileId: 't_central',
          arrivedAtTick: input.tick,
          ...(input.motivation ? { motivation: input.motivation } : {}),
          narration: `${input.carrierNpcId}把 ${input.quantity} 份 ${input.goodsId} 送抵${destinationName}。`
        }
      ),
      makeLivingWorldCommand(
        'GOODS_STORED',
        CENTRAL_SETTLEMENT_HOLDER_ID,
        'system',
        input.tick,
        input.submittedAt,
        {
          goodsId: input.goodsId,
          quantity: input.quantity,
          holderType: 'settlement',
          holderId: CENTRAL_SETTLEMENT_HOLDER_ID,
          tileId: 't_central',
          storedAtTick: input.tick,
          ...(input.motivation ? { motivation: input.motivation } : {}),
          narration: `${destinationName}收到 ${input.quantity} 份 ${input.goodsId}。`
        }
      )
    )
    return commands
  }

  private hydrateFromEventLog(): void {
    const state = this.store.readLatestFactSnapshot()
    // Boot intentionally hydrates only stateful simulation facts needed before
    // the next tick. Add new persisted runtime fact keys here when features rely
    // on them surviving deploy/restart; do not reintroduce full EventLog replay.
    const facts = this.store.readLatestFactValues([
      FACT_WEATHER,
      FACT_SEASON,
      FACT_RARE_WINDOW,
      FACT_ACTIVE_EVENTS,
      FACT_BUILDING_OCCUPANTS,
      LIFE_EXPANSION_FACT_KEY,
      ...this.profiles.map((profile) => `${NPC_STATE_PREFIX}${profile.id}`),
      ...this.profiles.map((profile) => `npc.${profile.id}.location`),
      ...MAP_TILES.map((tile) => `${AREA_STATE_PREFIX}${tile.id}`)
    ])
    this.eventCount = state.eventCount
    this.lastSequence = state.lastSequence
    if (state.eventCount > BOOT_PROJECTION_REBUILD_EVENT_LIMIT) {
      console.warn(
        `[boot] skipped full runtime hydration for ${state.eventCount} events; ` +
          'booting from defaults to keep HTTP available'
      )
    }
    const tickFact = state.facts[FACT_TICK]
    if (typeof tickFact === 'number' && Number.isFinite(tickFact)) {
      this.currentTick = tickFact
    } else if (typeof state.latestTick === 'number' && Number.isFinite(state.latestTick)) {
      // Availability-first boot may skip full fact hydration; still resume from
      // the latest committed tick so deterministic event ids do not collide.
      this.currentTick = state.latestTick
    }
    const weatherFact = facts[FACT_WEATHER]
    if (typeof weatherFact === 'string' && (WEATHERS as readonly string[]).includes(weatherFact)) {
      this.weather = weatherFact
    }
    const seasonFact = facts[FACT_SEASON]
    if (typeof seasonFact === 'string' && (SEASONS as readonly string[]).includes(seasonFact)) {
      this.season = seasonFact
    }
    const rareFact = facts[FACT_RARE_WINDOW]
    if (rareFact && typeof rareFact === 'object' && 'open' in (rareFact as Record<string, unknown>)) {
      const r = rareFact as { open: boolean; closesAt: number | null }
      this.rareWindowOpen = !!r.open
      this.rareWindowClosesAtTick = r.closesAt ?? 0
    }
    if (state.eventCount <= BOOT_PROJECTION_REBUILD_EVENT_LIMIT) {
      const allEvents = this.store.readEvents()
      this.npcStateProjection.rebuildFromEvents(allEvents)
      this.animalPopulationProjection.rebuildFromEvents(allEvents)
      this.fisheryDensityProjection.rebuildFromEvents(allEvents)
      this.goodsInventoryProjection.rebuildFromEvents(allEvents)
      this.logisticsProjection.rebuildFromEvents(allEvents)
      this.marketPricesProjection.rebuildFromEvents(allEvents)
      this.productionChainsProjection.rebuildFromEvents(allEvents)
      this.settlementsProjection.rebuildFromEvents(allEvents)
    }

    // Phase 1 §33.2 — boot hydration now prefers the typed npc_state
    // projection. Legacy npc.state.<id> FACT_SET values remain fallback for
    // older logs that predate NPC_STATE_RECORDED.
    for (const profile of this.profiles) {
      const projected = this.npcStateProjection.getByNpcId(profile.id)
      if (projected) {
        this.npcEngine.hydrate(profile.id, projected.state)
        continue
      }
      const newKey = `${NPC_STATE_PREFIX}${profile.id}`
      const newRaw = facts[newKey]
      if (newRaw) {
        this.npcEngine.hydrate(profile.id, newRaw)
        continue
      }
      const legacyKey = `npc.${profile.id}.location`
      const legacy = facts[legacyKey]
      if (typeof legacy === 'string') {
        this.npcEngine.hydrate(profile.id, { tile: legacy, targetTile: legacy })
      }
    }
    // hydrate area states
    for (const tile of MAP_TILES) {
      const raw = facts[`${AREA_STATE_PREFIX}${tile.id}`]
      if (raw) this.areaEngine.hydrate(tile.id, raw)
    }
    const buildingFact = facts[FACT_BUILDING_OCCUPANTS]
    if (buildingFact) this.buildingRuntime.hydrate(buildingFact)

    this.lifeExpansion = hydrateLifeExpansionState(facts[LIFE_EXPANSION_FACT_KEY])
    this.constructionProjects.hydrateFromLifeExpansion(this.lifeExpansion)
    const activeEventsFact = facts[FACT_ACTIVE_EVENTS]
    if (Array.isArray(activeEventsFact)) {
      const restored: ActiveWorldEvent[] = []
      for (const item of activeEventsFact) {
        if (!item || typeof item !== 'object') continue
        const candidate = item as Partial<ActiveWorldEvent> & {
          templateId?: unknown
          startedAtTick?: unknown
        }
        if (
          typeof candidate.templateId === 'string' &&
          typeof candidate.startedAtTick === 'number'
        ) {
          const rebuilt = rebuildActiveEvent(candidate.templateId, candidate.startedAtTick, {
            weather: this.weather,
            season: this.season
          })
          if (rebuilt) restored.push(rebuilt)
        }
      }
      this.eventEngine.hydrate(restored, this.currentTick)
    }
    for (const event of this.store.readRecentEvents(RECENT_EVENTS_BUFFER * 4)) {
      const narrative = readNarrativeFromAnyEvent(event, event.tick ?? 0)
      if (!narrative) continue
      this.pushRecent(narrative)
    }
  }
}

function pickFromCycle<T>(values: readonly T[], step: number): T {
  const i = ((step % values.length) + values.length) % values.length
  return values[i]!
}

function isExpansionProductiveDomain(domain: string): boolean {
  return domain === 'build' || domain === 'service' || domain === 'trade' || domain === 'learn'
}

// Phase 1 §33.4 — deterministic settlement id derivation.
// Hash of (tileId, formedAtTick, sorted founderNpcIds) so the id is
// reproducible across replays and unique across formation events even
// at the same tile.
function deriveSettlementId(input: DetectedSettlementFormation): string {
  const seed = {
    scheme: 'settlement.v1',
    tileId: input.tileId,
    formedAtTick: input.formedAtTick,
    founderNpcIds: [...input.founderNpcIds].sort(),
  }
  return `settlement.${input.tileId}.${hashCanonicalJson(seed).slice(0, 16)}`
}

function tradeRouteId(fromTileId: string, toTileId: string, goodsId: string): string {
  return `route.${fromTileId}.${toTileId}.${goodsId}`
}

function goodsTransportId(routeId: string, tick: number, holderId: string, goodsId: string): string {
  const seed = { routeId, tick, holderId, goodsId }
  return `transport.${hashCanonicalJson(seed).slice(0, 16)}`
}

function isStormActive(events: readonly ActiveWorldEvent[]): boolean {
  return events.some((event) => event.templateId === 'weather.storm' || event.payload.effect === 'storm')
}

function makeMotivation(explanation: string, projectPurpose?: string): EventMotivation {
  return projectPurpose ? { explanation, projectPurpose } : { explanation }
}

function isEventMotivation(value: unknown): value is EventMotivation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<EventMotivation>
  return typeof record.explanation === 'string' &&
    (record.projectPurpose === undefined || typeof record.projectPurpose === 'string')
}

function makeFallbackProfile(npcId: string, fallbackTile: string): NpcProfile {
  return {
    id: npcId,
    name: { zh: npcId, en: npcId },
    role: { zh: '居民', en: 'Resident' },
    defaultLocation: fallbackTile,
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'civilian' }
  }
}

function makeFallbackNpcState(fallbackTile: string, tick: number): NpcRuntimeState {
  return {
    tile: fallbackTile,
    mood: 60,
    health: 80,
    activity: 'work',
    faction: 'civilian',
    targetTile: fallbackTile,
    lastActedTick: tick,
    subCol: 7,
    subRow: 5,
    subZ: 0
  } as NpcRuntimeState
}

function productiveDomainText(domain: string): string {
  switch (domain) {
    case 'build': return '建設與修補'
    case 'service': return '公共服務'
    case 'trade': return '交易與供應調節'
    case 'learn': return '知識與技能累積'
    default: return '生產性行動'
  }
}

function metricPurpose(metric: string): string | undefined {
  switch (metric) {
    case 'infrastructure': return '基礎建設'
    case 'knowledge': return '知識 / 技能'
    case 'economy': return '經濟 / 收入'
    case 'safety': return '安全 / 秩序'
    case 'supply': return '補給 / 物資'
    default: return undefined
  }
}

function areaPressureMotivation(kind: string): string {
  if (kind.includes('faction')) return '派系影響力跨過門檻，代表街區權力平衡改變並可能影響 NPC 行為。'
  if (kind.includes('resource')) return '區域資源指標跨過壓力門檻，世界把它記成後續行動會回應的公共壓力。'
  return '區域狀態達到壓力或回穩門檻，因此被寫入公共編年史。'
}

function strongestNeed(needs: NpcLifeView['needs']): { key: ConstructionMotivation['primaryPressure']; value: number } {
  let best: { key: ConstructionMotivation['primaryPressure']; value: number } = { key: 'housing', value: needs.housing }
  for (const key of ['food', 'rest', 'money', 'housing', 'safety'] as const) {
    if (needs[key] > best.value) best = { key, value: needs[key] }
  }
  return best
}

function needLabel(key: ConstructionMotivation['primaryPressure']): string {
  switch (key) {
    case 'food': return '食物'
    case 'rest': return '休息'
    case 'money': return '收入'
    case 'housing': return '住房'
    case 'safety': return '安全'
    case 'infrastructure': return '基礎建設'
  }
}

function makeExpansionAreaState(tileId: string, tick: number): AreaState {
  return {
    tileId,
    factionControl: {
      tide_hunters: 12,
      free_runners: 8,
      guild: 18,
      civilian: 34
    },
    dominantFaction: null,
    resources: { food: 58, safety: 54, economy: 42 },
    lastUpdatedTick: tick,
    recentEvents: [],
    pressureCooldowns: {}
  }
}

function readNarrativePayload(payload: unknown): NarrativeEventPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { key?: unknown; value?: unknown }
  if (typeof p.key !== 'string' || !p.key.startsWith(NARRATIVE_KEY_PREFIX)) return null
  const v = p.value
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.eventType !== 'string' || typeof r.actorId !== 'string') return null
  return {
    eventType: r.eventType,
    actorId: r.actorId,
    payload: (r.payload as Record<string, unknown> | undefined) ?? {},
    narration: typeof r.narration === 'string' ? r.narration : null
  }
}

function readAcceptedNpcInteraction(payload: unknown): {
  tile: string
  participants: readonly [string, string]
  mode: 'chat' | 'argue'
} | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { tile?: unknown; participants?: unknown; mode?: unknown }
  if (typeof p.tile !== 'string') return null
  if (p.mode !== 'chat' && p.mode !== 'argue') return null
  if (!Array.isArray(p.participants) || p.participants.length !== 2) return null
  const [a, b] = p.participants
  if (typeof a !== 'string' || typeof b !== 'string') return null
  return { tile: p.tile, participants: [a, b], mode: p.mode }
}

/**
 * Build a `NarrativeEvent` from any committed kernel event — either a
 * legacy `FACT_SET` narrative wrapper or a typed living-world event
 * produced by the Rule Engine. Typed events carry their data inside a
 * `LivingWorldEventPayload` { actorType, data, narration } shape.
 */
function readNarrativeFromAnyEvent(ev: Event, fallbackTick: number): NarrativeEvent | null {
  const tick = typeof ev.tick === 'number' ? ev.tick : fallbackTick

  if (
    ev.eventType === 'NPC_STATE_RECORDED' ||
    ev.eventType === 'ANIMAL_SPAWNED' ||
    ev.eventType === 'GOODS_EXTRACTED' ||
    ev.eventType === 'GOODS_STORED' ||
    ev.eventType === 'GOODS_PROCESSED' ||
    ev.eventType === 'GOODS_CONSUMED' ||
    ev.eventType === 'GOODS_DESTROYED' ||
    ev.eventType === 'GOODS_TRANSPORT_STARTED' ||
    ev.eventType === 'GOODS_TRANSPORT_ARRIVED' ||
    ev.eventType === 'GOODS_TRANSPORT_LOST' ||
    ev.eventType === 'TRADE_ROUTE_OPENED' ||
    ev.eventType === 'TRADE_ROUTE_CLOSED' ||
    ev.eventType === 'MARKET_PRICE_DISCOVERED'
  ) return null

  if (isLivingWorldCommandType(ev.eventType)) {
    const lw = ev.payload as LivingWorldEventPayload | undefined
    if (!lw || typeof lw !== 'object') return null
    const dataAsRecord = lw.data as unknown as Record<string, unknown>
    return {
      sequence: ev.sequence,
      tick,
      eventType: ev.eventType,
      actorId: ev.actorId,
      occurredAt: new Date(ev.occurredAt).toISOString(),
      payload: dataAsRecord,
      narration: lw.narration ?? null
    }
  }

  const narrative = readNarrativePayload(ev.payload)
  if (!narrative) return null
  return {
    sequence: ev.sequence,
    tick,
    eventType: narrative.eventType,
    actorId: narrative.actorId,
    occurredAt: new Date(ev.occurredAt).toISOString(),
    payload: narrative.payload,
    narration: narrative.narration
  }
}

function activityVerb(activity: NpcActivity): string {
  switch (activity) {
    case 'work':
      return '開始工作'
    case 'eat':
      return '正在用餐'
    case 'sleep':
      return '進入休息狀態'
    case 'trade':
      return '擺出交易陣式'
    case 'patrol':
      return '巡視四周'
    case 'idle':
      return '稍作停留'
    case 'move':
      return '正在移動'
  }
}

function stringifyScope(scope: { kind: string; tileIds?: readonly string[] }): string {
  if (scope.kind === 'world') return 'world'
  if (scope.kind === 'region' && Array.isArray(scope.tileIds)) {
    return `region:${[...scope.tileIds].sort().join(',')}`
  }
  return scope.kind
}

// Faction → 基礎 HSL，Hub/Area 上同派系視覺接近、跨派系顏色拉開
const FACTION_BASE_HSL: Readonly<Record<string, { h: number; s: number; l: number }>> = {
  tide_hunters: { h: 200, s: 70, l: 60 },
  free_runners: { h: 130, s: 60, l: 58 },
  guild: { h: 50, s: 75, l: 60 },
  civilian: { h: 28, s: 55, l: 65 },
  exchange: { h: 50, s: 75, l: 60 },
  monastic: { h: 280, s: 50, l: 62 },
  tide_tongue: { h: 175, s: 60, l: 58 },
  underground: { h: 105, s: 45, l: 50 },
  neutral: { h: 220, s: 15, l: 70 }
}

function deriveNpcColor(npcId: string, faction: string): number {
  const base = FACTION_BASE_HSL[faction] ?? FACTION_BASE_HSL.neutral!
  let h = 5381
  for (const ch of npcId) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  const hueJitter = (h % 31) - 15
  const lightJitter = (((h >>> 8) % 21) - 10)
  const finalH = ((base.h + hueJitter) % 360 + 360) % 360
  const finalS = base.s
  const finalL = clampInt(base.l + lightJitter, 40, 78)
  return hslToHex(finalH, finalS, finalL)
}

function hslToHex(h: number, s: number, l: number): number {
  const sFrac = s / 100
  const lFrac = l / 100
  const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    r = c
    g = x
  } else if (hp < 2) {
    r = x
    g = c
  } else if (hp < 3) {
    g = c
    b = x
  } else if (hp < 4) {
    g = x
    b = c
  } else if (hp < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const m = lFrac - c / 2
  const ir = Math.round((r + m) * 255)
  const ig = Math.round((g + m) * 255)
  const ib = Math.round((b + m) * 255)
  return (ir << 16) | (ig << 8) | ib
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  const r = Math.round(n)
  if (r < lo) return lo
  if (r > hi) return hi
  return r
}

function buildNpcFactionLean(profiles: readonly NpcProfile[]): Map<string, FactionId> {
  const map = new Map<string, FactionId>()
  for (const p of profiles) {
    const lean = (p.personality.factionLean as string | undefined) ?? 'civilian'
    if ((FACTIONS as readonly string[]).includes(lean)) {
      map.set(p.id, lean as FactionId)
    } else {
      // 將 profile 自定義的 faction (exchange / monastic / underground / tide_tongue 等)
      // 折合到四大主派系
      if (lean === 'exchange' || lean === 'monastic' || lean === 'tide_tongue') {
        map.set(p.id, 'guild')
      } else if (lean === 'underground') {
        map.set(p.id, 'free_runners')
      } else {
        map.set(p.id, 'civilian')
      }
    }
  }
  return map
}

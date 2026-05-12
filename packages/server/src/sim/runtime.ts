// Simulation runtime — drives a 5-second tick loop on top of the
// append-only kernel event log. Every tick the runtime:
//   1. Increments world.tick
//   2. Hands off to NpcEngine for per-NPC decisioning (move tile-by-tile,
//      activity transitions, mood/health drift, NPC↔NPC interaction)
//   3. On a fixed cadence, rotates weather / season and toggles the
//      tide_festival rare window
//   4. Spawns / expires WorldEventEngine entries
//
// All state is persisted as FACT_SET events so it can be reconstructed
// on restart via the kernel reducer. The runtime also keeps an in-
// memory projection so HTTP reads don't have to re-reduce the entire
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
  WORLD_TIMEZONE_OFFSET_MINUTES
} from '../config/world.js'
import type { NpcProfile } from '../npcs/types.js'
import { derivePersonalityGreetLine } from '../npcs/greetLine.js'
import type { CardCatalog } from '../cards/types.js'
import { WorldEventEngine, rebuildActiveEvent } from '../events/engine.js'
import type { ActiveWorldEvent } from '../events/types.js'
import { MAP_TILES, TILE_NAME_BY_ID, listMapTiles } from './mapGraph.js'
import {
  NpcEngine,
  NPC_PLAYER_DIALOG_HOLD_TICKS,
  type NpcActivity,
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
import type { BuildingRuntimeView } from '../buildings/types.js'
import { findBuildingById, listAllBuildings, listBuildingsForTile } from '../buildings/catalog.js'
import { AmbientNarrator, type AmbientContext } from './ambientNarrator.js'
import type { SettingsStore } from '../http/settings.js'
import {
  LIFE_EXPANSION_FACT_KEY,
  SALT_MARSH_BUILDING_ID,
  SALT_MARSH_PROJECT_ID,
  SALT_MARSH_PROJECT_TARGET,
  SALT_MARSH_TILE_ID,
  createInitialLifeExpansionState,
  deriveNpcLifeView,
  hydrateLifeExpansionState,
  householdIdForNpc,
  withChildBorn,
  withConstructionProgress,
  withHouseholdFormed,
  withUnlockedExpansion,
  type LifeExpansionState,
  type NpcLifeView
} from './cityLife.js'

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
      .snapshotForTile(tileId, this.npcEngine.snapshotAll())
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
        lifeExpansion: this.lifeExpansion
      },
      worldConfig: {
        tickDurationMs: this.tickDurationMs,
        ticksPerDay: TICKS_PER_DAY,
        timezone: WORLD_TIMEZONE,
        timezoneOffsetMinutes: WORLD_TIMEZONE_OFFSET_MINUTES,
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
    return this.mergeUnlockedBuildings(
      tileId,
      this.buildingRuntime.snapshotForTile(tileId, this.npcEngine.snapshotAll())
    )
  }

  getAllBuildings(): readonly BuildingRuntimeView[] {
    const existing = this.buildingRuntime.snapshotAll(this.npcEngine.snapshotAll())
    const byId = new Map(existing.map((view) => [view.def.id, view] as const))
    for (const def of listAllBuildings(this.lifeExpansion.unlockedBuildingIds)) {
      if (!byId.has(def.id)) byId.set(def.id, { def, occupants: [] })
    }
    return [...byId.values()]
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
    return state ? this.buildingRuntime.isNpcInside(npcId, buildingId, state) : false
  }

  getOutdoorNpcsAt(tileId: string): string[] {
    const all = this.npcEngine.snapshotAll()
    return this.buildingRuntime.npcsOutsideOnTile(all).get(tileId) ?? []
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
        })
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
    for (const view of this.buildingRuntime.snapshotAll(this.npcEngine.snapshotAll())) {
      for (const occupant of view.occupants) {
        npcsInsideBuildings.add(occupant.npcId)
      }
    }
    const npcResult = this.npcEngine.tick(nextTick, {
      areaSafety,
      areaEconomy,
      weather: this.weather,
      rareWindowOpen: this.rareWindowOpen,
      npcsInsideBuildings
    })
    const saltMarshProject = this.lifeExpansion.constructionProjects[SALT_MARSH_PROJECT_ID]
    let plannedSaltMarshProgress = saltMarshProject?.progress ?? 0
    let plannedSaltMarshCompleted =
      this.lifeExpansion.unlockedTileIds.includes(SALT_MARSH_TILE_ID) ||
      plannedSaltMarshProgress >= SALT_MARSH_PROJECT_TARGET
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
              delta: event.delta,
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
        if (!plannedSaltMarshCompleted && isExpansionProductiveDomain(event.domain)) {
          const delta = event.domain === 'build' ? 2 : 1
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
    // 把 NPC state 變更寫回 FACT_SET，讓重啟可 hydrate
    for (const change of npcResult.changedStates) {
      stateDrafts.push(
        this.factSetDraft(
          `${NPC_STATE_PREFIX}${change.npcId}`,
          { ...change.state },
          change.npcId,
          nextTick
        )
      )
    }

    // ---- BuildingRuntime：reconcile 室內 NPC 狀態 ----
    const npcSnapshot = this.npcEngine.snapshotAll()
    const buildingDeltas = this.buildingRuntime.reconcile(npcSnapshot)
    for (const delta of buildingDeltas) {
      const profile = this.profiles.find((p) => p.id === delta.npcId)
      const name = profile?.name.zh ?? delta.npcId
      if (delta.to !== null) {
        const def = findBuildingById(delta.to)
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
        const def = findBuildingById(delta.from)
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
            motivation: makeMotivation(areaPressureMotivation(pe.kind)),
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

    // ---- Compile commands → typed event drafts via the Rule Engine ----
    const typedDrafts: EventDraft[] = []
    const postAcceptedStateDrafts: EventDraft[] = []
    let lifeExpansionChanged = false
    for (const cmd of commands) {
      const result = this.livingWorldRuleEngine.evaluate(cmd)
      if (result.accepted) {
        for (const draft of result.events) typedDrafts.push(draft as EventDraft)
        if (cmd.commandType === 'CONSTRUCTION_PROJECT_PROGRESS') {
          const payload = cmd.payload as { delta: number }
          this.lifeExpansion = withConstructionProgress(this.lifeExpansion, {
            tick: nextTick,
            delta: payload.delta
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
              postAcceptedStateDrafts.push(
                this.factSetDraft(
                  `${NPC_STATE_PREFIX}${change.npcId}`,
                  { ...change.state },
                  change.npcId,
                  nextTick
                )
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
      .map(({ profile, state, life }) =>
        makeLivingWorldCommand(
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
              `${profile.name.zh}的食物、休息、收入、住房與安全需求重新計算後，最高壓力把生活目標推向「${life.goal.narration}」。`,
              `目標壓力 ${life.goal.pressure}`
            ),
            narration: `${profile.name.zh}把眼前生活目標定為：${life.goal.narration}`
          }
        )
      )
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
    return makeMotivation(
      `${fallbackProfile.name.zh}在${tileName}的生活目標是「${life.goal.narration}」，目前最高壓力是${needLabel(primary.key)} ${primary.value}；這次${domainText}把個人目標轉成城市進展。`,
      purpose
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
    const projectPurpose = '把鹽沼外環變成新的住所、巡衛落腳點與補給節點，分散舊街區的住房與安全壓力。'
    return {
      projectPurpose,
      primaryPressure: primary.key,
      pressureScore: Math.max(primary.value, life.goal.pressure),
      sourceGoalKind: life.goal.kind,
      sourceNpcId: npcId,
      sourceTileId: fallbackTile,
      explanation: `${fallbackProfile.name.zh}在${sourceTileName}的目標是「${life.goal.narration}」，${needLabel(primary.key)}壓力 ${primary.value}；${targetTileName}的拓荒站能提供住處、補給與巡查路線。`
    }
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
    // Hydrate NPC state from the new npc.state.<id> facts. Backward-
    // compatible：若這些 keys 不存在但舊版本的 npc.<id>.location 存在，
    // 就把舊的位置補上去。
    for (const profile of this.profiles) {
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

function makeMotivation(explanation: string, projectPurpose?: string): EventMotivation {
  return projectPurpose ? { explanation, projectPurpose } : { explanation }
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

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
import { MAP_TILES, TILE_NAME_BY_ID } from './mapGraph.js'
import { NpcEngine, type NpcActivity, type NpcRuntimeState } from './npcEngine.js'
import {
  AreaStateEngine,
  type AreaState,
  type FactionId,
  FACTIONS
} from './areaStateEngine.js'
import { BuildingRuntime } from '../buildings/buildingRuntime.js'
import type { BuildingRuntimeView } from '../buildings/types.js'
import { findBuildingById, listBuildingsForTile } from '../buildings/catalog.js'
import { AmbientNarrator, type AmbientContext } from './ambientNarrator.js'
import type { SettingsStore } from '../http/settings.js'

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
        areaStates: this.areaEngine.snapshotAll()
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
    return this.areaEngine.snapshotAll()
  }

  getAreaState(tileId: string): AreaState | null {
    return this.areaEngine.getState(tileId)
  }

  getBuildingsOnTile(tileId: string): readonly BuildingRuntimeView[] {
    return this.buildingRuntime.snapshotForTile(tileId, this.npcEngine.snapshotAll())
  }

  getAllBuildings(): readonly BuildingRuntimeView[] {
    return this.buildingRuntime.snapshotAll(this.npcEngine.snapshotAll())
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
          greed: profile.personality.greed ?? null
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
    const tiles = MAP_TILES.map((tile) => ({
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
    return { width: 8, height: 6, tiles }
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
              narration: `${name}在${tileName}${activityVerb(event.to)}。`
            }
          )
        )
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
              narration: event.narration
            }
          )
        )
      }
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
            { from: before, to: next, narration: `天空從${before}轉為${next}。` }
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
              scope: stringifyScope(event.scope)
            }
          )
        )
      }
    }

    // ---- Compile commands → typed event drafts via the Rule Engine ----
    const typedDrafts: EventDraft[] = []
    for (const cmd of commands) {
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

    // Append both buckets in one transaction. Order: state snapshots
    // first so the projection on disk is consistent before the typed
    // events that reference that state.
    const committed = this.store.appendEvents([...stateDrafts, ...typedDrafts])
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

  private hydrateFromEventLog(): void {
    const state = this.store.readLatestFactSnapshot()
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
    }
    const weatherFact = state.facts[FACT_WEATHER]
    if (typeof weatherFact === 'string' && (WEATHERS as readonly string[]).includes(weatherFact)) {
      this.weather = weatherFact
    }
    const seasonFact = state.facts[FACT_SEASON]
    if (typeof seasonFact === 'string' && (SEASONS as readonly string[]).includes(seasonFact)) {
      this.season = seasonFact
    }
    const rareFact = state.facts[FACT_RARE_WINDOW]
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
      const newRaw = state.facts[newKey]
      if (newRaw) {
        this.npcEngine.hydrate(profile.id, newRaw)
        continue
      }
      const legacyKey = `npc.${profile.id}.location`
      const legacy = state.facts[legacyKey]
      if (typeof legacy === 'string') {
        this.npcEngine.hydrate(profile.id, { tile: legacy, targetTile: legacy })
      }
    }
    // hydrate area states
    for (const tile of MAP_TILES) {
      const raw = state.facts[`${AREA_STATE_PREFIX}${tile.id}`]
      if (raw) this.areaEngine.hydrate(tile.id, raw)
    }
    const buildingFact = state.facts[FACT_BUILDING_OCCUPANTS]
    if (buildingFact) this.buildingRuntime.hydrate(buildingFact)

    const activeEventsFact = state.facts[FACT_ACTIVE_EVENTS]
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

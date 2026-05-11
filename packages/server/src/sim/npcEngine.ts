// NPC engine — 每個 tick 為每位 NPC：
//   1. 從 schedule slot 解出 target_tile + 預期 activity
//   2. 若 current_tile !== target_tile：BFS 走一格
//   3. 若已在 target_tile：執行該 slot 的 activity（work / eat / sleep / idle）
//   4. 在當前 tile 內，往一個 deterministic 子格錨點走一步（subCol/subRow），
//      讓區域畫面看到的 NPC 真的在街區裡探索不同 tile 而不是站著抖動
//   5. subZ 保留高度 / 樓層軸；現在預設 0，互動也會檢查高度差
//   6. mood / health 隨活動緩慢漂移
//   7. 同 tile、室外、三維座標靠近的 NPC 才以 deterministic 機率觸發互動
//
// 所有狀態變化都以 FactSet draft 形式回傳給 SimulationRuntime；engine
// 本身不直接寫 EventLog，符合 deterministic kernel 的 command-vs-event
// 分離原則。狀態 key：
//   npc.state.<id> = { tile, mood, health, activity, faction,
//                      targetTile, travelRoute, lastActedTick, subCol, subRow, subZ }
//
// hydrate：runtime 啟動時把 reducer 算出的 facts 透過 hydrate() 餵回。

import type { NpcProfile } from '../npcs/types.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MINUTE } from '../config/world.js'
import { MAP_ADJACENCY, TILE_NAME_BY_ID, nextStepTowards } from './mapGraph.js'

export type NpcActivity = 'idle' | 'move' | 'work' | 'eat' | 'sleep' | 'trade' | 'patrol'
export type NpcAgentPermission =
  | 'move.cross_tile'
  | 'move.local_area'
  | 'act.work'
  | 'act.trade'
  | 'act.patrol'
  | 'act.rest'
  | 'interact.social'
export type NpcAgentTaskKind =
  | 'bootstrap'
  | 'scheduled-duty'
  | 'personality-nudge'
  | 'travel'
  | 'local-activity'
  | 'social-interaction'
  | 'player-dialog'

export type NpcAgentTask = Readonly<{
  kind: NpcAgentTaskKind
  reason: string
  targetTile: string
  startedAtTick: number
  expiresAtTick: number | null
}>

export type NpcAgentState = Readonly<{
  profileId: string
  permissions: readonly NpcAgentPermission[]
  activeTask: NpcAgentTask
  lastDecision: Readonly<{
    tick: number
    source: 'bootstrap' | 'schedule' | 'personality' | 'movement' | 'social' | 'player'
    reason: string
  }>
}>

// 子格網格大小：與 web/src/game/AreaScene.ts 的 AREA_GRID_COLS / ROWS 對齊。
// 後端決定子格座標、前端純粹照畫，沒有自由 wander 邏輯。
export const AREA_SUB_COLS = 15
export const AREA_SUB_ROWS = 10
// 內圈：保留外圈當建築 / 裝飾用，NPC 預設不踩外緣
const SUB_INNER_MIN_COL = 1
const SUB_INNER_MAX_COL = AREA_SUB_COLS - 2 // 13
const SUB_INNER_MIN_ROW = 1
const SUB_INNER_MAX_ROW = AREA_SUB_ROWS - 2 // 8
// 子格錨點刷新節奏：每 12 個 tick (≈1 分鐘) 換一個目標子格
const SUB_TARGET_REFRESH_TICKS = 12

export type NpcRuntimeState = {
  tile: string
  mood: number
  health: number
  activity: NpcActivity
  faction: string
  targetTile: string
  lastActedTick: number
  /** 0..AREA_SUB_COLS-1：在當前 area canvas 裡的欄座標 */
  subCol: number
  /** 0..AREA_SUB_ROWS-1：在當前 area canvas 裡的列座標 */
  subRow: number
  /** 高度 / 樓層座標。現在全為 0；未來可表示橋上、地下層或樓層。 */
  subZ: number
  /** v0.14.0：個性 nudge 暫時覆寫 schedule 的 targetTile；到 expiresAtTick
   *  自動失效，回到 schedule 推導的目標。沒有 nudge 時為 null。 */
  personalityOverride?: { targetTile: string; expiresAtTick: number; reason: string } | null
  /** v0.15.12：NPC 正在跨區移動時的單一 worldline segment。非移動時為 null。 */
  travelRoute?: {
    fromTile: string
    toTile: string
    targetTile: string
    startedAtTick: number
  } | null
  /** v0.15.23：deterministic runtime-agent projection for this NPC. */
  agent: NpcAgentState
}

export type NpcDecisionEvent = Readonly<
  | {
      kind: 'move'
      npcId: string
      from: string
      to: string
      activity: NpcActivity
    }
  | {
      kind: 'activity'
      npcId: string
      tile: string
      from: NpcActivity
      to: NpcActivity
    }
  | {
      kind: 'interact'
      tile: string
      participants: readonly [string, string]
      positions: Readonly<Record<string, { subCol: number; subRow: number; subZ: number }>>
      mode: 'chat' | 'argue'
      narration: string
    }
>

export type NpcStateChange = Readonly<{
  npcId: string
  state: NpcRuntimeState
}>

export type NpcTickResult = Readonly<{
  events: readonly NpcDecisionEvent[]
  /**
   * 每位 NPC 在本 tick 內的最終狀態快照（已 dedupe），保證 npcId
   * 不重複。避免兩次「mood 已 clamp 到底」的相同狀態寫入產生同 hash。
   */
  changedStates: readonly NpcStateChange[]
}>

// 字面常數：mood/health 漂移幅度。整數 clamp 到 0..100。
const MOOD_MIN = 0
const MOOD_MAX = 100
const HEALTH_MIN = 0
const HEALTH_MAX = 100

const ACTIVITY_DRIFT: Readonly<
  Record<NpcActivity, { mood: number; health: number }>
> = {
  idle: { mood: 0.1, health: 0.05 },
  move: { mood: -0.05, health: -0.05 },
  work: { mood: -0.2, health: -0.1 },
  eat: { mood: 0.5, health: 0.3 },
  sleep: { mood: 0.5, health: 1.0 },
  trade: { mood: 0.1, health: -0.05 },
  patrol: { mood: -0.1, health: -0.1 }
}

const INTERACT_PROBABILITY = 0.18 // 每對同 tile NPC，每 tick 觸發機率
const INTERACT_COOLDOWN_TICKS = 6
const INTERACT_MAX_PLANAR_DISTANCE = 2
const INTERACT_MAX_Z_DISTANCE = 0
const PLAYER_DIALOG_HOLD_TICKS = TICKS_PER_MINUTE

/**
 * 每位 NPC 每 N tick 評估一次個體化決策（偏離 schedule 的「個性 nudge」）。
 * 36 tick ≈ 3 分鐘現實時間，等於 NPC 大約每 3 分鐘考慮一次「我現在想做什麼」。
 * deterministic offset = hash(npcId) % PERSONALITY_DECISION_INTERVAL，
 * 讓不同 NPC 不會在同一 tick 集體決策。
 */
const PERSONALITY_DECISION_INTERVAL = 36
/** Personality nudge 相對 schedule 的有效持續 tick，過後重新算 */
const PERSONALITY_OVERRIDE_TICKS = 30

const LABEL_SLEEP_PATTERN = /(sleep|bedtime|hideout|back room sleep|broken arch)/
const LABEL_EAT_PATTERN = /(eat|meal|breakfast|lunch|dinner|supper|tea|stew|noodle|food|kitchen)/
const LABEL_ERRAND_PATTERN = /(errand|visit|social|walk|off.?duty|after-work)/
const LABEL_TRADE_PATTERN = /(trade|trading|exchange|sell|selling|sale|stall|counter|market|customers|booth|fencing|café|cafe|tavern)/
const LABEL_PATROL_PATTERN = /(patrol|watch|guard|scout|hunt|rounds|commute|running|runs|dash|loops|circling|exploring|delivering|delivery)/
const LABEL_WORK_PATTERN = /(work|ledger|study|review|prepare|whisper|gossip|intel|brewing|forge|appraisal|stock|desk|office|tower|class|lecture|lectures|library|shelving|rehearsal|busking|gig|gigs|opening|stitch|fitting|prep|rush|dispatch|prayer|prayers|hall|courtyard|sweeping|washing|chart|divination|gathering|foraging|training|timber|carving|drying|grinding|consultation|supervising|swinging|loading|cargo|rigging|mending|bookkeeping|tally|seam|shaft|pick|bell|tuning|catalogue|inscription|rubble|handoff|headline)/

/** Per-tick context from the runtime — area resources / world facts that
 * personality-based decisioning can read. Optional：舊測試不傳就走 schedule */
export type NpcTickContext = Readonly<{
  areaSafety: ReadonlyMap<string, number>
  areaEconomy: ReadonlyMap<string, number>
  weather: string
  rareWindowOpen: boolean
  /**
   * v0.14.0：BuildingRuntime 知道哪些 NPC 目前在建築物內。NpcEngine 用這個
   * Set 在 Phase 2（同 tile 互動）排除這些 NPC，避免「在 X 區起爭執」事件
   * 的兩位 NPC 其實都在某棟建築內、AreaPage 地圖上根本看不到。
   */
  npcsInsideBuildings?: ReadonlySet<string>
}>

// schedule slot：profile 沒給 schedule 就從 routine 推導
type ScheduleSlot = {
  fromTickOfDay: number
  toTickOfDay: number
  location: string
  activity: NpcActivity
}

export class NpcEngine {
  private readonly state = new Map<string, NpcRuntimeState>()
  private readonly schedules = new Map<string, ScheduleSlot[]>()
  private readonly factions = new Map<string, string>()
  private readonly lastInteractTickByPair = new Map<string, number>()

  constructor(private readonly profiles: readonly NpcProfile[]) {
    for (const profile of profiles) {
      this.schedules.set(profile.id, deriveSchedule(profile))
      const fac =
        typeof profile.personality.factionLean === 'string'
          ? profile.personality.factionLean
          : 'neutral'
      this.factions.set(profile.id, fac)
      // 初始 state — 等 hydrate 補上正確值
      const initSub = initialSubTile(profile.id, profile.defaultLocation)
      const agent = initialAgentState(profile)
      this.state.set(profile.id, {
        tile: profile.defaultLocation,
        mood: 60,
        health: 80,
        activity: 'idle',
        faction: fac,
        targetTile: profile.defaultLocation,
        lastActedTick: 0,
        subCol: initSub.col,
        subRow: initSub.row,
        subZ: 0,
        personalityOverride: null,
        travelRoute: null,
        agent
      })
    }
  }

  /** 由 SimulationRuntime 在 hydrate 階段呼叫，把先前 FACT_SET 還原回 state map。 */
  hydrate(npcId: string, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const r = raw as Partial<NpcRuntimeState>
    const fac = this.factions.get(npcId) ?? 'neutral'
    const profile = this.profiles.find((p) => p.id === npcId)
    const fallbackTile = profile?.defaultLocation ?? 't_central'
    const tile = typeof r.tile === 'string' ? r.tile : fallbackTile
    const fallbackSub = initialSubTile(npcId, tile)
    let personalityOverride: NpcRuntimeState['personalityOverride'] = null
    if (r.personalityOverride && typeof r.personalityOverride === 'object') {
      const po = r.personalityOverride as Partial<{
        targetTile: string
        expiresAtTick: number
        reason: string
      }>
      if (typeof po.targetTile === 'string' && typeof po.expiresAtTick === 'number') {
        personalityOverride = {
          targetTile: po.targetTile,
          expiresAtTick: po.expiresAtTick,
          reason: typeof po.reason === 'string' ? po.reason : 'persisted'
        }
      }
    }
    let travelRoute: NpcRuntimeState['travelRoute'] = null
    if (r.travelRoute && typeof r.travelRoute === 'object') {
      const tr = r.travelRoute as Partial<{
        fromTile: string
        toTile: string
        targetTile: string
        startedAtTick: number
      }>
      if (
        typeof tr.fromTile === 'string' &&
        typeof tr.toTile === 'string' &&
        typeof tr.targetTile === 'string' &&
        typeof tr.startedAtTick === 'number'
      ) {
        travelRoute = {
          fromTile: tr.fromTile,
          toTile: tr.toTile,
          targetTile: tr.targetTile,
          startedAtTick: tr.startedAtTick
        }
      }
    }
    const next: NpcRuntimeState = {
      tile,
      mood: clamp(typeof r.mood === 'number' ? r.mood : 60, MOOD_MIN, MOOD_MAX),
      health: clamp(
        typeof r.health === 'number' ? r.health : 80,
        HEALTH_MIN,
        HEALTH_MAX
      ),
      activity: isActivity(r.activity) ? r.activity : 'idle',
      faction: typeof r.faction === 'string' ? r.faction : fac,
      targetTile: typeof r.targetTile === 'string' ? r.targetTile : fallbackTile,
      lastActedTick: typeof r.lastActedTick === 'number' ? r.lastActedTick : 0,
      subCol:
        typeof r.subCol === 'number'
          ? clampInt(r.subCol, 0, AREA_SUB_COLS - 1)
          : fallbackSub.col,
      subRow:
        typeof r.subRow === 'number'
          ? clampInt(r.subRow, 0, AREA_SUB_ROWS - 1)
          : fallbackSub.row,
      subZ: typeof r.subZ === 'number' ? clampInt(r.subZ, -10, 50) : 0,
      personalityOverride,
      travelRoute,
      agent: readAgentState(profile ?? null, r.agent, tile)
    }
    this.state.set(npcId, next)
  }

  getState(npcId: string): NpcRuntimeState | null {
    return this.state.get(npcId) ?? null
  }

  /** 跑一個 tick 的 NPC decisioning，回傳要寫入的事件 + 狀態變更。 */
  tick(currentTick: number, context?: NpcTickContext): NpcTickResult {
    const events: NpcDecisionEvent[] = []
    // 用 Set 紀錄本 tick 內變動過的 npcId，最後再從 state map 取一份快照，
    // 確保每個 npcId 在 changedStates 中只出現一次（避免重複 FactSet 同 hash）。
    const dirty = new Set<string>()
    // 儲存進 tick 開始時的初始狀態，以便最後比對是否真的改變
    const initial = new Map<string, NpcRuntimeState>()
    for (const [id, s] of this.state) initial.set(id, s)

    // 算每 tile 上的 NPC 數量（移動中不算「在場」）給 entertainer 找人用
    const crowdByTile = new Map<string, number>()
    for (const [, s] of this.state) {
      if (s.activity === 'move') continue
      crowdByTile.set(s.tile, (crowdByTile.get(s.tile) ?? 0) + 1)
    }

    // ---- Phase 1: 每個 NPC 自己的決策 ----
    for (const profile of this.profiles) {
      const before = this.state.get(profile.id)
      if (!before) continue
      const next = decideNextState(
        profile,
        before,
        this.schedules.get(profile.id) ?? [],
        currentTick,
        context ?? null,
        crowdByTile
      )
      if (next.tile !== before.tile) {
        events.push({
          kind: 'move',
          npcId: profile.id,
          from: before.tile,
          to: next.tile,
          activity: next.activity
        })
      } else if (next.activity !== before.activity) {
        events.push({
          kind: 'activity',
          npcId: profile.id,
          tile: next.tile,
          from: before.activity,
          to: next.activity
        })
      }
      const beforeOverrideTarget = before.personalityOverride?.targetTile ?? null
      const nextOverrideTarget = next.personalityOverride?.targetTile ?? null
      const beforeRoute = before.travelRoute ?? null
      const nextRoute = next.travelRoute ?? null
      if (
        next.tile !== before.tile ||
        next.activity !== before.activity ||
        Math.round(next.mood) !== Math.round(before.mood) ||
        Math.round(next.health) !== Math.round(before.health) ||
        next.targetTile !== before.targetTile ||
        next.subCol !== before.subCol ||
        next.subRow !== before.subRow ||
        next.subZ !== before.subZ ||
        beforeOverrideTarget !== nextOverrideTarget ||
        beforeRoute?.fromTile !== nextRoute?.fromTile ||
        beforeRoute?.toTile !== nextRoute?.toTile ||
        beforeRoute?.targetTile !== nextRoute?.targetTile ||
        beforeRoute?.startedAtTick !== nextRoute?.startedAtTick ||
        !agentStatesEqual(before.agent, next.agent)
      ) {
        this.state.set(profile.id, next)
        dirty.add(profile.id)
      }
    }

    // ---- Phase 2: 同 tile NPC 兩兩互動 ----
    // 規則：
    //   - 必須同一 tile（NPC 必須真的走到對方旁邊，不能隔空）
    //   - 兩位 NPC 都不能正在移動（activity != 'move'）— 路上交錯不算交談
    //   - v0.14.0：兩位都不能在建築物內 — AreaPage 地圖上要看得到，
    //     不能說「鏽灣區起爭執」但兩位都關在某棟建築裡玩家找不到
    //   - 每個 tile 每 tick 最多 1 個互動事件，挑 pairRoll 最低的 pair
    const byTile = new Map<string, string[]>()
    const indoorSet = context?.npcsInsideBuildings ?? null
    for (const [npcId, s] of this.state) {
      if (s.activity === 'move') continue // 路上不算「在場」
      if (indoorSet && indoorSet.has(npcId)) continue // 在建築內 → 主地圖看不到
      const arr = byTile.get(s.tile) ?? []
      arr.push(npcId)
      byTile.set(s.tile, arr)
    }
    for (const [tile, ids] of byTile) {
      if (ids.length < 2) continue
      const sorted = [...ids].sort()
      // 找出本 tile 內 pairRoll 最小且未在冷卻內的一對 — 只觸發一次
      let bestPair: { a: string; b: string; roll: number } | null = null
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const a = sorted[i]!
          const b = sorted[j]!
          const pairKey = `${a}|${b}`
          const last = this.lastInteractTickByPair.get(pairKey) ?? -INTERACT_COOLDOWN_TICKS
          if (currentTick - last < INTERACT_COOLDOWN_TICKS) continue
          const stateA = this.state.get(a)
          const stateB = this.state.get(b)
          if (!stateA || !stateB || !canNpcStatesInteract(stateA, stateB)) continue
          const roll = pairRoll(currentTick, a, b)
          if (roll >= INTERACT_PROBABILITY) continue
          if (!bestPair || roll < bestPair.roll) bestPair = { a, b, roll }
        }
      }
      if (!bestPair) continue

      const { a, b } = bestPair
      const stateA = this.state.get(a)!
      const stateB = this.state.get(b)!
      const pairKey = `${a}|${b}`
      this.lastInteractTickByPair.set(pairKey, currentTick)

      const profileA = this.profiles.find((p) => p.id === a)
      const profileB = this.profiles.find((p) => p.id === b)
      if (!profileA || !profileB) continue
      const factionA = this.factions.get(a) ?? 'neutral'
      const factionB = this.factions.get(b) ?? 'neutral'
      const sameFaction = factionA === factionB
      const moodSum = (this.state.get(a)?.mood ?? 50) + (this.state.get(b)?.mood ?? 50)
      // 同派系 + mood 高 → chat；其它情況偏向 argue
      const mode: 'chat' | 'argue' = sameFaction && moodSum > 100 ? 'chat' : 'argue'
      const narration = composeInteractionNarration(
        profileA,
        profileB,
        mode,
        tile,
        currentTick,
        context?.weather ?? '晴'
      )
      events.push({
        kind: 'interact',
        tile,
        participants: [a, b],
        positions: {
          [a]: { subCol: stateA.subCol, subRow: stateA.subRow, subZ: stateA.subZ },
          [b]: { subCol: stateB.subCol, subRow: stateB.subRow, subZ: stateB.subZ }
        },
        mode,
        narration
      })
      // 互動影響 mood（clamp 後寫回 state map；最後 dedupe 統一 emit）
      const delta = mode === 'chat' ? +1 : -2
      const na = { ...stateA, mood: clamp(stateA.mood + delta, MOOD_MIN, MOOD_MAX) }
      const nb = { ...stateB, mood: clamp(stateB.mood + delta, MOOD_MIN, MOOD_MAX) }
      this.state.set(a, na)
      this.state.set(b, nb)
      dirty.add(a)
      dirty.add(b)
    }

    // ---- Phase 3: 從 dirty set 產出 dedupe 後的 changedStates ----
    const changedStates: NpcStateChange[] = []
    for (const id of dirty) {
      const final = this.state.get(id)
      const start = initial.get(id)
      if (!final) continue
      // 比對 tick 開始與結束狀態：完全沒變就不要 emit FactSet
      if (start && statesEqual(start, final)) continue
      changedStates.push({ npcId: id, state: final })
    }

    return { events, changedStates }
  }

  /** 對外讀：取目前所有 NPC 狀態 snapshot（拷貝）。 */
  snapshotAll(): ReadonlyMap<string, NpcRuntimeState> {
    const out = new Map<string, NpcRuntimeState>()
    for (const [id, s] of this.state) {
      out.set(id, { ...s })
    }
    return out
  }

  /**
   * Called by SimulationRuntime only after an NPC_INTERACT command has passed
   * Rule Engine validation. This keeps social active-task state derived from an
   * accepted world event candidate rather than an unvalidated renderer/runtime hint.
   */
  commitSocialInteractionTask(
    participants: readonly [string, string],
    tile: string,
    mode: 'chat' | 'argue',
    currentTick: number
  ): NpcStateChange[] {
    const changes: NpcStateChange[] = []
    for (const npcId of participants) {
      const before = this.state.get(npcId)
      if (!before) continue
      const next = {
        ...before,
        agent: withSocialAgentTask(before.agent, tile, mode, currentTick)
      }
      this.state.set(npcId, next)
      changes.push({ npcId, state: next })
    }
    return changes
  }

  /**
   * A player-opened dialog is a deterministic agent task, not a renderer-only
   * illusion. Runtime calls this from an authenticated POST endpoint and then
   * persists the returned state as a FACT_SET event.
   */
  commitPlayerDialogHoldTask(
    npcId: string,
    currentTick: number
  ): NpcStateChange | null {
    const before = this.state.get(npcId)
    if (!before) return null
    const expiresAtTick = currentTick + PLAYER_DIALOG_HOLD_TICKS
    if (
      before.agent.activeTask.kind === 'player-dialog' &&
      typeof before.agent.activeTask.expiresAtTick === 'number' &&
      before.agent.activeTask.expiresAtTick >= expiresAtTick
    ) {
      return null
    }
    const next = {
      ...before,
      agent: withPlayerDialogTask(before.agent, before.tile, currentTick, expiresAtTick)
    }
    this.state.set(npcId, next)
    return { npcId, state: next }
  }
}

function decideNextState(
  profile: NpcProfile,
  before: NpcRuntimeState,
  schedule: readonly ScheduleSlot[],
  currentTick: number,
  context: NpcTickContext | null,
  crowdByTile: ReadonlyMap<string, number>
): NpcRuntimeState {
  if (
    before.agent.activeTask.kind === 'player-dialog' &&
    typeof before.agent.activeTask.expiresAtTick === 'number' &&
    currentTick < before.agent.activeTask.expiresAtTick
  ) {
    return {
      ...before,
      agent: {
        ...before.agent,
        permissions: deriveAgentPermissions(profile)
      }
    }
  }

  const tickOfDay = ((currentTick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  const slot = pickSlot(schedule, tickOfDay)
  const scheduleTarget = slot?.location ?? before.targetTile ?? profile.defaultLocation

  // ---- 個性 nudge：每 PERSONALITY_DECISION_INTERVAL tick 重算一次 ----
  // 不同 NPC 在 deterministic 偏移上決策，避免大家同 tick 一起轉向。
  let personalityOverride = before.personalityOverride ?? null
  if (personalityOverride && currentTick >= personalityOverride.expiresAtTick) {
    personalityOverride = null
  }
  const decisionPhase = (hashStr(profile.id) % PERSONALITY_DECISION_INTERVAL)
  if (currentTick % PERSONALITY_DECISION_INTERVAL === decisionPhase) {
    const nudge = computePersonalityNudge(
      profile,
      before,
      scheduleTarget,
      context,
      crowdByTile,
      currentTick
    )
    if (nudge) {
      personalityOverride = {
        targetTile: nudge.targetTile,
        expiresAtTick: currentTick + PERSONALITY_OVERRIDE_TICKS,
        reason: nudge.reason
      }
    }
  }
  const targetTile = personalityOverride?.targetTile ?? scheduleTarget

  let nextTile = before.tile
  let activity: NpcActivity
  let travelRoute: NpcRuntimeState['travelRoute'] = null
  if (before.tile !== targetTile) {
    const step = nextStepTowards(before.tile, targetTile)
    if (step) {
      nextTile = step
      activity = 'move'
      travelRoute = {
        fromTile: before.tile,
        toTile: step,
        targetTile,
        startedAtTick: currentTick
      }
    } else {
      // 找不到路（地圖不連通，理論上不發生）— 留在原地
      activity = 'idle'
    }
  } else {
    activity = slot?.activity ?? 'idle'
  }

  const drift = ACTIVITY_DRIFT[activity]
  const mood = clamp(before.mood + drift.mood, MOOD_MIN, MOOD_MAX)
  const health = clamp(before.health + drift.health, HEALTH_MIN, HEALTH_MAX)

  // ---- 子格座標：tile 換了 → 從邊緣進入；同 tile → 一格走向 deterministic 錨點 ----
  let subCol: number
  let subRow: number
  if (nextTile !== before.tile) {
    const entry = entrySubTile(profile.id, before.tile, nextTile, currentTick)
    subCol = entry.col
    subRow = entry.row
  } else {
    const anchor = subAnchor(profile.id, nextTile, activity, currentTick)
    subCol = stepToward(before.subCol, anchor.col)
    subRow = stepToward(before.subRow, anchor.row)
    // 子格抖動：x 跟 y 任一達到錨點時，下一個錨點要靠 refreshIdx 換新；
    // 期間其餘子格只動一軸，避免兩軸同時跳。
  }

  return {
    tile: nextTile,
    targetTile,
    activity,
    mood,
    health,
    faction: before.faction,
    lastActedTick:
      activity === 'idle' &&
      nextTile === before.tile &&
      subCol === before.subCol &&
      subRow === before.subRow
        ? before.lastActedTick
        : currentTick,
    subCol,
    subRow,
    subZ: before.subZ,
    personalityOverride,
    travelRoute,
    agent: buildNextAgentState({
      profile,
      previous: before.agent,
      activity,
      targetTile,
      scheduleTarget,
      personalityOverride,
      currentTick,
      isTraveling: before.tile !== targetTile && nextTile !== before.tile
    })
  }
}

function initialAgentState(profile: NpcProfile): NpcAgentState {
  return {
    profileId: profile.id,
    permissions: deriveAgentPermissions(profile),
    activeTask: {
      kind: 'bootstrap',
      reason: 'profile-loaded',
      targetTile: profile.defaultLocation,
      startedAtTick: 0,
      expiresAtTick: null
    },
    lastDecision: { tick: 0, source: 'bootstrap', reason: 'profile-loaded' }
  }
}

function readAgentState(
  profile: NpcProfile | null,
  raw: unknown,
  fallbackTile: string
): NpcAgentState {
  const fallback = fallbackAgentState(profile, fallbackTile)
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Partial<NpcAgentState>
  const activeTask = readAgentTask(r.activeTask, fallback.activeTask)
  const lastDecisionRaw = r.lastDecision as Partial<NpcAgentState['lastDecision']> | undefined
  const lastDecision =
    lastDecisionRaw &&
    typeof lastDecisionRaw.tick === 'number' &&
    isDecisionSource(lastDecisionRaw.source) &&
    typeof lastDecisionRaw.reason === 'string'
      ? {
          tick: lastDecisionRaw.tick,
          source: lastDecisionRaw.source,
          reason: lastDecisionRaw.reason
        }
      : fallback.lastDecision
  return {
    profileId: profile?.id ?? (typeof r.profileId === 'string' ? r.profileId : fallback.profileId),
    permissions: profile ? deriveAgentPermissions(profile) : fallback.permissions,
    activeTask,
    lastDecision
  }
}

function fallbackAgentState(profile: NpcProfile | null, fallbackTile: string): NpcAgentState {
  return {
    profileId: profile?.id ?? 'unknown',
    permissions: profile ? deriveAgentPermissions(profile) : ['move.local_area', 'interact.social'],
    activeTask: {
      kind: 'bootstrap',
      reason: 'hydrate-fallback',
      targetTile: fallbackTile,
      startedAtTick: 0,
      expiresAtTick: null
    },
    lastDecision: { tick: 0, source: 'bootstrap', reason: 'hydrate-fallback' }
  }
}

function readAgentTask(raw: unknown, fallback: NpcAgentTask): NpcAgentTask {
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Partial<NpcAgentTask>
  if (
    !isAgentTaskKind(r.kind) ||
    typeof r.reason !== 'string' ||
    typeof r.targetTile !== 'string' ||
    typeof r.startedAtTick !== 'number'
  ) {
    return fallback
  }
  const expiresAtTick =
    typeof r.expiresAtTick === 'number' && Number.isFinite(r.expiresAtTick)
      ? r.expiresAtTick
      : null
  return {
    kind: r.kind,
    reason: r.reason,
    targetTile: r.targetTile,
    startedAtTick: r.startedAtTick,
    expiresAtTick
  }
}

function buildNextAgentState(input: {
  profile: NpcProfile
  previous: NpcAgentState
  activity: NpcActivity
  targetTile: string
  scheduleTarget: string
  personalityOverride: NpcRuntimeState['personalityOverride']
  currentTick: number
  isTraveling: boolean
}): NpcAgentState {
  const previousActiveTask = input.previous.activeTask
  if (
    previousActiveTask.kind === 'social-interaction' &&
    typeof previousActiveTask.expiresAtTick === 'number' &&
    input.currentTick < previousActiveTask.expiresAtTick
  ) {
    return { ...input.previous, permissions: deriveAgentPermissions(input.profile) }
  }
  if (
    previousActiveTask.kind === 'player-dialog' &&
    typeof previousActiveTask.expiresAtTick === 'number' &&
    input.currentTick < previousActiveTask.expiresAtTick
  ) {
    return { ...input.previous, permissions: deriveAgentPermissions(input.profile) }
  }
  const nudgeReason = input.personalityOverride?.reason ?? null
  const isNudged = input.personalityOverride?.targetTile === input.targetTile && input.targetTile !== input.scheduleTarget
  const source = input.isTraveling ? 'movement' : isNudged ? 'personality' : 'schedule'
  const reason = input.isTraveling
    ? nudgeReason ?? 'scheduled-travel'
    : isNudged
      ? nudgeReason ?? 'personality-nudge'
      : `schedule:${input.activity}`
  const kind: NpcAgentTaskKind = input.isTraveling
    ? 'travel'
    : isNudged
      ? 'personality-nudge'
      : input.activity === 'idle'
        ? 'local-activity'
        : 'scheduled-duty'
  const expiresAtTick = isNudged ? input.personalityOverride?.expiresAtTick ?? null : null
  const previousTask = input.previous.activeTask
  const sameTask =
    previousTask.kind === kind &&
    previousTask.reason === reason &&
    previousTask.targetTile === input.targetTile &&
    previousTask.expiresAtTick === expiresAtTick
  const activeTask: NpcAgentTask = {
    kind,
    reason,
    targetTile: input.targetTile,
    startedAtTick: sameTask ? previousTask.startedAtTick : input.currentTick,
    expiresAtTick
  }
  return {
    profileId: input.profile.id,
    permissions: deriveAgentPermissions(input.profile),
    activeTask,
    lastDecision: sameTask
      ? input.previous.lastDecision
      : { tick: input.currentTick, source, reason }
  }
}

function withSocialAgentTask(
  previous: NpcAgentState,
  tile: string,
  mode: 'chat' | 'argue',
  currentTick: number
): NpcAgentState {
  const reason = `npc-${mode}`
  return {
    ...previous,
    activeTask: {
      kind: 'social-interaction',
      reason,
      targetTile: tile,
      startedAtTick: currentTick,
      expiresAtTick: currentTick + INTERACT_COOLDOWN_TICKS
    },
    lastDecision: { tick: currentTick, source: 'social', reason }
  }
}

function withPlayerDialogTask(
  previous: NpcAgentState,
  tile: string,
  currentTick: number,
  expiresAtTick: number
): NpcAgentState {
  const reason = 'player-dialog'
  return {
    ...previous,
    activeTask: {
      kind: 'player-dialog',
      reason,
      targetTile: tile,
      startedAtTick: currentTick,
      expiresAtTick
    },
    lastDecision: { tick: currentTick, source: 'player', reason }
  }
}

function deriveAgentPermissions(profile: NpcProfile): readonly NpcAgentPermission[] {
  const activity = inferActivityFromRole(profile)
  const permissions = new Set<NpcAgentPermission>([
    'move.cross_tile',
    'move.local_area',
    'interact.social'
  ])
  if (activity === 'trade') permissions.add('act.trade')
  else if (activity === 'patrol') permissions.add('act.patrol')
  else if (activity === 'sleep' || activity === 'eat') permissions.add('act.rest')
  else permissions.add('act.work')
  return [...permissions].sort()
}

function canNpcStatesInteract(a: NpcRuntimeState, b: NpcRuntimeState): boolean {
  if (a.tile !== b.tile) return false
  if (Math.abs(a.subZ - b.subZ) > INTERACT_MAX_Z_DISTANCE) return false
  const planarDistance = Math.hypot(a.subCol - b.subCol, a.subRow - b.subRow)
  return planarDistance <= INTERACT_MAX_PLANAR_DISTANCE
}

/**
 * 個性 nudge：只對「天生會遊蕩」的 archetype 有效。
 *
 * - entertainer + 極高 talkativeness：可能去鄰近 tile 湊熱鬧（且鄰居人多得明顯）
 * - outsider：高 greed 配低 patience 時往不安全鄰區「找事」
 *
 * Duty-anchored roles still use schedule windows as the strong source of truth.
 * They can leave through routine slots or injected off-duty errands, but this
 * nudge layer does not pull them away from an active duty window.
 *
 * 不會把 NPC 拉到 walkable=false 或不存在的 tile（依 MAP_ADJACENCY 限制）。
 */
function computePersonalityNudge(
  profile: NpcProfile,
  before: NpcRuntimeState,
  scheduleTarget: string,
  context: NpcTickContext | null,
  crowdByTile: ReadonlyMap<string, number>,
  currentTick: number
): { targetTile: string; reason: string } | null {
  const arch = (profile.personality.archetype as string | undefined) ?? ''

  // 只對 entertainer / outsider 啟用 nudge；其它角色由 duty-weighted schedule 驅動。
  if (arch !== 'entertainer' && arch !== 'outsider') return null

  // 健康 / 心情低落 → 不漂泊，回家 / 留崗。
  if (before.mood < 30 || before.health < 30) return null

  // 半夜（前 18% / 後 15% 的 day）不漂；NPC 該在睡覺時段休息。
  const tickOfDay = ((currentTick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  const isNight = tickOfDay < TICKS_PER_DAY * 0.18 || tickOfDay > TICKS_PER_DAY * 0.85
  if (isNight) return null

  if (arch === 'entertainer') {
    const talkativeness = numOrDefault(profile.personality.talkativeness, 0.5)
    if (talkativeness < 0.9) return null
    const target = pickMostCrowdedNeighbor(before.tile, crowdByTile)
    if (target && target !== scheduleTarget) {
      return { targetTile: target, reason: 'seek-company' }
    }
  }

  if (arch === 'outsider' && context) {
    const greed = numOrDefault(profile.personality.greed, 0.3)
    const patience = numOrDefault(profile.personality.patience, 0.6)
    if (greed >= 0.4 && patience < 0.6) {
      const target = pickLowestSafetyNeighbor(before.tile, context.areaSafety)
      if (target && target !== scheduleTarget) {
        return { targetTile: target, reason: 'risk-seeking' }
      }
    }
  }

  return null
}

function pickMostCrowdedNeighbor(
  origin: string,
  crowdByTile: ReadonlyMap<string, number>
): string | null {
  const neighbors = MAP_ADJACENCY[origin] ?? []
  let best: string | null = null
  let bestCount = (crowdByTile.get(origin) ?? 0) + 1 // 必須比目前 tile 多至少 1
  for (const n of neighbors) {
    const count = crowdByTile.get(n) ?? 0
    if (count > bestCount) {
      bestCount = count
      best = n
    }
  }
  return best
}

function pickLowestSafetyNeighbor(
  origin: string,
  safetyMap: ReadonlyMap<string, number>
): string | null {
  const neighbors = MAP_ADJACENCY[origin] ?? []
  const ownSafety = safetyMap.get(origin) ?? 100
  let best: string | null = null
  let bestSafety = ownSafety - 5 // 必須比目前 tile 至少危險 5 點
  for (const n of neighbors) {
    const s = safetyMap.get(n)
    if (typeof s !== 'number') continue
    if (s < bestSafety) {
      bestSafety = s
      best = n
    }
  }
  return best
}

function numOrDefault(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function stepToward(current: number, target: number): number {
  if (current < target) return current + 1
  if (current > target) return current - 1
  return current
}

/** 進入新 tile 時放在邊緣（看起來像從旁邊街走進來）。 */
function entrySubTile(
  npcId: string,
  fromTile: string,
  toTile: string,
  tick: number
): { col: number; row: number } {
  const h = hashStr(`${npcId}|${fromTile}|${toTile}|${tick}|entry`)
  const side = h % 4
  const innerColRange = SUB_INNER_MAX_COL - SUB_INNER_MIN_COL + 1
  const innerRowRange = SUB_INNER_MAX_ROW - SUB_INNER_MIN_ROW + 1
  if (side === 0) return { col: 0, row: SUB_INNER_MIN_ROW + ((h >>> 8) % innerRowRange) }
  if (side === 1)
    return { col: AREA_SUB_COLS - 1, row: SUB_INNER_MIN_ROW + ((h >>> 8) % innerRowRange) }
  if (side === 2) return { col: SUB_INNER_MIN_COL + ((h >>> 8) % innerColRange), row: 0 }
  return { col: SUB_INNER_MIN_COL + ((h >>> 8) % innerColRange), row: AREA_SUB_ROWS - 1 }
}

/** 在當前 tile 內，依 (npcId, tile, activity, refreshIdx) 決定下一個目標子格。 */
function subAnchor(
  npcId: string,
  tile: string,
  activity: NpcActivity,
  tick: number
): { col: number; row: number } {
  const refreshIdx = Math.floor(tick / SUB_TARGET_REFRESH_TICKS)
  const h = hashStr(`${npcId}|${tile}|${activity}|${refreshIdx}`)
  const innerColRange = SUB_INNER_MAX_COL - SUB_INNER_MIN_COL + 1
  const innerRowRange = SUB_INNER_MAX_ROW - SUB_INNER_MIN_ROW + 1
  return {
    col: SUB_INNER_MIN_COL + (h % innerColRange),
    row: SUB_INNER_MIN_ROW + ((h >>> 8) % innerRowRange)
  }
}

function initialSubTile(npcId: string, tile: string): { col: number; row: number } {
  const h = hashStr(`${npcId}|${tile}|init`)
  const innerColRange = SUB_INNER_MAX_COL - SUB_INNER_MIN_COL + 1
  const innerRowRange = SUB_INNER_MAX_ROW - SUB_INNER_MIN_ROW + 1
  return {
    col: SUB_INNER_MIN_COL + (h % innerColRange),
    row: SUB_INNER_MIN_ROW + ((h >>> 8) % innerRowRange)
  }
}

function hashStr(s: string): number {
  let h = 5381
  for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return h
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  const r = Math.round(n)
  if (r < lo) return lo
  if (r > hi) return hi
  return r
}

function pickSlot(schedule: readonly ScheduleSlot[], tickOfDay: number): ScheduleSlot | null {
  for (const slot of schedule) {
    if (tickOfDay >= slot.fromTickOfDay && tickOfDay < slot.toTickOfDay) {
      return slot
    }
  }
  return null
}

function deriveSchedule(profile: NpcProfile): ScheduleSlot[] {
  // 既有 routine 已經是「每段一個 location + label」。把 label 轉成 activity
  // 再保留時段，達成 schedule = 行程 + 活動 同時表達。
  const out: ScheduleSlot[] = []
  for (const slot of profile.routine) {
    out.push({
      fromTickOfDay: slot.fromTickOfDay,
      toTickOfDay: slot.toTickOfDay,
      location: slot.location,
      activity: inferActivityFromLabel(slot.label, profile)
    })
  }
  if (out.length === 0) {
    // routine 也是空的 — 給一個全天 idle 的預設
    out.push({
      fromTickOfDay: 0,
      toTickOfDay: TICKS_PER_DAY,
      location: profile.defaultLocation,
      activity: 'idle'
    })
  }
  // 若整天行程的所有 location 都相同，注入一段「跨區外出」slot。
  // 職責型 NPC 只拿較短的 off-duty errand；wanderer 則保留較長遊蕩時段。
  return injectDutyWeightedTravelIfStuck(profile, out)
}

function injectDutyWeightedTravelIfStuck(
  profile: NpcProfile,
  slots: ScheduleSlot[]
): ScheduleSlot[] {
  const distinctLocations = new Set(slots.map((s) => s.location))
  if (distinctLocations.size > 1) return slots

  const home = slots[0]?.location ?? profile.defaultLocation
  const neighbors = MAP_ADJACENCY[home] ?? []
  if (neighbors.length === 0) return slots

  // 跨區意願取決於 archetype + role：職責型 NPC 大部分時間待在崗位，
  // 但不能永久鎖死；wanderer 才會佔掉中段三分之一去鄰區。
  const arch = (profile.personality.archetype as string | undefined) ?? ''
  const wanderer = arch === 'entertainer' || arch === 'outsider' || /獵|hunter|流浪|報童/.test(profile.role.zh)
  const dutyAnchored = isDutyAnchoredProfile(profile)

  // deterministic neighbor pick：用 npcId hash mod neighbor count
  let h = 5381
  for (const ch of profile.id) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  const target = neighbors[h % neighbors.length]!
  if (target === home) return slots

  // 找最長的 slot 切出跨區外出。職責型只切短窗口，表達 duty weight。
  let longestIdx = 0
  let longestLen = 0
  for (let i = 0; i < slots.length; i += 1) {
    const len = slots[i]!.toTickOfDay - slots[i]!.fromTickOfDay
    if (len > longestLen) {
      longestLen = len
      longestIdx = i
    }
  }
  const slot = slots[longestIdx]!
  const span = slot.toTickOfDay - slot.fromTickOfDay
  if (span < 60) return slots // 太短的 slot 不切

  const startCut =
    dutyAnchored && !wanderer
      ? slot.fromTickOfDay + Math.floor((span * 2) / 3)
      : slot.fromTickOfDay + Math.floor(span / 3)
  const endCut =
    dutyAnchored && !wanderer
      ? slot.fromTickOfDay + Math.floor((span * 5) / 6)
      : slot.fromTickOfDay + Math.floor((span * 2) / 3)
  const outActivity = inferActivityFromLabel('errand', profile)

  const out: ScheduleSlot[] = []
  for (let i = 0; i < slots.length; i += 1) {
    if (i !== longestIdx) {
      out.push(slots[i]!)
      continue
    }
    out.push({
      fromTickOfDay: slot.fromTickOfDay,
      toTickOfDay: startCut,
      location: home,
      activity: slot.activity
    })
    out.push({
      fromTickOfDay: startCut,
      toTickOfDay: endCut,
      location: target,
      activity: outActivity
    })
    out.push({
      fromTickOfDay: endCut,
      toTickOfDay: slot.toTickOfDay,
      location: home,
      activity: slot.activity
    })
  }
  return out
}

function inferActivityFromLabel(label: string | undefined, profile: NpcProfile): NpcActivity {
  if (!label) return inferActivityFromRole(profile)
  const lower = label.toLowerCase()
  if (LABEL_SLEEP_PATTERN.test(lower)) return 'sleep'
  if (LABEL_EAT_PATTERN.test(lower)) return 'eat'
  if (LABEL_ERRAND_PATTERN.test(lower)) return inferErrandActivityFromProfile(profile)
  if (LABEL_TRADE_PATTERN.test(lower)) return 'trade'
  if (LABEL_PATROL_PATTERN.test(lower)) return 'patrol'
  if (LABEL_WORK_PATTERN.test(lower)) return 'work'
  return inferActivityFromRole(profile)
}

function inferErrandActivityFromProfile(profile: NpcProfile): NpcActivity {
  const roleActivity = inferActivityFromRole(profile)
  if (roleActivity === 'trade' || roleActivity === 'patrol') return roleActivity
  const arch = String(profile.personality.archetype ?? '')
  if (arch === 'shopkeeper') return 'trade'
  if (arch === 'guard' || arch === 'outsider') return 'patrol'
  if (arch === 'craftsman' || arch === 'civic' || arch === 'cleric' || arch === 'mystic') return 'work'
  const roll = hashStr(`${profile.id}|errand-activity`) % 4
  return roll === 0 ? 'eat' : roll === 1 ? 'trade' : roll === 2 ? 'patrol' : 'work'
}

function inferActivityFromRole(profile: NpcProfile): NpcActivity {
  const role = (profile.role.zh ?? '').toString()
  if (/(交易|exchange|商|商人)/i.test(role)) return 'trade'
  if (/(獵|hunter|patrol)/i.test(role)) return 'patrol'
  if (/(僧|abbot|cleric|塔|guard)/i.test(role)) return 'work'
  return 'idle'
}

/**
 * v0.15.14：判斷 NPC 是否「職責錨定」— 這類 NPC 大部分時間留在
 * defaultLocation，但職責只是 schedule 權重，不是跨區 hard lock。
 *
 * 邏輯：archetype 屬於固定崗位類（mystic / shopkeeper / craftsman / guard /
 * civic / cleric）→ anchored；或 role.zh 含特定崗位字（祭司 / 僧 / 守衛 / 店長 /
 * 老闆 / 鑄 / 匠 / 修 / 醫 / 工 / 員工 / abbot / cleric / priest / guard /
 * shopkeeper）→ anchored。
 *
 * Wanderer archetype（entertainer / outsider）即使 role 含「商」也不算職責錨定。
 */
function isDutyAnchoredProfile(profile: NpcProfile): boolean {
  const arch = (profile.personality.archetype as string | undefined) ?? ''
  if (arch === 'entertainer' || arch === 'outsider') return false
  const lockedArchetypes = new Set([
    'mystic',
    'shopkeeper',
    'craftsman',
    'guard',
    'civic',
    'cleric'
  ])
  if (lockedArchetypes.has(arch)) return true
  const role = (profile.role.zh ?? '').toString()
  if (/(祭司|僧|住持|主教|守衛|衛兵|店長|老闆|鑄|匠|修士|醫|工坊|員工|司祭)/.test(role)) {
    return true
  }
  if (/(abbot|cleric|priest|guard|shopkeeper|smith)/i.test(role)) return true
  return false
}

// 0..1 deterministic：把 (tick, a, b) hash 成數字
function pairRoll(tick: number, a: string, b: string): number {
  let h = (tick * 2654435761) >>> 0
  for (const ch of `${a}|${b}`) {
    h = (h ^ ch.charCodeAt(0)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h % 1000) / 1000
}

/**
 * 互動敘事：根據兩位 NPC 的 archetype + role + faction 從一個大句型池
 * deterministic 挑一句。v0.15.3 大幅擴充模板量並讓 seed 涵蓋 tick + 天氣，
 * 解決使用者回報「編年史每條都長一樣」的問題。
 *
 * 我們不真的呼 AI（會 burn 太多 quota，且 NPC 互動每 tick 都可能發生）。
 * 但每個分支至少 6-12 句變體，加上 (a,b,tile,mode,tick,weather) 都進
 * seed，連續看的時候不會撞到同一句。
 */
function composeInteractionNarration(
  a: NpcProfile,
  b: NpcProfile,
  mode: 'chat' | 'argue',
  tile: string,
  tick: number,
  weather: string
): string {
  const tileName = TILE_NAME_BY_ID[tile] ?? tile
  const archA = String(a.personality.archetype ?? '')
  const archB = String(b.personality.archetype ?? '')
  const factionA = String(a.personality.factionLean ?? '')
  const factionB = String(b.personality.factionLean ?? '')
  const sameFaction = factionA && factionA === factionB
  const archs = new Set([archA, archB])
  const A = a.name.zh
  const B = b.name.zh

  // deterministic seed per pair + tick + weather → 即使同一對 NPC 同一場景，
  // 不同 tick 拿到的句子會不一樣。tick 本身就讓敘事不會「永遠卡在同一句」。
  let seed = 5381
  for (const ch of `${a.id}|${b.id}|${tile}|${mode}|${weather}`) {
    seed = ((seed * 33) ^ ch.charCodeAt(0)) >>> 0
  }
  seed = (seed ^ (tick * 2654435761)) >>> 0
  const pick = <T>(arr: readonly T[]): T => arr[seed % arr.length]!

  if (mode === 'chat') {
    // 同派系：氣氛親密、共謀感
    if (sameFaction) {
      return pick([
        `${A}和${B}在${tileName}互換最近聽到的風聲，腦袋湊得很近。`,
        `${A}遞給${B}一張抄寫的字條，兩人在${tileName}的角落低聲對齊細節。`,
        `${A}與${B}在${tileName}並肩站著，從口風到肢體都看得出是熟人。`,
        `${A}用肘撞了撞${B}，兩人在${tileName}笑著用只有彼此聽得懂的暗語對話。`,
        `${A}在${tileName}的廊柱旁向${B}比了個手勢，${B}會意地點頭。`,
        `${A}帶著${B}繞到${tileName}的後巷，把袖中那張紙條塞了過去。`
      ])
    }
    // archetype 組合：祭司 + 任意 → 莊嚴 / 神秘
    if (archs.has('mystic')) {
      return pick([
        `${A}在${tileName}向${B}描述昨夜脈網的紋路，${B}聽得屏住呼吸。`,
        `${A}在${tileName}用指尖在空中畫了一個微小的符，${B}盯著沒動。`,
        `${A}和${B}在${tileName}低聲談起鏡面湖水的反光，話裡有玄機。`,
        `${A}向${B}解釋一段古老術式的吐納節奏，${tileName}的空氣彷彿短暫變慢。`,
        `${A}在${tileName}遞過一段風乾草藥，${B}聞了一下表情變得嚴肅。`
      ])
    }
    // 商店主 + 商店主
    if (archA === 'shopkeeper' && archB === 'shopkeeper') {
      return pick([
        `${A}在${tileName}向${B}打聽某張紋卡的最新價碼，雙方互相試水溫。`,
        `${A}和${B}在${tileName}的攤位之間比劃利潤抽成，沒人先讓步。`,
        `${A}向${B}抱怨進貨成本，${B}邊抽算盤邊在${tileName}苦笑。`,
        `${A}從袖子裡抽出小本子和${B}核對昨日帳目，${tileName}的攤車蓋上薄薄一層白灰。`
      ])
    }
    // 工匠
    if (archs.has('craftsman')) {
      return pick([
        `${A}在${tileName}向${B}炫耀自己昨日做出來的物件，對方半笑半點頭。`,
        `${A}把一塊燒了一半的礦砂遞給${B}，${B}在${tileName}舉到光下端詳。`,
        `${A}和${B}在${tileName}的工棚門口蹲下來，邊敲邊磨地比對手感。`,
        `${A}指著一條剛刻好的紋路問${B}意見，${B}在${tileName}皺眉很久才回答。`
      ])
    }
    // 守衛 / 巡邏
    if (archs.has('guard')) {
      return pick([
        `${A}在${tileName}和${B}交班，順手把一條警戒線索壓低聲音傳了過去。`,
        `${A}和${B}在${tileName}巡到同一個轉角，沒多話，只互相點了個頭。`,
        `${A}向${B}比了個「左前方」的手勢，${tileName}的人群暫時被避開。`
      ])
    }
    // 公務 / 行政
    if (archs.has('civic')) {
      return pick([
        `${A}在${tileName}遞給${B}一張蓋了印的單據，${B}揉了揉眉心。`,
        `${A}和${B}在${tileName}核對名冊，邊講邊用筆桿戳著紙。`,
        `${A}向${B}抱怨上面又下了新規矩，${tileName}的午後變得格外漫長。`
      ])
    }
    // 流浪 / 外來客
    if (archs.has('outsider')) {
      return pick([
        `${A}在${tileName}向${B}討一杯熱水，順便講了一段別處的傳聞。`,
        `${A}和${B}在${tileName}的角落分了一塊乾糧，沒有人問對方從哪裡來。`,
        `${A}向${B}吹噓他剛從鄰區帶回來的奇聞，${B}半信半疑。`
      ])
    }
    // 預設池：通用閒聊
    return pick([
      `${A}與${B}在${tileName}低聲交談了幾句，似乎在交換消息。`,
      `${A}和${B}在${tileName}的攤車旁站了一會，話題從天氣岔到最近的紋卡傳聞。`,
      `${A}遇上${B}，兩人在${tileName}寒暄三句後又各自轉身離開。`,
      `${A}在${tileName}認出了${B}，停下腳步講了一段共同認識的人。`,
      `${A}和${B}在${tileName}的長椅上坐了一會，講起十年前的潮汐。`,
      `${A}在${tileName}的階梯旁問起${B}家中近況，${B}的笑帶著淡淡疲倦。`,
      `${A}和${B}在${tileName}的拐角碰見，把手裡的東西交換了一下就分開。`,
      // 帶天氣：讓敘事感受得到當下世界
      ...(weather === '驟雨' || weather === '霧雨'
        ? [
            `${A}和${B}在${tileName}簷下暫避雨水，趁機交換幾句近日見聞。`,
            `${A}用披風幫${B}擋了一下雨絲，兩人在${tileName}短暫地並肩站著。`
          ]
        : []),
      ...(weather === '微風'
        ? [`${A}和${B}在${tileName}的風口聊了幾句，被吹散的紙屑沿著腳邊打轉。`]
        : []),
      ...(weather === '晴'
        ? [`${A}和${B}在${tileName}的陽光下站著對話，影子被拉得很長。`]
        : [])
    ])
  }

  // ---- argue ----

  // 跨派系：政治火藥味
  if (factionA && factionB && factionA !== factionB) {
    return pick([
      `${A}與${B}在${tileName}就派系規矩起了口角，圍觀的人都退了半步。`,
      `${A}指著${B}的鼻尖在${tileName}爭吵，兩個派系的氣味在街口僵持。`,
      `${A}冷冷把${B}的徽章撥開，在${tileName}的人群裡丟下一句重話就走。`,
      `${A}和${B}在${tileName}互數派系舊帳，圍觀的攤主都把布幔放下。`,
      `${A}在${tileName}質問${B}前夜的行徑，${B}沒退一步，雙方僵在原地。`
    ])
  }
  // 兩商人：撕錢
  if (archA === 'shopkeeper' && archB === 'shopkeeper') {
    return pick([
      `${A}和${B}在${tileName}為了一筆訂金的歸屬撕破臉，攤位之間突然冷清。`,
      `${A}把帳本摔在${B}的攤位上，${tileName}的午市暫時靜了下來。`,
      `${A}指著秤盤，質問${B}砝碼有沒有動過，${tileName}周圍的人都伸長脖子看。`
    ])
  }
  // 神秘 + 任意：教派衝突
  if (archs.has('mystic')) {
    return pick([
      `${A}在${tileName}質問${B}是否動過供品的位置，${B}臉色一沉。`,
      `${A}低聲斥${B}褻瀆了脈網的禮節，${tileName}的紙符一張張捲起。`,
      `${A}用一句古話刺向${B}，${tileName}的人群屏住呼吸聽不懂卻知道很重。`
    ])
  }
  // 守衛：公權力 vs 任意
  if (archs.has('guard')) {
    return pick([
      `${A}攔下${B}盤問，${tileName}的行人下意識繞了個半圓。`,
      `${A}用警棍底端輕點${B}的胸口示意停步，${tileName}的氣氛瞬間冷下來。`,
      `${A}和${B}在${tileName}就一張通行條互不相讓，雙方都不肯先把手放下。`
    ])
  }
  // 預設池：通用爭執
  return pick([
    `${A}與${B}在${tileName}就一句話的分歧吵了起來，旁人裝作沒聽見走開。`,
    `${A}冷笑了一聲，${B}在${tileName}沒有讓步，兩人對視了很久。`,
    `${A}和${B}在${tileName}各執一詞，圍觀的人不久就散去。`,
    `${A}重重地把手裡的東西放回攤上，${B}在${tileName}也提高了聲量。`,
    `${A}和${B}在${tileName}互不相讓地比劃了幾下，最後誰也沒收回那句話。`,
    `${A}向${B}丟下一句尖刻的話，${tileName}的午後便顯得格外刺耳。`,
    `${A}皺起眉頭，${B}在${tileName}也不肯先開口認錯。`,
    ...(weather === '驟雨' || weather === '霧雨'
      ? [`${A}和${B}在${tileName}的雨棚下吵起來，雨聲反而把火氣壓得更明顯。`]
      : []),
    ...(weather === '陰'
      ? [`${A}和${B}在${tileName}的陰影裡互相讓也不讓，氣氛壓得很低。`]
      : [])
  ])
}

function isActivity(value: unknown): value is NpcActivity {
  return (
    typeof value === 'string' &&
    ['idle', 'move', 'work', 'eat', 'sleep', 'trade', 'patrol'].includes(value)
  )
}

function isAgentTaskKind(value: unknown): value is NpcAgentTaskKind {
  return (
    typeof value === 'string' &&
    [
      'bootstrap',
      'scheduled-duty',
      'personality-nudge',
      'travel',
      'local-activity',
      'social-interaction',
      'player-dialog'
    ].includes(value)
  )
}

function isDecisionSource(value: unknown): value is NpcAgentState['lastDecision']['source'] {
  return (
    typeof value === 'string' &&
    ['bootstrap', 'schedule', 'personality', 'movement', 'social', 'player'].includes(value)
  )
}

function statesEqual(a: NpcRuntimeState, b: NpcRuntimeState): boolean {
  if (
    a.tile !== b.tile ||
    a.targetTile !== b.targetTile ||
    a.activity !== b.activity ||
    a.faction !== b.faction ||
    a.lastActedTick !== b.lastActedTick ||
    Math.round(a.mood) !== Math.round(b.mood) ||
    Math.round(a.health) !== Math.round(b.health) ||
    a.subCol !== b.subCol ||
    a.subRow !== b.subRow ||
    a.subZ !== b.subZ
  ) {
    return false
  }
  const ao = a.personalityOverride ?? null
  const bo = b.personalityOverride ?? null
  const ar = a.travelRoute ?? null
  const br = b.travelRoute ?? null
  const routeEqual =
    ar === null && br === null
      ? true
      : ar !== null &&
        br !== null &&
        ar.fromTile === br.fromTile &&
        ar.toTile === br.toTile &&
        ar.targetTile === br.targetTile &&
        ar.startedAtTick === br.startedAtTick
  if (!routeEqual) return false
  if (!agentStatesEqual(a.agent, b.agent)) return false
  if (ao === null && bo === null) return true
  if (ao === null || bo === null) return false
  return ao.targetTile === bo.targetTile && ao.expiresAtTick === bo.expiresAtTick
}

function agentStatesEqual(a: NpcAgentState, b: NpcAgentState): boolean {
  if (a.profileId !== b.profileId) return false
  if (a.permissions.length !== b.permissions.length) return false
  for (let i = 0; i < a.permissions.length; i += 1) {
    if (a.permissions[i] !== b.permissions[i]) return false
  }
  const at = a.activeTask
  const bt = b.activeTask
  if (
    at.kind !== bt.kind ||
    at.reason !== bt.reason ||
    at.targetTile !== bt.targetTile ||
    at.startedAtTick !== bt.startedAtTick ||
    at.expiresAtTick !== bt.expiresAtTick
  ) {
    return false
  }
  return (
    a.lastDecision.tick === b.lastDecision.tick &&
    a.lastDecision.source === b.lastDecision.source &&
    a.lastDecision.reason === b.lastDecision.reason
  )
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo
  if (value < lo) return lo
  if (value > hi) return hi
  return value
}

// 給 runtime / 測試用：每 hour 約多少 tick → 用來標示 cooldown
export const NPC_INTERACT_COOLDOWN_TICKS = INTERACT_COOLDOWN_TICKS
export const NPC_PLAYER_DIALOG_HOLD_TICKS = PLAYER_DIALOG_HOLD_TICKS
export const _TICKS_PER_HOUR = TICKS_PER_HOUR

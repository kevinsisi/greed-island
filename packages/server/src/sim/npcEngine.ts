// NPC engine — 每個 tick 為每位 NPC：
//   1. 從 schedule slot 解出 target_tile + 預期 activity
//   2. 若 current_tile !== target_tile：BFS 走一格
//   3. 若已在 target_tile：執行該 slot 的 activity（work / eat / sleep / idle）
//   4. mood / health 隨活動緩慢漂移
//   5. 同 tile 兩兩 NPC 以 deterministic 機率觸發互動 (chat / argue)
//
// 所有狀態變化都以 FactSet draft 形式回傳給 SimulationRuntime；engine
// 本身不直接寫 EventLog，符合 deterministic kernel 的 command-vs-event
// 分離原則。狀態 key：
//   npc.state.<id> = { tile, mood, health, activity, faction, targetTile, lastActedTick }
//
// hydrate：runtime 啟動時把 reducer 算出的 facts 透過 hydrate() 餵回。

import type { NpcProfile } from '../npcs/types.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/world.js'
import { MAP_ADJACENCY, TILE_NAME_BY_ID, nextStepTowards } from './mapGraph.js'

export type NpcActivity = 'idle' | 'move' | 'work' | 'eat' | 'sleep' | 'trade' | 'patrol'

export type NpcRuntimeState = {
  tile: string
  mood: number
  health: number
  activity: NpcActivity
  faction: string
  targetTile: string
  lastActedTick: number
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
      this.state.set(profile.id, {
        tile: profile.defaultLocation,
        mood: 60,
        health: 80,
        activity: 'idle',
        faction: fac,
        targetTile: profile.defaultLocation,
        lastActedTick: 0
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
    const next: NpcRuntimeState = {
      tile: typeof r.tile === 'string' ? r.tile : fallbackTile,
      mood: clamp(typeof r.mood === 'number' ? r.mood : 60, MOOD_MIN, MOOD_MAX),
      health: clamp(
        typeof r.health === 'number' ? r.health : 80,
        HEALTH_MIN,
        HEALTH_MAX
      ),
      activity: isActivity(r.activity) ? r.activity : 'idle',
      faction: typeof r.faction === 'string' ? r.faction : fac,
      targetTile: typeof r.targetTile === 'string' ? r.targetTile : fallbackTile,
      lastActedTick: typeof r.lastActedTick === 'number' ? r.lastActedTick : 0
    }
    this.state.set(npcId, next)
  }

  getState(npcId: string): NpcRuntimeState | null {
    return this.state.get(npcId) ?? null
  }

  /** 跑一個 tick 的 NPC decisioning，回傳要寫入的事件 + 狀態變更。 */
  tick(currentTick: number): NpcTickResult {
    const events: NpcDecisionEvent[] = []
    // 用 Set 紀錄本 tick 內變動過的 npcId，最後再從 state map 取一份快照，
    // 確保每個 npcId 在 changedStates 中只出現一次（避免重複 FactSet 同 hash）。
    const dirty = new Set<string>()
    // 儲存進 tick 開始時的初始狀態，以便最後比對是否真的改變
    const initial = new Map<string, NpcRuntimeState>()
    for (const [id, s] of this.state) initial.set(id, s)

    // ---- Phase 1: 每個 NPC 自己的決策 ----
    for (const profile of this.profiles) {
      const before = this.state.get(profile.id)
      if (!before) continue
      const next = decideNextState(profile, before, this.schedules.get(profile.id) ?? [], currentTick)
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
      if (
        next.tile !== before.tile ||
        next.activity !== before.activity ||
        Math.round(next.mood) !== Math.round(before.mood) ||
        Math.round(next.health) !== Math.round(before.health) ||
        next.targetTile !== before.targetTile
      ) {
        this.state.set(profile.id, next)
        dirty.add(profile.id)
      }
    }

    // ---- Phase 2: 同 tile NPC 兩兩互動 ----
    // 規則：
    //   - 必須同一 tile（NPC 必須真的走到對方旁邊，不能隔空）
    //   - 兩位 NPC 都不能正在移動（activity != 'move'）— 路上交錯不算交談
    //   - 每個 tile 每 tick 最多 1 個互動事件，挑 pairRoll 最低的 pair
    const byTile = new Map<string, string[]>()
    for (const [npcId, s] of this.state) {
      if (s.activity === 'move') continue // 路上不算「在場」
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
          const roll = pairRoll(currentTick, a, b)
          if (roll >= INTERACT_PROBABILITY) continue
          if (!bestPair || roll < bestPair.roll) bestPair = { a, b, roll }
        }
      }
      if (!bestPair) continue

      const { a, b } = bestPair
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
      const narration = composeInteractionNarration(profileA, profileB, mode, tile)
      events.push({
        kind: 'interact',
        tile,
        participants: [a, b],
        mode,
        narration
      })
      // 互動影響 mood（clamp 後寫回 state map；最後 dedupe 統一 emit）
      const sa = this.state.get(a)!
      const sb = this.state.get(b)!
      const delta = mode === 'chat' ? +1 : -2
      const na = { ...sa, mood: clamp(sa.mood + delta, MOOD_MIN, MOOD_MAX) }
      const nb = { ...sb, mood: clamp(sb.mood + delta, MOOD_MIN, MOOD_MAX) }
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
}

function decideNextState(
  profile: NpcProfile,
  before: NpcRuntimeState,
  schedule: readonly ScheduleSlot[],
  currentTick: number
): NpcRuntimeState {
  const tickOfDay = ((currentTick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  const slot = pickSlot(schedule, tickOfDay)
  const targetTile = slot?.location ?? before.targetTile ?? profile.defaultLocation

  let nextTile = before.tile
  let activity: NpcActivity
  if (before.tile !== targetTile) {
    const step = nextStepTowards(before.tile, targetTile)
    if (step) {
      nextTile = step
      activity = 'move'
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

  return {
    tile: nextTile,
    targetTile,
    activity,
    mood,
    health,
    faction: before.faction,
    lastActedTick:
      activity === 'idle' && nextTile === before.tile
        ? before.lastActedTick
        : currentTick
  }
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
  // 若整天行程的所有 location 都相同，注入一段「跨區外出」slot：
  // 取最長的 slot，把它的 location 換成 deterministic 鄰居 tile，
  // 確保 NPC 每天至少跨區一次（大部分 daily-life NPC 原本永遠待原地）。
  return injectCrossTileWanderIfStuck(profile, out)
}

function injectCrossTileWanderIfStuck(
  profile: NpcProfile,
  slots: ScheduleSlot[]
): ScheduleSlot[] {
  const distinctLocations = new Set(slots.map((s) => s.location))
  if (distinctLocations.size > 1) return slots

  const home = slots[0]?.location ?? profile.defaultLocation
  const neighbors = MAP_ADJACENCY[home] ?? []
  if (neighbors.length === 0) return slots

  // deterministic neighbor pick：用 npcId hash mod neighbor count
  let h = 5381
  for (const ch of profile.id) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  const target = neighbors[h % neighbors.length]!
  if (target === home) return slots

  // 找最長的 slot 把它中間 1/3 切成跨區外出
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

  const startCut = slot.fromTickOfDay + Math.floor(span / 3)
  const endCut = slot.fromTickOfDay + Math.floor((span * 2) / 3)
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
  if (/(sleep|night|rest|hideout)/.test(lower)) return 'sleep'
  if (/(eat|meal|breakfast|lunch|dinner|tea|kitchen|market.*food)/.test(lower)) return 'eat'
  if (/(trade|trading|exchange|sell|sale|stall|counter|clearing)/.test(lower)) return 'trade'
  if (/(patrol|watch|guard|scout|hunt)/.test(lower)) return 'patrol'
  if (/(work|ledger|study|review|prepare|whisper|gossip|intel|brewing|forge|appraisal)/.test(lower))
    return 'work'
  return inferActivityFromRole(profile)
}

function inferActivityFromRole(profile: NpcProfile): NpcActivity {
  const role = (profile.role.zh ?? '').toString()
  if (/(交易|exchange|商|商人)/i.test(role)) return 'trade'
  if (/(獵|hunter|patrol)/i.test(role)) return 'patrol'
  if (/(僧|abbot|cleric|塔|guard)/i.test(role)) return 'work'
  return 'idle'
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
 * 互動敘事：根據兩位 NPC 的 archetype + role 寫具體場景，而不是模板兩
 * 行字。我們不真的呼 AI（會 burn 太多 quota），而是用 deterministic
 * 句型庫從一組挑句子，並依 archetype / faction 決定語氣。
 */
function composeInteractionNarration(
  a: NpcProfile,
  b: NpcProfile,
  mode: 'chat' | 'argue',
  tile: string
): string {
  const tileName = TILE_NAME_BY_ID[tile] ?? tile
  const archA = String(a.personality.archetype ?? '')
  const archB = String(b.personality.archetype ?? '')
  const factionA = String(a.personality.factionLean ?? '')
  const factionB = String(b.personality.factionLean ?? '')
  const sameFaction = factionA && factionA === factionB

  // deterministic seed per pair
  let seed = 5381
  for (const ch of `${a.id}|${b.id}|${tile}|${mode}`) seed = ((seed * 33) ^ ch.charCodeAt(0)) >>> 0
  const pick = <T>(arr: readonly T[]): T => arr[seed % arr.length]!

  if (mode === 'chat') {
    if (sameFaction) {
      return pick([
        `${a.name.zh}和${b.name.zh}在${tileName}互換最近聽到的風聲，腦袋湊得很近。`,
        `${a.name.zh}遞給${b.name.zh}一張抄寫的字條，兩人在${tileName}的角落低聲對齊細節。`,
        `${a.name.zh}與${b.name.zh}在${tileName}並肩站著，從口風到肢體都看得出是熟人。`
      ])
    }
    if (archA === 'shopkeeper' || archB === 'shopkeeper') {
      return `${a.name.zh}在${tileName}向${b.name.zh}打聽某張紋卡的最新價碼，雙方互相試水溫。`
    }
    if (archA === 'mystic' || archB === 'mystic') {
      return `${a.name.zh}在${tileName}聽${b.name.zh}解釋一條脈網訊號，眼神凝重。`
    }
    if (archA === 'craftsman' || archB === 'craftsman') {
      return `${a.name.zh}在${tileName}向${b.name.zh}炫耀自己昨日做出來的物件，對方半笑半點頭。`
    }
    return pick([
      `${a.name.zh}與${b.name.zh}在${tileName}低聲交談了幾句，似乎在交換消息。`,
      `${a.name.zh}和${b.name.zh}在${tileName}的攤車旁站了一會，話題從天氣岔到最近的紋卡傳聞。`,
      `${a.name.zh}遇上${b.name.zh}，兩人在${tileName}寒暄三句後又各自轉身離開。`
    ])
  }

  // argue
  if (factionA && factionB && factionA !== factionB) {
    return pick([
      `${a.name.zh}與${b.name.zh}在${tileName}就派系規矩起了口角，圍觀的人都退了半步。`,
      `${a.name.zh}指著${b.name.zh}的鼻尖在${tileName}爭吵，兩個派系的氣味在街口僵持。`
    ])
  }
  if (archA === 'shopkeeper' && archB === 'shopkeeper') {
    return `${a.name.zh}和${b.name.zh}在${tileName}為了一筆訂金的歸屬撕破臉，攤位之間突然冷清。`
  }
  return pick([
    `${a.name.zh}與${b.name.zh}在${tileName}起了爭執，氣氛緊繃。`,
    `${a.name.zh}的話被${b.name.zh}打斷，兩人在${tileName}的牆角僵成一塊。`,
    `${a.name.zh}冷笑了一聲，${b.name.zh}在${tileName}沒有讓步。`
  ])
}

function isActivity(value: unknown): value is NpcActivity {
  return (
    typeof value === 'string' &&
    ['idle', 'move', 'work', 'eat', 'sleep', 'trade', 'patrol'].includes(value)
  )
}

function statesEqual(a: NpcRuntimeState, b: NpcRuntimeState): boolean {
  return (
    a.tile === b.tile &&
    a.targetTile === b.targetTile &&
    a.activity === b.activity &&
    a.faction === b.faction &&
    a.lastActedTick === b.lastActedTick &&
    Math.round(a.mood) === Math.round(b.mood) &&
    Math.round(a.health) === Math.round(b.health)
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
export const _TICKS_PER_HOUR = TICKS_PER_HOUR

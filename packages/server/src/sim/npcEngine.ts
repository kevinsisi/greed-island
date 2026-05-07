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
import { TILE_NAME_BY_ID, nextStepTowards } from './mapGraph.js'

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
    const changedStates: NpcStateChange[] = []

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
        changedStates.push({ npcId: profile.id, state: next })
      }
    }

    // ---- Phase 2: 同 tile NPC 兩兩互動 ----
    const byTile = new Map<string, string[]>()
    for (const [npcId, s] of this.state) {
      const arr = byTile.get(s.tile) ?? []
      arr.push(npcId)
      byTile.set(s.tile, arr)
    }
    for (const [tile, ids] of byTile) {
      if (ids.length < 2) continue
      const sorted = [...ids].sort()
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const a = sorted[i]!
          const b = sorted[j]!
          const pairKey = `${a}|${b}`
          const last = this.lastInteractTickByPair.get(pairKey) ?? -INTERACT_COOLDOWN_TICKS
          if (currentTick - last < INTERACT_COOLDOWN_TICKS) continue
          const roll = pairRoll(currentTick, a, b)
          if (roll >= INTERACT_PROBABILITY) continue
          this.lastInteractTickByPair.set(pairKey, currentTick)

          const profileA = this.profiles.find((p) => p.id === a)
          const profileB = this.profiles.find((p) => p.id === b)
          if (!profileA || !profileB) continue
          const factionA = this.factions.get(a) ?? 'neutral'
          const factionB = this.factions.get(b) ?? 'neutral'
          const sameFaction = factionA === factionB
          const moodSum =
            (this.state.get(a)?.mood ?? 50) + (this.state.get(b)?.mood ?? 50)
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
          // 互動影響 mood
          const sa = this.state.get(a)!
          const sb = this.state.get(b)!
          const delta = mode === 'chat' ? +1 : -2
          const na = { ...sa, mood: clamp(sa.mood + delta, MOOD_MIN, MOOD_MAX) }
          const nb = { ...sb, mood: clamp(sb.mood + delta, MOOD_MIN, MOOD_MAX) }
          this.state.set(a, na)
          this.state.set(b, nb)
          changedStates.push({ npcId: a, state: na })
          changedStates.push({ npcId: b, state: nb })
        }
      }
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

function composeInteractionNarration(
  a: NpcProfile,
  b: NpcProfile,
  mode: 'chat' | 'argue',
  tile: string
): string {
  const tileName = TILE_NAME_BY_ID[tile] ?? tile
  if (mode === 'chat') {
    return `${a.name.zh}與${b.name.zh}在${tileName}低聲交談了幾句，似乎在交換消息。`
  }
  return `${a.name.zh}與${b.name.zh}在${tileName}起了爭執，氣氛緊繃。`
}

function isActivity(value: unknown): value is NpcActivity {
  return (
    typeof value === 'string' &&
    ['idle', 'move', 'work', 'eat', 'sleep', 'trade', 'patrol'].includes(value)
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

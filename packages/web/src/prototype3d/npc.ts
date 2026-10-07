import { WORLD, type DemoState, type NpcGoal, type NpcId, type NpcMemory, type NpcSkill, type NpcState, type Position } from './types'

export const NPC_IDS: NpcId[] = ['guide', 'herbalist', 'scout', 'sentinel']
export const NPC_MEMORY_LIMIT = 8
export const NPC_TALK_RANGE = 2.8
export const NPC_TALK_COOLDOWN = 10
export const NPC_GOAL_LABELS: Record<NpcGoal, string> = { gather: '採集補給', study: '研習島嶼', rest: '休息恢復', guard: '守護遺跡', observe: '觀察旅人', sleep: '休眠' }
export const NPC_SKILL_LABELS: Record<NpcSkill, string> = { gathering: '採集', study: '研習', guarding: '警戒' }
export const NPC_CONFIG: Record<NpcId, { name: string; role: string; home: Position; color: string }> = {
  guide: { name: '米拉', role: '守燈人', home: { ...WORLD.guide }, color: '#67c8b4' },
  herbalist: { name: '芙恩', role: '採藥師', home: { x: -7, z: -4 }, color: '#b9d784' },
  scout: { name: '洛安', role: '巡林人', home: { x: 7, z: 5 }, color: '#dfb46e' },
  sentinel: { name: '苔岩石衛', role: '遺跡守護者', home: { ...WORLD.enemy }, color: '#e89c78' },
}

const ROUTES: Record<NpcId, { gather: Position; study: Position }> = {
  guide: { gather: { x: -1.4, z: -18.6 }, study: { x: 1.4, z: -17.6 } },
  herbalist: { gather: { x: -6, z: -1 }, study: { x: -6, z: -7 } },
  scout: { gather: { x: 6, z: 7 }, study: { x: 6, z: 2 } },
  sentinel: { gather: { ...WORLD.enemy }, study: { ...WORLD.enemy } },
}
const WORK_SECONDS: Record<NpcGoal, number> = { gather: 6, study: 8, rest: 4, guard: 9, observe: 6, sleep: 1 }
const CURIOSITY_THRESHOLD: Record<NpcId, number> = { guide: 65, herbalist: 70, scout: 45, sentinel: 30 }
const MAX_STAT = 100
const MAX_SKILL = 10000
const MAX_SUPPLIES = 100
const MAX_ACTIONS = 1000000
const MAX_TIME = 1000000000
const WALK_SPEED = 0.8
const REACH_DISTANCE = 0.05
const LOW_ENERGY = 25
const RESTED_ENERGY = 85
const GOALS = Object.keys(NPC_GOAL_LABELS) as NpcGoal[]
const SKILLS = Object.keys(NPC_SKILL_LABELS) as NpcSkill[]
const MEMORY_KINDS: NpcMemory['kind'][] = ['work', 'talk', 'world', 'card']
const length = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z)
const cap = (value: number, maximum = MAX_STAT) => Math.max(0, Math.min(maximum, value))

function freshNpc(id: NpcId): NpcState {
  return {
    id, position: { ...NPC_CONFIG[id].home }, target: { ...NPC_CONFIG[id].home },
    goal: id === 'sentinel' ? 'guard' : 'gather', energy: id === 'guide' ? 82 : 70,
    curiosity: id === 'scout' ? 60 : 25,
    skills: { gathering: 0, study: 0, guarding: 0 }, trust: 0, supplies: 1,
    completedActions: 0, actionProgress: 0, memories: [],
  }
}

export function createNpcs(): Record<NpcId, NpcState> {
  return { guide: freshNpc('guide'), herbalist: freshNpc('herbalist'), scout: freshNpc('scout'), sentinel: freshNpc('sentinel') }
}

/** Selectors tolerate a pre-NPC state kept alive by hot module replacement. */
export function getNpc(state: DemoState, id: NpcId): NpcState {
  const npc = state.npcs?.[id] ?? freshNpc(id)
  return id === 'sentinel' && state.enemyHp <= 0 && npc.goal !== 'sleep' ? { ...npc, goal: 'sleep', actionProgress: 0 } : npc
}

export function getNpcs(state: DemoState): NpcState[] {
  return NPC_IDS.map(id => getNpc(state, id))
}

export function getNearbyNpc(state: DemoState, range = NPC_TALK_RANGE): NpcState | null {
  if (state.hp <= 0) return null
  return getNpcs(state).filter(npc => npc.id !== 'sentinel' && length(npc.position, state.position) <= range)
    .sort((a, b) => length(a.position, state.position) - length(b.position, state.position))[0] ?? null
}

function activeSkill(npc: NpcState): NpcSkill {
  return npc.goal === 'gather' ? 'gathering' : npc.goal === 'guard' || npc.goal === 'observe' ? 'guarding' : 'study'
}

/** Skill experience increases real work progress per second, up to twice the initial speed. */
export function npcEfficiency(npc: NpcState): number {
  return 1 + Math.min(1, npc.skills[activeSkill(npc)] / 120)
}

export function npcDialogue(state: DemoState, id: NpcId): string {
  const npc = getNpc(state, id)
  if (npc.goal === 'sleep') return '石衛陷入休眠，胸前的紋路仍保存著交戰的記憶。'
  const goal = NPC_GOAL_LABELS[npc.goal]
  const need = npc.energy <= LOW_ENERGY ? '我得先補充體力。' : npc.curiosity >= CURIOSITY_THRESHOLD[id] ? '島上還有許多事值得弄清楚。' : `目前有 ${npc.supplies} 份補給。`
  const memory = npc.memories.at(-1)?.text
  return `我正在${goal}。${need}${npc.trust >= 15 ? '你已是我信任的旅伴。' : ''}${memory ? `我記得：${memory}` : '走過的路與做過的事，會慢慢累積成經驗。'}`
}

function remember(npc: NpcState, time: number, kind: NpcMemory['kind'], text: string): NpcState {
  return { ...npc, memories: [...npc.memories, { time, kind, text }].slice(-NPC_MEMORY_LIMIT) }
}

function targetFor(id: NpcId, goal: NpcGoal): Position {
  if (goal === 'gather' || goal === 'study') return ROUTES[id][goal]
  return NPC_CONFIG[id].home
}

function chooseGoal(npc: NpcState, state: DemoState): NpcGoal {
  if (npc.id === 'sentinel' && state.enemyHp <= 0) return 'sleep'
  if (npc.energy <= LOW_ENERGY || (npc.goal === 'rest' && npc.energy < RESTED_ENERGY)) return 'rest'
  if (npc.id === 'sentinel') {
    const curiosityNeeded = CURIOSITY_THRESHOLD.sentinel - Math.min(15, npc.skills.guarding / 12)
    return state.stage === 'forest' && length(state.position, npc.position) <= 12 && npc.curiosity >= curiosityNeeded ? 'observe' : 'guard'
  }
  const curiosityNeeded = CURIOSITY_THRESHOLD[npc.id] - Math.min(15, npc.skills.study / 12) - npc.trust / 10
  return npc.curiosity >= curiosityNeeded ? 'study' : 'gather'
}

function evolveNpc(previous: NpcState, state: DemoState, delta: number, time: number): NpcState {
  const goal = chooseGoal(previous, state)
  if (goal === 'sleep') return previous.goal === 'sleep' ? previous : { ...previous, goal, actionProgress: 0 }
  // The quest giver holds still when an arriving/returning player is close enough to talk.
  if (previous.id === 'guide' && (state.stage === 'arrival' || state.stage === 'return') && length(previous.position, state.position) <= NPC_TALK_RANGE) return previous
  let npc: NpcState = { ...previous, skills: { ...previous.skills } }
  if (npc.goal !== goal) npc = { ...npc, goal, actionProgress: 0 }
  npc.target = { ...targetFor(npc.id, goal) }
  const remaining = length(npc.position, npc.target)
  if (remaining > REACH_DISTANCE) {
    const step = Math.min(remaining, WALK_SPEED * (1 + Math.min(0.4, npc.skills.study / 300)) * delta)
    npc.position = { x: npc.position.x + (npc.target.x - npc.position.x) * step / remaining, z: npc.position.z + (npc.target.z - npc.position.z) * step / remaining }
    npc.energy = cap(npc.energy - delta * 0.3)
    npc.curiosity = cap(npc.curiosity + delta * 0.25)
    return npc
  }

  npc.actionProgress += delta * npcEfficiency(npc)
  if (goal === 'rest') {
    npc.energy = cap(npc.energy + delta * 2)
    if (npc.actionProgress >= WORK_SECONDS.rest) {
      if (npc.supplies > 0) { npc.supplies--; npc.energy = cap(npc.energy + 16) }
      npc.actionProgress = 0
    }
    if (npc.energy >= RESTED_ENERGY) {
      npc.completedActions = cap(npc.completedActions + 1, MAX_ACTIONS)
      npc = remember(npc, time, 'work', '回到休息處恢復體力，準備再出發。')
    }
    return npc
  }

  npc.energy = cap(npc.energy - delta * (goal === 'guard' ? 0.2 : 0.55))
  npc.curiosity = cap(npc.curiosity + delta * 0.3)
  if (npc.actionProgress < WORK_SECONDS[goal]) return npc
  npc.actionProgress = 0
  npc.completedActions = cap(npc.completedActions + 1, MAX_ACTIONS)
  const skill = activeSkill(npc)
  npc.skills[skill] = cap(npc.skills[skill] + 6, MAX_SKILL)
  if (goal === 'gather') {
    const gathered = 1 + Math.min(4, Math.floor(npc.skills.gathering / 24))
    const added = Math.min(gathered, MAX_SUPPLIES - npc.supplies)
    npc.supplies += added
    npc.curiosity = cap(npc.curiosity + 20)
    npc.energy = cap(npc.energy - 5)
    return remember(npc, time, 'work', `完成採集，取得 ${added} 份補給；採集經驗增加。`)
  }
  if (goal === 'study') {
    npc.curiosity = cap(npc.curiosity - 42)
    return remember(npc, time, 'work', '完成一次研習，路徑與採集知識更熟練了。')
  }
  if (goal === 'observe') {
    npc.curiosity = cap(npc.curiosity - 25)
    return remember(npc, time, 'work', '觀察旅人的移動，累積警戒經驗。')
  }
  return remember(npc, time, 'work', '完成一輪警戒，遺跡入口保持完整。')
}

export function tickNpcs(state: DemoState, delta: number): DemoState {
  if (!Number.isFinite(delta) || delta <= 0 || state.hp <= 0) return state
  const step = Math.min(1, delta)
  const worldTime = Math.min(MAX_TIME, (Number.isFinite(state.worldTime) ? state.worldTime : 0) + step)
  const npcs = {} as Record<NpcId, NpcState>
  for (const id of NPC_IDS) npcs[id] = evolveNpc(getNpc(state, id), state, step, worldTime)
  return { ...state, worldTime, npcs }
}

export function talkToNpc(state: DemoState, id: NpcId): DemoState {
  if (!NPC_IDS.includes(id) || id === 'sentinel' || state.hp <= 0) return state
  const npc = getNpc(state, id)
  if (length(npc.position, state.position) > NPC_TALK_RANGE) return state
  const time = Number.isFinite(state.worldTime) ? state.worldTime : 0
  const lastTalk = [...npc.memories].reverse().find(memory => memory.kind === 'talk')
  if (lastTalk && time - lastTalk.time < NPC_TALK_COOLDOWN) return state
  const updated = remember({ ...npc, trust: cap(npc.trust + 5), curiosity: cap(npc.curiosity + 8) }, time, 'talk', `與旅人交談，分享${NPC_GOAL_LABELS[npc.goal]}的近況。`)
  return { ...state, worldTime: time, npcs: { ...createNpcs(), ...state.npcs, [id]: updated } }
}

export type NpcWorldEvent = 'quest-accepted' | 'seed-collected' | 'ember' | 'tide' | 'bridge-opened' | 'relic-collected' | 'quest-completed' | 'sentinel-defeated'
const EVENT_TEXT: Record<NpcWorldEvent, string> = {
  'quest-accepted': '旅人接下港口委託，準備進入森林。', 'seed-collected': '旅人採集了一枚光種。',
  ember: '觀察到旅人施放星火，記住了火焰衝擊。', tide: '觀察到旅人用回潮恢復生命。',
  'bridge-opened': '渡風解開遺跡封印，古橋重新開放。', 'relic-collected': '旅人取回潮汐晶核。',
  'quest-completed': '旅人帶回潮汐晶核，港口的委託完成了。', 'sentinel-defeated': '苔岩石衛戰敗，進入休眠。',
}

export function reactNpcs(state: DemoState, event: NpcWorldEvent): DemoState {
  const time = Number.isFinite(state.worldTime) ? state.worldTime : 0
  const npcs = {} as Record<NpcId, NpcState>
  const card = event === 'ember' || event === 'tide'
  for (const id of NPC_IDS) {
    let npc = getNpc(state, id)
    const nearby = length(npc.position, state.position) <= 12
    const globalEvent = event === 'bridge-opened' || event === 'quest-completed' || event === 'sentinel-defeated'
    if (nearby || globalEvent || (id === 'guide' && event === 'quest-accepted')) {
      npc = remember({ ...npc, skills: { ...npc.skills }, curiosity: cap(npc.curiosity + (card ? 12 : 18)) }, time, card ? 'card' : 'world', EVENT_TEXT[event])
      if (card && id === 'sentinel') npc.skills.guarding = cap(npc.skills.guarding + 3, MAX_SKILL)
      if (event === 'quest-accepted' || event === 'quest-completed' || event === 'bridge-opened') npc.trust = cap(npc.trust + 5)
      if (event === 'bridge-opened' && id !== 'sentinel') { npc.goal = 'study'; npc.curiosity = MAX_STAT; npc.actionProgress = 0 }
      if (event === 'sentinel-defeated' && id === 'sentinel') { npc.goal = 'sleep'; npc.actionProgress = 0 }
    }
    npcs[id] = npc
  }
  return { ...state, worldTime: time, npcs }
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function number(value: unknown, maximum: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum }
function position(value: unknown): value is Position {
  return object(value) && typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= WORLD.bounds.minX && value.x <= WORLD.bounds.maxX && typeof value.z === 'number' && Number.isFinite(value.z) && value.z >= WORLD.bounds.minZ && value.z <= WORLD.bounds.maxZ
}

/** Missing/invalid NPC additions reset only that actor; the original v1 adventure is retained. */
export function restoreNpcs(value: unknown, worldTime: number): Record<NpcId, NpcState> {
  const result = createNpcs()
  if (!object(value)) return result
  for (const id of NPC_IDS) {
    const candidate = value[id]
    if (!object(candidate) || candidate.id !== id || !position(candidate.position) || !position(candidate.target) || !GOALS.includes(candidate.goal as NpcGoal)) continue
    if (!number(candidate.energy, MAX_STAT) || !number(candidate.curiosity, MAX_STAT) || !number(candidate.trust, MAX_STAT) || !number(candidate.supplies, MAX_SUPPLIES) || !Number.isInteger(candidate.supplies)) continue
    if (!number(candidate.completedActions, MAX_ACTIONS) || !Number.isInteger(candidate.completedActions) || !number(candidate.actionProgress, 20) || !object(candidate.skills)) continue
    const skills = candidate.skills
    if (!SKILLS.every(skill => number(skills[skill], MAX_SKILL))) continue
    if (!Array.isArray(candidate.memories) || candidate.memories.length > NPC_MEMORY_LIMIT || !candidate.memories.every(memory => object(memory) && number(memory.time, worldTime) && MEMORY_KINDS.includes(memory.kind as NpcMemory['kind']) && typeof memory.text === 'string' && memory.text.length <= 120)) continue
    if (id === 'sentinel' && length(candidate.position, WORLD.enemy) > REACH_DISTANCE) continue
    result[id] = {
      id, position: { ...candidate.position }, target: { ...candidate.target }, goal: candidate.goal as NpcGoal,
      energy: candidate.energy, curiosity: candidate.curiosity, trust: candidate.trust, supplies: candidate.supplies,
      completedActions: candidate.completedActions, actionProgress: candidate.actionProgress,
      skills: { gathering: candidate.skills.gathering as number, study: candidate.skills.study as number, guarding: candidate.skills.guarding as number },
      memories: candidate.memories.map(memory => ({ time: memory.time, kind: memory.kind, text: memory.text })),
    }
  }
  return result
}

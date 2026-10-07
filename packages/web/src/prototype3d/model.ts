import { SAVE_KEY, WORLD, type CardId, type DemoAction, type DemoState, type Interaction, type Objective, type Position, type QuestStage } from './types'
import { createNpcs, getNearbyNpc, getNpc, NPC_CONFIG, reactNpcs, restoreNpcs, talkToNpc, tickNpcs } from './npc'

const MAX_HEALTH = 100
const MAX_ENERGY = 100
const INTERACTION_RANGE = 2.5
const EMBER_RANGE = 11
const WIND_RANGE = 5
const EMBER_DAMAGE = 25
const TIDE_HEAL = 40
const ENERGY_PER_SECOND = 10
const MAX_RECOVERY_DELTA = 1
const MAX_SAVE_LENGTH = 32768
const MAX_WORLD_TIME = 1000000000
const GATE_RESTORE_MARGIN = 1
const STAGES: QuestStage[] = ['arrival', 'forest', 'gate', 'relic', 'return', 'complete']
const CARDS: CardId[] = ['ember', 'tide', 'wind']

export const cardInfo: Record<CardId, { name: string; subtitle: string; cost: number; description: string }> = {
  ember: { name: '星火', subtitle: '火焰衝擊', cost: 18, description: '對 11 公尺內的苔岩石衛造成 25 傷害。' },
  tide: { name: '回潮', subtitle: '恢復生命', cost: 30, description: '恢復 40 點生命。受傷時才能施放。' },
  wind: { name: '渡風', subtitle: '喚醒古橋', cost: 25, description: '靠近遺跡封印 5 公尺內施放，開啟通往遺跡的橋。' },
}

/** Demo-only state: it never reads or writes production world/authentication data. */
export function createNewGame(): DemoState {
  return {
    version: 1,
    runId: globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    stage: 'arrival',
    hp: MAX_HEALTH,
    energy: MAX_ENERGY,
    seeds: [],
    enemyHp: MAX_HEALTH,
    bridgeOpen: false,
    relic: false,
    position: { ...WORLD.spawn },
    selectedCard: 'ember',
    worldTime: 0,
    npcs: createNpcs(),
  }
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function hasCard(state: DemoState, card: CardId): boolean {
  return CARDS.includes(card) && (card !== 'wind' || STAGES.indexOf(state.stage) >= STAGES.indexOf('gate'))
}

function advanceForest(state: DemoState): DemoState {
  if (state.stage === 'forest' && state.enemyHp === 0 && state.seeds.length === WORLD.seeds.length) {
    return { ...state, stage: 'gate', selectedCard: 'wind' }
  }
  return state
}

function nearbySeed(state: DemoState): number {
  return WORLD.seeds.findIndex((position, index) => !state.seeds.includes(index) && distance(position, state.position) <= INTERACTION_RANGE)
}

export function getInteraction(state: DemoState): Interaction | null {
  if (state.hp <= 0) return null
  if (distance(state.position, getNpc(state, 'guide').position) <= INTERACTION_RANGE) {
    if (state.stage === 'arrival') return { kind: 'guide', label: '與守燈人米拉交談' }
    if (state.stage === 'return') return { kind: 'camp', label: '交回潮汐晶核，完成委託' }
  }
  if (state.stage === 'forest' && nearbySeed(state) !== -1) return { kind: 'seed', label: '採集光種' }
  if (state.stage === 'gate' && distance(state.position, WORLD.gate) <= WIND_RANGE) return { kind: 'gate', label: '選擇渡風卡，施放以喚醒古橋' }
  if (state.stage === 'relic' && distance(state.position, WORLD.relic) <= INTERACTION_RANGE) return { kind: 'relic', label: '取回潮汐晶核' }
  const npc = getNearbyNpc(state)
  if (npc) return { kind: 'npc', label: `與${NPC_CONFIG[npc.id].name}交談`, npcId: npc.id }
  return null
}

export function getObjective(state: DemoState): Objective {
  if (state.hp <= 0) return { title: '暫時倒下了', detail: '返回港口恢復生命。已完成的探索與收集會保留。', destination: '港口營地', position: WORLD.spawn }
  switch (state.stage) {
    case 'arrival':
      return { title: '港口的委託', detail: '靠近金色光柱下的守燈人米拉，交談取得星火與回潮卡。', destination: '守燈人米拉', position: getNpc(state, 'guide').position }
    case 'forest': {
      const remaining = WORLD.seeds.map((position, index) => ({ position, index }))
        .filter(({ index }) => !state.seeds.includes(index))
        .sort((a, b) => distance(a.position, state.position) - distance(b.position, state.position))
      const target = remaining[0]
      return {
        title: `森林試煉 · 光種 ${state.seeds.length}/${WORLD.seeds.length}`,
        detail: state.enemyHp > 0
          ? '採集三枚光種，用星火擊敗苔岩石衛。受傷時施放回潮。'
          : '石衛已倒下。收集剩餘光種，即可獲得渡風卡。',
        destination: target ? `光種 ${target.index + 1}` : '苔岩石衛',
        position: target?.position ?? WORLD.enemy,
      }
    }
    case 'gate':
      return { title: '新卡入冊 · 渡風', detail: '前往遺跡封印，在 5 公尺內施放渡風，喚醒通往遺跡的古橋。', destination: '遺跡封印', position: WORLD.gate }
    case 'relic':
      return { title: '越過古橋', detail: '道路已開啟。走過橋，靠近遺跡中心並取回潮汐晶核。', destination: '潮汐晶核', position: WORLD.relic }
    case 'return':
      return { title: '帶潮汐晶核回港口', detail: '沿森林小徑返回港口，與守燈人米拉交談完成委託。', destination: '守燈人米拉', position: getNpc(state, 'guide').position }
    case 'complete':
      return { title: '委託完成', detail: '潮汐晶核已送回港口。你可以繼續探索，或從選單開始獨立的新旅程。', destination: '港口營地', position: getNpc(state, 'guide').position }
  }
}

/** All playable demo changes pass through this deterministic, side-effect-free reducer. */
export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'tick') return tickNpcs(state, action.delta)
  if (action.type === 'npc-talk') return talkToNpc(state, action.id)
  let next = reduceAdventure(state, action)
  if (next === state) return state
  if (state.stage === 'arrival' && next.stage === 'forest') next = reactNpcs(next, 'quest-accepted')
  if (state.seeds.length < next.seeds.length) next = reactNpcs(next, 'seed-collected')
  if (action.type === 'cast' && action.card === 'ember' && next.enemyHp < state.enemyHp) next = reactNpcs(next, 'ember')
  if (action.type === 'cast' && action.card === 'tide' && next.hp > state.hp) next = reactNpcs(next, 'tide')
  if (state.enemyHp > 0 && next.enemyHp === 0) next = reactNpcs(next, 'sentinel-defeated')
  if (!state.bridgeOpen && next.bridgeOpen) next = reactNpcs(next, 'bridge-opened')
  if (!state.relic && next.relic) next = reactNpcs(next, 'relic-collected')
  if (state.stage !== 'complete' && next.stage === 'complete') next = reactNpcs(next, 'quest-completed')
  return next
}

function reduceAdventure(state: DemoState, action: Exclude<DemoAction, { type: 'tick' | 'npc-talk' }>): DemoState {
  if (action.type === 'respawn') {
    return state.hp > 0 ? state : { ...state, hp: MAX_HEALTH, energy: MAX_ENERGY, position: { ...WORLD.spawn } }
  }
  if (state.hp <= 0) return state

  switch (action.type) {
    case 'move': {
      if (!Number.isFinite(action.position.x) || !Number.isFinite(action.position.z)) return state
      const position = {
        x: Math.max(WORLD.bounds.minX, Math.min(WORLD.bounds.maxX, action.position.x)),
        z: Math.max(WORLD.bounds.minZ, Math.min(WORLD.bounds.maxZ, action.position.z)),
      }
      return position.x === state.position.x && position.z === state.position.z ? state : { ...state, position }
    }
    case 'select-card':
      return hasCard(state, action.card) && action.card !== state.selectedCard ? { ...state, selectedCard: action.card } : state
    case 'recover': {
      if (!Number.isFinite(action.delta) || action.delta <= 0 || state.energy >= MAX_ENERGY) return state
      return { ...state, energy: Math.min(MAX_ENERGY, state.energy + Math.min(MAX_RECOVERY_DELTA, action.delta) * ENERGY_PER_SECOND) }
    }
    case 'enemy-hit':
      if (state.stage !== 'forest' || state.enemyHp <= 0 || !Number.isFinite(action.amount) || action.amount <= 0) return state
      return { ...state, hp: Math.max(0, state.hp - Math.min(MAX_HEALTH, action.amount)) }
    case 'interact': {
      const interaction = getInteraction(state)
      if (interaction?.kind === 'guide') return { ...state, stage: 'forest' }
      if (interaction?.kind === 'seed') return advanceForest({ ...state, seeds: [...state.seeds, nearbySeed(state)].sort((a, b) => a - b) })
      if (interaction?.kind === 'relic') return { ...state, stage: 'return', relic: true }
      if (interaction?.kind === 'camp') return { ...state, stage: 'complete' }
      if (interaction?.kind === 'npc' && interaction.npcId) return talkToNpc(state, interaction.npcId)
      return state
    }
    case 'cast': {
      if (state.stage === 'arrival' || !hasCard(state, action.card) || state.energy < cardInfo[action.card].cost) return state
      if (action.card === 'ember') {
        if (state.stage !== 'forest' || state.enemyHp <= 0 || distance(state.position, WORLD.enemy) > EMBER_RANGE) return state
        return advanceForest({ ...state, enemyHp: Math.max(0, state.enemyHp - EMBER_DAMAGE), energy: state.energy - cardInfo.ember.cost })
      }
      if (action.card === 'tide') {
        if (state.hp >= MAX_HEALTH) return state
        return { ...state, hp: Math.min(MAX_HEALTH, state.hp + TIDE_HEAL), energy: state.energy - cardInfo.tide.cost }
      }
      if (state.stage !== 'gate' || state.bridgeOpen || distance(state.position, WORLD.gate) > WIND_RANGE) return state
      return { ...state, stage: 'relic', bridgeOpen: true, energy: state.energy - cardInfo.wind.cost }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

/** Untrusted browser storage is parsed field by field, then checked against quest invariants. */
function parseState(value: unknown): DemoState | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.runId !== 'string' || value.runId.length < 1 || value.runId.length > 100) return null
  if (!STAGES.includes(value.stage as QuestStage) || !CARDS.includes(value.selectedCard as CardId)) return null
  if (!boundedNumber(value.hp, 0, MAX_HEALTH) || !boundedNumber(value.energy, 0, MAX_ENERGY)) return null
  if (!boundedNumber(value.enemyHp, 0, MAX_HEALTH) || value.enemyHp % EMBER_DAMAGE !== 0) return null
  if (!Array.isArray(value.seeds) || value.seeds.length > WORLD.seeds.length || !value.seeds.every(index => Number.isInteger(index) && index >= 0 && index < WORLD.seeds.length) || new Set(value.seeds).size !== value.seeds.length) return null
  if (typeof value.bridgeOpen !== 'boolean' || typeof value.relic !== 'boolean' || !isRecord(value.position)) return null
  if (!boundedNumber(value.position.x, WORLD.bounds.minX, WORLD.bounds.maxX) || !boundedNumber(value.position.z, WORLD.bounds.minZ, WORLD.bounds.maxZ)) return null

  const stage = value.stage as QuestStage
  const forestDone = value.seeds.length === WORLD.seeds.length && value.enemyHp === 0
  const afterForest = STAGES.indexOf(stage) >= STAGES.indexOf('gate')
  const bridgeExpected = STAGES.indexOf(stage) >= STAGES.indexOf('relic')
  const relicExpected = stage === 'return' || stage === 'complete'
  if (afterForest !== forestDone || value.bridgeOpen !== bridgeExpected || value.relic !== relicExpected) return null
  if (stage === 'arrival' && (value.seeds.length !== 0 || value.enemyHp !== MAX_HEALTH || value.hp !== MAX_HEALTH || value.energy !== MAX_ENERGY)) return null
  if (value.selectedCard === 'wind' && !afterForest) return null
  const worldTime = boundedNumber(value.worldTime, 0, MAX_WORLD_TIME) ? value.worldTime : 0
  const npcs = restoreNpcs(value.npcs, worldTime)
  if (value.enemyHp === 0) npcs.sentinel = { ...npcs.sentinel, goal: 'sleep', actionProgress: 0 }

  return {
    version: 1, runId: value.runId, stage,
    hp: value.hp, energy: value.energy, enemyHp: value.enemyHp,
    seeds: [...value.seeds].sort((a, b) => a - b),
    bridgeOpen: value.bridgeOpen, relic: value.relic,
    position: { x: value.position.x, z: value.position.z }, selectedCard: value.selectedCard as CardId,
    worldTime, npcs,
  }
}

export function loadDemo(storage: Pick<Storage, 'getItem'>): DemoState {
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (raw && raw.length <= MAX_SAVE_LENGTH) {
      const state = parseState(JSON.parse(raw))
      if (state) {
        // Restore legacy/interrupted saves on the reachable side of a closed seal.
        if (!state.bridgeOpen && state.position.z > WORLD.gate.z - GATE_RESTORE_MARGIN) {
          return { ...state, position: { x: WORLD.gate.x, z: WORLD.gate.z - INTERACTION_RANGE } }
        }
        return state
      }
    }
  } catch { /* Unavailable storage and corrupt saves both start a fresh isolated run. */ }
  return createNewGame()
}

export function saveDemo(storage: Pick<Storage, 'setItem'>, state: DemoState): boolean {
  try {
    const valid = parseState(state)
    if (!valid) return false
    storage.setItem(SAVE_KEY, JSON.stringify(valid))
    return true
  } catch {
    return false
  }
}

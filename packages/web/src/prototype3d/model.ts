import { SAVE_KEY, WORLD, type CardId, type CombatTarget, type DemoAction, type DemoState, type EncounterChoiceView, type EncounterDefinition, type EncounterId, type EncounterResult, type EncounterState, type ExpeditionState, type Interaction, type NextExpeditionPreview, type NpcId, type Objective, type Position, type QuestStage } from './types'
import { createNpcs, getNearbyNpc, getNpc, NPC_CONFIG, prepareNpcsForExpedition, reactNpcs, rememberEncounterChoice, restoreNpcs, talkToNpc, tickNpcs } from './npc'

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
const MAX_EXPEDITIONS = 1000000
const MAX_CAMP_SUPPLIES = 1000000
const MAX_HISTORY_COUNT = 1000000
const MAX_SHIELD = 40
const SHIELD_PER_SUPPLY = 5
const MAIN_ENEMY_RANGE = 4
const MAIN_ENEMY_DAMAGE = 8
const EMBER_COOLDOWN_SECONDS = 1

export const EXPEDITION_ENCOUNTERS: Record<EncounterId, EncounterDefinition> = {
  forestCache: {
    id: 'forestCache', name: '林間藥草箱', position: { x: -5, z: 1 }, safeCard: 'tide', energyCost: 30,
    safeReward: 1, fightReward: 3, maxHp: 75, damage: 12, range: 12,
    eligibleStages: ['forest', 'gate', 'relic', 'return'],
  },
  ruinSentinel: {
    id: 'ruinSentinel', name: '遺跡哨衛', position: { x: 5, z: 23 }, safeCard: 'wind', energyCost: 25,
    safeReward: 2, fightReward: 5, maxHp: 125, damage: 18, range: 12,
    eligibleStages: ['relic', 'return'],
  },
}
const ENCOUNTER_IDS: EncounterId[] = ['forestCache', 'ruinSentinel']

export const cardInfo: Record<CardId, { name: string; subtitle: string; cost: number; description: string }> = {
  ember: { name: '星火', subtitle: '火焰衝擊', cost: 18, description: '對目前瞄準的敵人造成 25 傷害，射程 11 公尺，每發間隔 1 秒。' },
  tide: { name: '回潮', subtitle: '恢復生命', cost: 30, description: '受傷時恢復 40 點生命。在藥草箱選擇避險另耗 1 枚刻印；能量恢復不會補充刻印。' },
  wind: { name: '渡風', subtitle: '喚醒古橋', cost: 25, description: '在封印 5 公尺內施放以開橋；遭遇哨衛選擇避險另耗 1 枚刻印，能量恢復不會補充刻印。' },
}

/** Demo-only state: it never reads or writes production world/authentication data. */
export function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function createExpedition(): ExpeditionState {
  return {
    number: 1, seals: 1, shield: 0, campSupplies: 0, emberCooldown: 0, pendingSealBonus: 0, previousTrip: null,
    encounters: {
      forestCache: { phase: 'available', choice: null, enemyHp: EXPEDITION_ENCOUNTERS.forestCache.maxHp },
      ruinSentinel: { phase: 'available', choice: null, enemyHp: EXPEDITION_ENCOUNTERS.ruinSentinel.maxHp },
    },
    history: { forestCache: { safe: 0, fights: 0, wins: 0 }, ruinSentinel: { safe: 0, fights: 0, wins: 0 } },
  }
}

export function createNewGame(): DemoState {
  return {
    version: 1,
    runId: createRunId(),
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
    expedition: createExpedition(),
  }
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** The original v1 adventure and live HMR state need no destructive reset to gain expeditions. */
export function getExpedition(state: DemoState): ExpeditionState {
  const expedition = state.expedition ?? createExpedition()
  return expedition.emberCooldown === undefined ? { ...expedition, emberCooldown: 0 } : expedition
}

export function getEncounter(state: DemoState, id: EncounterId): EncounterState {
  return getExpedition(state).encounters[id]
}

function encounterEligible(state: DemoState, id: EncounterId): boolean {
  return EXPEDITION_ENCOUNTERS[id].eligibleStages.includes(state.stage) && (id !== 'ruinSentinel' || state.bridgeOpen)
}

export function getNearbyEncounter(state: DemoState): EncounterId | null {
  if (state.hp <= 0) return null
  return ENCOUNTER_IDS.filter(id => encounterEligible(state, id) && getEncounter(state, id).phase === 'available' && distance(state.position, EXPEDITION_ENCOUNTERS[id].position) <= INTERACTION_RANGE)
    .sort((a, b) => distance(state.position, EXPEDITION_ENCOUNTERS[a].position) - distance(state.position, EXPEDITION_ENCOUNTERS[b].position))[0] ?? null
}

export function getEncounterChoices(state: DemoState, id: EncounterId): EncounterChoiceView[] {
  const config = EXPEDITION_ENCOUNTERS[id]
  const expedition = getExpedition(state)
  const encounter = getEncounter(state, id)
  const commonReason = state.hp <= 0 ? '請先返回營地恢復。'
    : !encounterEligible(state, id) ? '目前任務階段尚不能處理這個遭遇。'
      : distance(state.position, config.position) > INTERACTION_RANGE ? '請靠近遭遇地點 2.5 公尺內。'
        : encounter.phase !== 'available' ? '本趟已選擇處理方式，不能重選或重領。'
          : ENCOUNTER_IDS.some(other => other !== id && expedition.encounters[other].phase === 'fighting') ? '請先完成已開始的遭遇戰鬥。' : null
  const safeReason = commonReason ?? (expedition.seals < 1 ? '本趟刻印已用完，能量恢復不會補充刻印。'
    : state.energy < config.energyCost ? `需要 ${config.energyCost} 點能量。`
      : !hasCard(state, config.safeCard) ? '尚未取得需要的紋卡。' : null)
  return [
    { choice: 'safe', label: `以${cardInfo[config.safeCard].name}避險`, detail: `消耗 1 枚刻印與 ${config.energyCost} 能量，取得 ${config.safeReward} 份營地物資；為下一趟預備額外刻印（每趟最多 1 枚）。`, enabled: safeReason === null, reason: safeReason, reward: config.safeReward },
    { choice: 'fight', label: '迎戰石衛', detail: `先備戰 1 秒，星火每發間隔 1 秒。敵人 ${config.maxHp} 生命；警示後對 ${config.range} 公尺內造成 ${config.damage} 傷害。勝利取得 ${config.fightReward} 份營地物資。`, enabled: commonReason === null, reason: commonReason, reward: config.fightReward },
  ]
}

/** A chosen encounter takes aim priority while its shockwave can reach the player. */
export function getCombatTarget(state: DemoState): CombatTarget | null {
  const activeId = ENCOUNTER_IDS.find(id => getEncounter(state, id).phase === 'fighting')
  const active = activeId ? {
    id: activeId, name: EXPEDITION_ENCOUNTERS[activeId].name, position: EXPEDITION_ENCOUNTERS[activeId].position,
    hp: getEncounter(state, activeId).enemyHp, maxHp: EXPEDITION_ENCOUNTERS[activeId].maxHp,
    damage: EXPEDITION_ENCOUNTERS[activeId].damage, range: EXPEDITION_ENCOUNTERS[activeId].range,
  } satisfies CombatTarget : null
  if (active && distance(state.position, active.position) <= active.range) return active
  if (state.stage === 'forest' && state.enemyHp > 0) return { id: 'main', name: '苔岩石衛', position: WORLD.enemy, hp: state.enemyHp, maxHp: MAX_HEALTH, damage: MAIN_ENEMY_DAMAGE, range: MAIN_ENEMY_RANGE }
  return active
}

export function getNextExpeditionPreview(state: DemoState): NextExpeditionPreview {
  const expedition = getExpedition(state)
  const spentSupplies = Math.min(MAX_SHIELD / SHIELD_PER_SUPPLY, expedition.campSupplies)
  const reason = state.hp <= 0 ? '請先返回營地恢復。' : state.stage !== 'complete' ? '完成港口委託後才能展開下一趟。'
    : distance(state.position, getNpc(state, 'guide').position) > INTERACTION_RANGE ? '請回到米拉身旁準備下一趟。'
      : expedition.number >= MAX_EXPEDITIONS ? '已達原型遠征次數上限。' : null
  return {
    number: expedition.number + 1, spentSupplies, shieldGranted: spentSupplies * SHIELD_PER_SUPPLY,
    extraSealGranted: expedition.pendingSealBonus, seals: 1 + expedition.pendingSealBonus,
    canStart: reason === null, reason,
  }
}

export function getNpcExpeditionSummary(state: DemoState, id: NpcId): string[] {
  const expedition = getExpedition(state)
  const forest = expedition.history.forestCache
  const ruin = expedition.history.ruinSentinel
  const summaries: Record<NpcId, string[]> = {
    guide: [`歷趟安全處理 ${forest.safe + ruin.safe} 次，迎戰 ${forest.fights + ruin.fights} 次，勝利 ${forest.wins + ruin.wins} 次。`],
    herbalist: [`林間藥草箱：安全處理 ${forest.safe} 次，迎戰 ${forest.fights} 次，勝利 ${forest.wins} 次。`],
    scout: [`遺跡哨衛：安全處理 ${ruin.safe} 次，迎戰 ${ruin.fights} 次，勝利 ${ruin.wins} 次。`],
    sentinel: [`記錄了 ${forest.fights + ruin.fights} 次遭遇迎戰，其中 ${forest.wins + ruin.wins} 次由旅人獲勝。`],
  }
  const result = summaries[id]
  if (id === 'guide' && expedition.pendingSealBonus) result.push('本趟的安全選擇已記下：下一趟多準備 1 枚刻印，領取後不會重複發放。')
  const previous = expedition.previousTrip
  if (previous) {
    if (id === 'guide') result.push(`第 ${previous.number} 趟帶回的準備，已在本趟發放 ${previous.shieldGranted} 護盾與 ${previous.extraSealGranted} 枚額外刻印。`)
    if (id === 'herbalist' || id === 'scout') {
      const encounterId = id === 'herbalist' ? 'forestCache' : 'ruinSentinel'
      const labels: Record<EncounterResult, string> = { safe: '以紋卡避險', won: '迎戰獲勝', skipped: '未處理', abandoned: '迎戰後撤離，未領獎勵' }
      result.push(`第 ${previous.number} 趟的選擇：${labels[previous.results[encounterId]]}。`)
    }
  }
  return result
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
  const encounterId = getNearbyEncounter(state)
  if (encounterId) return { kind: 'encounter', label: `查看${EXPEDITION_ENCOUNTERS[encounterId].name}`, encounterId }
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
      return { title: '委託完成', detail: '回到米拉身旁，將營地物資整備成護盾並展開下一趟，保留 NPC 成長與遠征記錄。', destination: '守燈人米拉', position: getNpc(state, 'guide').position }
  }
}

/** All playable demo changes pass through this deterministic, side-effect-free reducer. */
export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'tick') {
    const next = tickNpcs(state, action.delta)
    if (next === state) return state
    const expedition = getExpedition(next)
    return { ...next, expedition: { ...expedition, emberCooldown: Math.max(0, expedition.emberCooldown - Math.min(1, action.delta)) } }
  }
  if (action.type === 'npc-talk') return talkToNpc(state, action.id)
  if (action.type === 'choose-encounter' || action.type === 'encounter-hit' || action.type === 'next-expedition') {
    if (action.runId !== state.runId) return state
    if (action.type === 'choose-encounter') return chooseEncounter(state, action)
    if (action.type === 'encounter-hit') {
      if (state.hp <= 0 || !ENCOUNTER_IDS.includes(action.id)) return state
      const config = EXPEDITION_ENCOUNTERS[action.id]
      const encounter = getEncounter(state, action.id)
      if (encounter.phase !== 'fighting' || encounter.enemyHp <= 0 || distance(state.position, config.position) > config.range) return state
      return applyDamage(state, config.damage)
    }
    return nextExpedition(state, action.nextRunId)
  }
  let next = reduceAdventure(state, action)
  if (next === state) return state
  if (state.stage === 'arrival' && next.stage === 'forest') next = reactNpcs(next, 'quest-accepted')
  if (state.seeds.length < next.seeds.length) next = reactNpcs(next, 'seed-collected')
  if (action.type === 'cast' && action.card === 'ember' && next.energy < state.energy) next = reactNpcs(next, 'ember')
  if (action.type === 'cast' && action.card === 'tide' && next.hp > state.hp) next = reactNpcs(next, 'tide')
  if (state.enemyHp > 0 && next.enemyHp === 0) next = reactNpcs(next, 'sentinel-defeated')
  if (!state.bridgeOpen && next.bridgeOpen) next = reactNpcs(next, 'bridge-opened')
  if (!state.relic && next.relic) next = reactNpcs(next, 'relic-collected')
  if (state.stage !== 'complete' && next.stage === 'complete') next = reactNpcs(next, 'quest-completed')
  return next
}

function reduceAdventure(state: DemoState, action: Exclude<DemoAction, { type: 'tick' | 'npc-talk' | 'choose-encounter' | 'encounter-hit' | 'next-expedition' }>): DemoState {
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
      return applyDamage(state, Math.min(MAX_HEALTH, action.amount))
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
        const expedition = getExpedition(state)
        if (expedition.emberCooldown > 0) return state
        const target = getCombatTarget(state)
        if (!target || target.hp <= 0 || distance(state.position, target.position) > EMBER_RANGE) return state
        if (target.id === 'main') return advanceForest({ ...state, enemyHp: Math.max(0, state.enemyHp - EMBER_DAMAGE), energy: state.energy - cardInfo.ember.cost, expedition: { ...expedition, emberCooldown: EMBER_COOLDOWN_SECONDS } })
        const encounter = getEncounter(state, target.id)
        const enemyHp = Math.max(0, encounter.enemyHp - EMBER_DAMAGE)
        const victory = enemyHp === 0
        const config = EXPEDITION_ENCOUNTERS[target.id]
        const result: DemoState = {
          ...state, energy: state.energy - cardInfo.ember.cost,
          expedition: {
            ...expedition,
            emberCooldown: EMBER_COOLDOWN_SECONDS,
            campSupplies: Math.min(MAX_CAMP_SUPPLIES, expedition.campSupplies + (victory ? config.fightReward : 0)),
            encounters: { ...expedition.encounters, [target.id]: { ...encounter, enemyHp, phase: victory ? 'resolved' : 'fighting' } },
            history: victory ? { ...expedition.history, [target.id]: { ...expedition.history[target.id], wins: Math.min(MAX_HISTORY_COUNT, expedition.history[target.id].wins + 1) } } : expedition.history,
          },
        }
        return victory ? rememberEncounterChoice(result, target.id, 'fight', true) : result
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

function applyDamage(state: DemoState, amount: number): DemoState {
  const expedition = getExpedition(state)
  const absorbed = Math.min(expedition.shield, amount)
  return { ...state, hp: Math.max(0, state.hp - (amount - absorbed)), expedition: { ...expedition, shield: expedition.shield - absorbed } }
}

function chooseEncounter(state: DemoState, action: Extract<DemoAction, { type: 'choose-encounter' }>): DemoState {
  if (!ENCOUNTER_IDS.includes(action.id) || (action.choice !== 'safe' && action.choice !== 'fight')) return state
  const option = getEncounterChoices(state, action.id).find(choice => choice.choice === action.choice)
  if (!option?.enabled) return state
  const expedition = getExpedition(state)
  const config = EXPEDITION_ENCOUNTERS[action.id]
  const history = expedition.history[action.id]
  const safe = action.choice === 'safe'
  const result: DemoState = {
    ...state,
    energy: state.energy - (safe ? config.energyCost : 0),
    selectedCard: safe ? config.safeCard : 'ember',
    expedition: {
      ...expedition,
      emberCooldown: safe ? expedition.emberCooldown : EMBER_COOLDOWN_SECONDS,
      seals: expedition.seals - (safe ? 1 : 0),
      campSupplies: Math.min(MAX_CAMP_SUPPLIES, expedition.campSupplies + (safe ? config.safeReward : 0)),
      pendingSealBonus: safe ? 1 : expedition.pendingSealBonus,
      encounters: { ...expedition.encounters, [action.id]: { phase: safe ? 'resolved' : 'fighting', choice: action.choice, enemyHp: config.maxHp } },
      history: { ...expedition.history, [action.id]: { ...history, safe: Math.min(MAX_HISTORY_COUNT, history.safe + (safe ? 1 : 0)), fights: Math.min(MAX_HISTORY_COUNT, history.fights + (safe ? 0 : 1)) } },
    },
  }
  return rememberEncounterChoice(result, action.id, action.choice)
}

function nextExpedition(state: DemoState, nextRunId: string): DemoState {
  const preview = getNextExpeditionPreview(state)
  if (!preview.canStart || typeof nextRunId !== 'string' || nextRunId.length < 1 || nextRunId.length > 100 || nextRunId === state.runId) return state
  const previous = getExpedition(state)
  const results = {} as Record<EncounterId, EncounterResult>
  for (const id of ENCOUNTER_IDS) {
    const encounter = previous.encounters[id]
    results[id] = encounter.phase === 'available' ? 'skipped' : encounter.phase === 'fighting' ? 'abandoned' : encounter.choice === 'safe' ? 'safe' : 'won'
  }
  return {
    ...state, runId: nextRunId, stage: 'arrival', hp: MAX_HEALTH, energy: MAX_ENERGY,
    seeds: [], enemyHp: MAX_HEALTH, bridgeOpen: false, relic: false, position: { ...WORLD.spawn }, selectedCard: 'ember',
    npcs: prepareNpcsForExpedition(state), worldTime: Number.isFinite(state.worldTime) ? state.worldTime : 0,
    expedition: {
      ...createExpedition(), number: preview.number, seals: preview.seals, shield: preview.shieldGranted,
      campSupplies: previous.campSupplies - preview.spentSupplies, history: previous.history,
      previousTrip: { number: previous.number, results, shieldGranted: preview.shieldGranted, extraSealGranted: preview.extraSealGranted },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return boundedNumber(value, minimum, maximum) && Number.isInteger(value)
}

function parseExpedition(value: unknown): ExpeditionState | null {
  if (value === undefined) return createExpedition()
  if (!isRecord(value) || !boundedInteger(value.number, 1, MAX_EXPEDITIONS) || !boundedInteger(value.seals, 0, 2)
    || !boundedNumber(value.shield, 0, MAX_SHIELD) || !boundedInteger(value.campSupplies, 0, MAX_CAMP_SUPPLIES)
    || (value.pendingSealBonus !== 0 && value.pendingSealBonus !== 1) || !isRecord(value.encounters) || !isRecord(value.history)) return null
  const emberCooldown = value.emberCooldown === undefined ? 0 : value.emberCooldown
  if (!boundedNumber(emberCooldown, 0, EMBER_COOLDOWN_SECONDS)) return null
  const encounters = {} as ExpeditionState['encounters']
  const history = {} as ExpeditionState['history']
  let safeCount = 0
  let fightingCount = 0
  for (const id of ENCOUNTER_IDS) {
    const encounter = value.encounters[id]
    const stats = value.history[id]
    const maxHp = EXPEDITION_ENCOUNTERS[id].maxHp
    if (!isRecord(encounter) || !boundedInteger(encounter.enemyHp, 0, maxHp) || encounter.enemyHp % EMBER_DAMAGE !== 0 || !isRecord(stats)) return null
    if (!boundedInteger(stats.safe, 0, MAX_HISTORY_COUNT) || !boundedInteger(stats.fights, 0, MAX_HISTORY_COUNT) || !boundedInteger(stats.wins, 0, MAX_HISTORY_COUNT)
      || stats.wins > stats.fights || stats.safe + stats.fights > value.number) return null
    if (encounter.phase === 'available') {
      if (encounter.choice !== null || encounter.enemyHp !== maxHp) return null
    } else if (encounter.phase === 'fighting') {
      if (encounter.choice !== 'fight' || encounter.enemyHp <= 0 || stats.fights < 1) return null
      fightingCount++
    } else if (encounter.phase === 'resolved') {
      if (encounter.choice === 'safe') {
        if (encounter.enemyHp !== maxHp || stats.safe < 1) return null
        safeCount++
      } else if (encounter.choice === 'fight') {
        if (encounter.enemyHp !== 0 || stats.wins < 1) return null
      } else return null
    } else return null
    encounters[id] = { phase: encounter.phase, choice: encounter.choice as EncounterState['choice'], enemyHp: encounter.enemyHp }
    history[id] = { safe: stats.safe, fights: stats.fights, wins: stats.wins }
  }
  if (fightingCount > 1 || value.pendingSealBonus !== Number(safeCount > 0)) return null
  let previousTrip: ExpeditionState['previousTrip'] = null
  if (value.previousTrip !== null) {
    const previous = value.previousTrip
    if (!isRecord(previous) || !boundedInteger(previous.number, 1, MAX_EXPEDITIONS) || previous.number !== value.number - 1
      || !isRecord(previous.results) || !boundedInteger(previous.shieldGranted, 0, MAX_SHIELD) || previous.shieldGranted % SHIELD_PER_SUPPLY !== 0
      || (previous.extraSealGranted !== 0 && previous.extraSealGranted !== 1)) return null
    const results = {} as Record<EncounterId, EncounterResult>
    for (const id of ENCOUNTER_IDS) {
      const result = previous.results[id]
      if (result !== 'safe' && result !== 'won' && result !== 'skipped' && result !== 'abandoned') return null
      results[id] = result
    }
    if (previous.extraSealGranted !== Number(ENCOUNTER_IDS.some(id => results[id] === 'safe'))) return null
    previousTrip = { number: previous.number, results, shieldGranted: previous.shieldGranted, extraSealGranted: previous.extraSealGranted }
  } else if (value.number !== 1) return null
  if (value.seals !== 1 + (previousTrip?.extraSealGranted ?? 0) - safeCount || value.shield > (previousTrip?.shieldGranted ?? 0)) return null
  return { number: value.number, seals: value.seals, shield: value.shield, campSupplies: value.campSupplies, emberCooldown, encounters, history, pendingSealBonus: value.pendingSealBonus, previousTrip }
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
  const expedition = parseExpedition(value.expedition)
  if (!expedition) return null
  if (stage === 'arrival' && ENCOUNTER_IDS.some(id => expedition.encounters[id].phase !== 'available')) return null
  if (!bridgeExpected && expedition.encounters.ruinSentinel.phase !== 'available') return null

  return {
    version: 1, runId: value.runId, stage,
    hp: value.hp, energy: value.energy, enemyHp: value.enemyHp,
    seeds: [...value.seeds].sort((a, b) => a - b),
    bridgeOpen: value.bridgeOpen, relic: value.relic,
    position: { x: value.position.x, z: value.position.z }, selectedCard: value.selectedCard as CardId,
    worldTime, npcs, expedition,
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

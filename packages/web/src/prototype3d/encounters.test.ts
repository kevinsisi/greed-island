import { describe, expect, it } from 'vitest'
import { createNewGame, createRunId, EXPEDITION_ENCOUNTERS, getCombatTarget, getEncounter, getEncounterChoices, getExpedition, getInteraction, getNextExpeditionPreview, getNpcExpeditionSummary, loadDemo, reduceDemo, saveDemo } from './model'
import { getNpc, NPC_CONFIG } from './npc'
import { SAVE_KEY, WORLD, type DemoAction, type DemoState, type EncounterChoice, type EncounterId, type Position } from './types'

const move = (state: DemoState, position: Position) => reduceDemo(state, { type: 'move', position })
const interact = (state: DemoState) => reduceDemo(state, { type: 'interact' })
const acceptQuest = (state = createNewGame()) => interact(move(state, getNpc(state, 'guide').position))
const choose = (state: DemoState, id: EncounterId, choice: EncounterChoice) => reduceDemo(state, { type: 'choose-encounter', runId: state.runId, id, choice })

function recover(state: DemoState): DemoState {
  state = reduceDemo(state, { type: 'tick', delta: 1 })
  for (let index = 0; index < 10; index++) state = reduceDemo(state, { type: 'recover', delta: 1 })
  return state
}

function defeatEncounter(state: DemoState, id: EncounterId): DemoState {
  state = move(state, EXPEDITION_ENCOUNTERS[id].position)
  for (let index = 0; index < EXPEDITION_ENCOUNTERS[id].maxHp / 25; index++) state = reduceDemo(recover(state), { type: 'cast', card: 'ember' })
  return state
}

function reachRuins(state: DemoState): DemoState {
  for (const position of WORLD.seeds) state = interact(move(state, position))
  // This point can target the main sentinel even when an optional forest fight was left unfinished.
  state = move(state, { x: 8, z: 10 })
  for (let hit = 0; hit < 4; hit++) state = reduceDemo(recover(state), { type: 'cast', card: 'ember' })
  return reduceDemo(move(recover(state), WORLD.gate), { type: 'cast', card: 'wind' })
}

function completeQuest(state: DemoState): DemoState {
  if (!state.bridgeOpen) state = reachRuins(state)
  if (!state.relic) state = interact(move(state, WORLD.relic))
  return interact(move(state, getNpc(state, 'guide').position))
}

function nextTrip(state: DemoState, nextRunId = createRunId()): DemoState {
  return reduceDemo(state, { type: 'next-expedition', runId: state.runId, nextRunId })
}

function memoryStorage(raw?: string) {
  let value = raw ?? null
  return {
    getItem(key: string) { expect(key).toBe(SAVE_KEY); return value },
    setItem(key: string, updated: string) { expect(key).toBe(SAVE_KEY); value = updated },
  }
}

describe('optional expedition choices', () => {
  it('trades a finite seal and card energy for the safe forest reward exactly once', () => {
    let state = move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position)
    expect(getInteraction(state)).toMatchObject({ kind: 'encounter', encounterId: 'forestCache' })
    expect(getEncounterChoices(state, 'forestCache').map(option => option.enabled)).toEqual([true, true])
    state = choose(state, 'forestCache', 'safe')
    expect(state.energy).toBe(70)
    expect(state.expedition).toMatchObject({ seals: 0, campSupplies: 1, pendingSealBonus: 1, encounters: { forestCache: { phase: 'resolved', choice: 'safe', enemyHp: 75 } } })
    expect(state.expedition.history.forestCache).toEqual({ safe: 1, fights: 0, wins: 0 })
    expect(state.npcs.herbalist.memories.at(-1)?.text).toContain('安全處理')
    expect(choose(state, 'forestCache', 'safe')).toBe(state)
    expect(choose(state, 'forestCache', 'fight')).toBe(state)
    const rested = recover(state)
    expect(rested.energy).toBe(100)
    expect(rested.expedition.seals).toBe(0)
    expect(rested.expedition.campSupplies).toBe(1)
  })

  it('provides a distinct safe ruin branch only after the bridge is open', () => {
    const forest = move(acceptQuest(), EXPEDITION_ENCOUNTERS.ruinSentinel.position)
    expect(getEncounterChoices(forest, 'ruinSentinel').every(option => !option.enabled)).toBe(true)
    expect(choose(forest, 'ruinSentinel', 'safe')).toBe(forest)
    let ruins = move(recover(reachRuins(acceptQuest())), EXPEDITION_ENCOUNTERS.ruinSentinel.position)
    ruins = choose(ruins, 'ruinSentinel', 'safe')
    expect(ruins).toMatchObject({ energy: 75, selectedCard: 'wind', enemyHp: 0, bridgeOpen: true })
    expect(ruins.expedition).toMatchObject({ seals: 0, campSupplies: 2, pendingSealBonus: 1 })
    expect(getEncounter(ruins, 'ruinSentinel')).toEqual({ phase: 'resolved', choice: 'safe', enemyHp: 125 })
    expect(ruins.npcs.scout.memories.at(-1)?.text).toContain('遺跡哨衛')
  })

  it('rejects unsafe eligibility, distance, death, resource, and malformed choices without partial effects', () => {
    const arrival = move(createNewGame(), EXPEDITION_ENCOUNTERS.forestCache.position)
    expect(choose(arrival, 'forestCache', 'safe')).toBe(arrival)
    const remote = acceptQuest()
    expect(choose(remote, 'forestCache', 'fight')).toBe(remote)
    const close = move(remote, EXPEDITION_ENCOUNTERS.forestCache.position)
    const dead = { ...close, hp: 0 }
    expect(choose(dead, 'forestCache', 'fight')).toBe(dead)
    const lowEnergy = { ...close, energy: 29.99 }
    expect(choose(lowEnergy, 'forestCache', 'safe')).toBe(lowEnergy)
    expect(getEncounterChoices(lowEnergy, 'forestCache')[0]?.reason).toContain('30')
    const noSeal = { ...close, expedition: { ...close.expedition, seals: 0 } }
    expect(choose(noSeal, 'forestCache', 'safe')).toBe(noSeal)
    expect(getEncounterChoices(noSeal, 'forestCache')[1]?.enabled).toBe(true)
    expect(reduceDemo(close, { type: 'choose-encounter', runId: close.runId, id: 'unknown', choice: 'safe' } as unknown as DemoAction)).toBe(close)
    expect(reduceDemo(close, { type: 'choose-encounter', runId: close.runId, id: 'forestCache', choice: 'loot' } as unknown as DemoAction)).toBe(close)
  })

  it('commits the fight choice, exposes real attack risk, and awards more only on victory', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'fight')
    expect(state.expedition).toMatchObject({ seals: 1, campSupplies: 0 })
    expect(state.expedition.history.forestCache).toEqual({ safe: 0, fights: 1, wins: 0 })
    expect(getCombatTarget(state)).toMatchObject({ id: 'forestCache', hp: 75, maxHp: 75, damage: 12, range: 12 })
    expect(choose(state, 'forestCache', 'safe')).toBe(state)
    state = reduceDemo(state, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' })
    expect(state.hp).toBe(88)
    state = reduceDemo(state, { type: 'tick', delta: 1 })
    state = reduceDemo(state, { type: 'cast', card: 'ember' })
    expect(getEncounter(state, 'forestCache').enemyHp).toBe(50)
    expect(state.expedition.campSupplies).toBe(0)
    state = reduceDemo(recover(state), { type: 'cast', card: 'ember' })
    state = reduceDemo(recover(state), { type: 'cast', card: 'ember' })
    expect(getEncounter(state, 'forestCache')).toEqual({ phase: 'resolved', choice: 'fight', enemyHp: 0 })
    expect(state.expedition.campSupplies).toBe(3)
    expect(state.expedition.history.forestCache.wins).toBe(1)
    expect(state.enemyHp).toBe(100)
    expect(state.stage).toBe('forest')
    expect(reduceDemo(state, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' })).toBe(state)
    expect(choose(state, 'forestCache', 'fight')).toBe(state)
  })

  it('awards five supplies for the harder ruin fight without changing main quest completion', () => {
    const ruins = move(recover(reachRuins(acceptQuest())), EXPEDITION_ENCOUNTERS.ruinSentinel.position)
    let state = choose(ruins, 'ruinSentinel', 'fight')
    expect(getCombatTarget(state)).toMatchObject({ id: 'ruinSentinel', hp: 125, damage: 18, range: 12 })
    state = reduceDemo(state, { type: 'encounter-hit', runId: state.runId, id: 'ruinSentinel' })
    expect(state.hp).toBe(82)
    state = defeatEncounter(state, 'ruinSentinel')
    expect(state.expedition.campSupplies).toBe(5)
    expect(state.expedition.history.ruinSentinel).toEqual({ safe: 0, fights: 1, wins: 1 })
    expect(state.stage).toBe('relic')
    expect(completeQuest(state).stage).toBe('complete')
  })

  it('prioritizes the chosen fight inside its range and falls back to main after retreating', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'fight')
    state = reduceDemo(state, { type: 'tick', delta: 1 })
    state = move(state, WORLD.enemy)
    expect(getCombatTarget(state)?.id).toBe('forestCache')
    const shot = reduceDemo(state, { type: 'cast', card: 'ember' })
    expect(shot.enemyHp).toBe(100)
    expect(getEncounter(shot, 'forestCache').enemyHp).toBe(50)
    state = move(state, { x: 8, z: 10 })
    expect(getCombatTarget(state)?.id).toBe('main')
    expect(reduceDemo(state, { type: 'cast', card: 'ember' }).enemyHp).toBe(75)
    const rangeBoundary = move(state, { x: -5, z: 13 })
    expect(getCombatTarget(rangeBoundary)?.id).toBe('forestCache')
    expect(reduceDemo(rangeBoundary, { type: 'cast', card: 'ember' })).toBe(rangeBoundary)
    expect(reduceDemo(rangeBoundary, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' }).hp).toBe(88)
    const outside = move(rangeBoundary, { x: -5, z: 13.01 })
    expect(reduceDemo(outside, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' })).toBe(outside)
  })

  it('allows only one optional fight at a time while leaving the main quest completable', () => {
    const forestFight = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'fight')
    const ruins = move(reachRuins(forestFight), EXPEDITION_ENCOUNTERS.ruinSentinel.position)
    expect(ruins.stage).toBe('relic')
    expect(getEncounterChoices(ruins, 'ruinSentinel').every(option => !option.enabled)).toBe(true)
    expect(choose(ruins, 'ruinSentinel', 'fight')).toBe(ruins)
    const complete = completeQuest(ruins)
    expect(complete.stage).toBe('complete')
    const next = nextTrip(complete)
    expect(next.expedition.previousTrip?.results.forestCache).toBe('abandoned')
    expect(next.expedition.campSupplies).toBe(0)
    expect(next.expedition.history.forestCache).toEqual({ safe: 0, fights: 1, wins: 0 })
  })

  it('preserves locked choice and enemy damage through death, respawn, and reload', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'fight')
    state = reduceDemo(state, { type: 'tick', delta: 1 })
    state = reduceDemo(state, { type: 'cast', card: 'ember' })
    for (let hit = 0; hit < 9; hit++) state = reduceDemo(state, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' })
    expect(state.hp).toBe(0)
    const storage = memoryStorage()
    expect(saveDemo(storage, state)).toBe(true)
    expect(loadDemo(storage)).toEqual(state)
    state = reduceDemo(loadDemo(storage), { type: 'respawn' })
    expect(state).toMatchObject({ hp: 100, energy: 100, position: WORLD.spawn })
    expect(getEncounter(state, 'forestCache')).toEqual({ phase: 'fighting', choice: 'fight', enemyHp: 50 })
    expect(state.expedition.campSupplies).toBe(0)
    expect(state.expedition.seals).toBe(1)
  })
})

describe('expedition carry-over and bounded rewards', () => {
  it('requires preparation and a foreground cooldown between every ember cast', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'fight')
    expect(state.expedition.emberCooldown).toBe(1)
    expect(reduceDemo(state, { type: 'cast', card: 'ember' })).toBe(state)
    expect(reduceDemo(state, { type: 'recover', delta: 1 }).expedition.emberCooldown).toBe(1)
    state = reduceDemo(state, { type: 'tick', delta: 0.5 })
    expect(state.expedition.emberCooldown).toBe(0.5)
    expect(reduceDemo(state, { type: 'cast', card: 'ember' })).toBe(state)
    const storage = memoryStorage()
    expect(saveDemo(storage, state)).toBe(true)
    state = loadDemo(storage)
    expect(state.expedition.emberCooldown).toBe(0.5)
    state = reduceDemo(state, { type: 'tick', delta: 0.5 })
    state = reduceDemo(state, { type: 'cast', card: 'ember' })
    expect(getEncounter(state, 'forestCache').enemyHp).toBe(50)
    expect(state.expedition.emberCooldown).toBe(1)
    expect(reduceDemo(state, { type: 'cast', card: 'ember' })).toBe(state)
    const dead = { ...state, hp: 0 }
    expect(reduceDemo(dead, { type: 'tick', delta: 1 })).toBe(dead)
    const snapshot = { ...state.expedition }
    delete (snapshot as Partial<typeof snapshot>).emberCooldown
    expect(loadDemo(memoryStorage(JSON.stringify({ ...state, expedition: snapshot }))).expedition.emberCooldown).toBe(0)
  })

  it('turns this trip choices into concrete next-trip shield and a one-time NPC seal gift', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'safe')
    state = reachRuins(state)
    state = choose(move(state, EXPEDITION_ENCOUNTERS.ruinSentinel.position), 'ruinSentinel', 'fight')
    state = completeQuest(defeatEncounter(state, 'ruinSentinel'))
    const old = structuredClone(state)
    expect(state.expedition.campSupplies).toBe(6)
    expect(getNextExpeditionPreview(state)).toMatchObject({ canStart: true, spentSupplies: 6, shieldGranted: 30, extraSealGranted: 1, seals: 2, number: 2 })
    const next = nextTrip(state)
    expect(next.runId).not.toBe(state.runId)
    expect(next).toMatchObject({ stage: 'arrival', hp: 100, energy: 100, enemyHp: 100, bridgeOpen: false, relic: false, seeds: [], position: WORLD.spawn, worldTime: state.worldTime })
    expect(next.expedition).toMatchObject({ number: 2, seals: 2, shield: 30, campSupplies: 0, pendingSealBonus: 0, previousTrip: { number: 1, results: { forestCache: 'safe', ruinSentinel: 'won' }, shieldGranted: 30, extraSealGranted: 1 } })
    expect(next.expedition.history).toEqual(state.expedition.history)
    expect(getNpcExpeditionSummary(next, 'guide').join(' ')).toContain('30 護盾')
    const third = nextTrip(completeQuest(acceptQuest(next)))
    expect(third.expedition).toMatchObject({ number: 3, seals: 1, shield: 0, pendingSealBonus: 0 })
    expect(third.expedition.history.forestCache.safe).toBe(1)
    expect(state).toEqual(old)
  })

  it('uses earned shield against both combat sources and does not replenish it after death', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'safe')
    state = acceptQuest(nextTrip(completeQuest(state)))
    expect(state.expedition.shield).toBe(5)
    state = reduceDemo(state, { type: 'enemy-hit', amount: 8 })
    expect(state.hp).toBe(97)
    expect(state.expedition.shield).toBe(0)
    state = choose(move(state, EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'fight')
    state = reduceDemo(state, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' })
    expect(state.hp).toBe(85)
    for (let hit = 0; hit < 8; hit++) state = reduceDemo(state, { type: 'encounter-hit', runId: state.runId, id: 'forestCache' })
    state = reduceDemo(state, { type: 'respawn' })
    expect(state.expedition.shield).toBe(0)
    expect(state.expedition.seals).toBe(2)
  })

  it('caps preparation at forty shield and leaves unused camp supplies in storage', () => {
    const complete = completeQuest(acceptQuest())
    const stocked = { ...complete, expedition: { ...complete.expedition, campSupplies: 12 } }
    expect(getNextExpeditionPreview(stocked)).toMatchObject({ spentSupplies: 8, shieldGranted: 40 })
    expect(nextTrip(stocked).expedition).toMatchObject({ campSupplies: 4, shield: 40 })
  })

  it('retains NPC learning and world time but resets starting positions, goals, and action progress', () => {
    let state = acceptQuest()
    for (let time = 0; time < 60; time++) state = reduceDemo(state, { type: 'tick', delta: 1 })
    state = completeQuest(state)
    const next = nextTrip(state)
    expect(next.worldTime).toBe(state.worldTime)
    for (const id of ['guide', 'herbalist', 'scout', 'sentinel'] as const) {
      expect(next.npcs[id].position).toEqual(NPC_CONFIG[id].home)
      expect(next.npcs[id].target).toEqual(NPC_CONFIG[id].home)
      expect(next.npcs[id].goal).toBe(id === 'sentinel' ? 'guard' : 'gather')
      expect(next.npcs[id].actionProgress).toBe(0)
      expect(next.npcs[id].skills).toEqual(state.npcs[id].skills)
      expect(next.npcs[id].trust).toBe(state.npcs[id].trust)
      expect(next.npcs[id].memories).toEqual(state.npcs[id].memories)
    }
  })

  it('keeps permanent choice summaries after the short NPC memory has rotated', () => {
    let state = choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'safe')
    for (let time = 0; time < 300; time++) state = reduceDemo(state, { type: 'tick', delta: 1 })
    expect(state.expedition.history.forestCache.safe).toBe(1)
    expect(getNpcExpeditionSummary(state, 'herbalist').join(' ')).toContain('安全處理 1 次')
    expect(getNpcExpeditionSummary(state, 'guide').join(' ')).toContain('下一趟多準備 1 枚刻印')
  })

  it('rejects next-trip attempts before completion, away from Mira, while dead, or with an invalid ID', () => {
    const forest = acceptQuest()
    expect(nextTrip(forest)).toBe(forest)
    const complete = completeQuest(forest)
    const away = move(complete, WORLD.relic)
    expect(nextTrip(away)).toBe(away)
    const dead = { ...complete, hp: 0 }
    expect(nextTrip(dead)).toBe(dead)
    expect(nextTrip(complete, complete.runId)).toBe(complete)
    expect(nextTrip(complete, '')).toBe(complete)
    expect(nextTrip(complete, 'a'.repeat(101))).toBe(complete)
  })

  it('rejects delayed choices, hits, and start commands from a previous run', () => {
    const old = completeQuest(acceptQuest())
    const next = nextTrip(old)
    let current = move(acceptQuest(next), EXPEDITION_ENCOUNTERS.forestCache.position)
    const oldChoose: DemoAction = { type: 'choose-encounter', runId: old.runId, id: 'forestCache', choice: 'safe' }
    expect(reduceDemo(current, oldChoose)).toBe(current)
    current = choose(current, 'forestCache', 'fight')
    expect(reduceDemo(current, { type: 'encounter-hit', runId: old.runId, id: 'forestCache' })).toBe(current)
    expect(reduceDemo(current, { type: 'next-expedition', runId: old.runId, nextRunId: createRunId() })).toBe(current)
    expect(reduceDemo(next, { type: 'next-expedition', runId: old.runId, nextRunId: createRunId() })).toBe(next)
  })

  it('clears all carry-over only when creating a wholly new prototype run', () => {
    const progressed = nextTrip(completeQuest(choose(move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position), 'forestCache', 'safe')))
    const cleared = createNewGame()
    expect(cleared.runId).not.toBe(progressed.runId)
    expect(cleared.expedition).toMatchObject({ number: 1, seals: 1, shield: 0, campSupplies: 0, previousTrip: null, history: { forestCache: { safe: 0, fights: 0, wins: 0 } } })
    expect(cleared.worldTime).toBe(0)
    expect(cleared.npcs.guide.memories).toEqual([])
  })
})

describe('expedition save compatibility', () => {
  it('migrates original v1 saves at every quest stage without resetting player or NPC progress', () => {
    const arrival = createNewGame()
    const forest = acceptQuest(arrival)
    let gate = forest
    for (const position of WORLD.seeds) gate = interact(move(gate, position))
    gate = move(gate, WORLD.enemy)
    for (let shot = 0; shot < 4; shot++) gate = reduceDemo(recover(gate), { type: 'cast', card: 'ember' })
    const relic = reduceDemo(move(recover(gate), WORLD.gate), { type: 'cast', card: 'wind' })
    const returning = interact(move(relic, WORLD.relic))
    const complete = completeQuest(returning)
    for (const state of [arrival, forest, gate, relic, returning, complete]) {
      const { expedition: _expedition, ...legacy } = state
      const loaded = loadDemo(memoryStorage(JSON.stringify(legacy)))
      expect(loaded).toMatchObject(legacy)
      expect(loaded.expedition).toEqual(createNewGame().expedition)
      expect(getExpedition(legacy as DemoState)).toEqual(createNewGame().expedition)
    }
  })

  it('round trips active, safe, won, deceased, and next-trip states without allowing repeat rewards', () => {
    const base = move(acceptQuest(), EXPEDITION_ENCOUNTERS.forestCache.position)
    const safe = choose(base, 'forestCache', 'safe')
    const fighting = reduceDemo(choose(base, 'forestCache', 'fight'), { type: 'cast', card: 'ember' })
    const won = defeatEncounter(choose(base, 'forestCache', 'fight'), 'forestCache')
    const dead = { ...fighting, hp: 0 }
    const next = nextTrip(completeQuest(safe))
    for (const state of [safe, fighting, won, dead, next]) {
      const storage = memoryStorage()
      expect(saveDemo(storage, state)).toBe(true)
      const loaded = loadDemo(storage)
      expect(loaded).toEqual(state)
      if (state !== next) expect(choose(loaded, 'forestCache', 'safe')).toBe(loaded)
    }
  })

  it('rejects corrupt expedition resources or inconsistent outcome states before writing', () => {
    const state = acceptQuest()
    const invalid = [
      { ...state.expedition, seals: 2 }, { ...state.expedition, shield: NaN },
      { ...state.expedition, campSupplies: -1 }, { ...state.expedition, pendingSealBonus: 1 },
      { ...state.expedition, emberCooldown: -1 }, { ...state.expedition, emberCooldown: 1.1 },
      { ...state.expedition, number: 2 }, { ...state.expedition, encounters: { ...state.expedition.encounters, forestCache: { phase: 'resolved', choice: 'fight', enemyHp: 75 } } },
    ]
    for (const expedition of invalid) {
      const corrupted = { ...state, expedition } as DemoState
      expect(saveDemo(memoryStorage(), corrupted)).toBe(false)
      expect(loadDemo(memoryStorage(JSON.stringify(corrupted))).runId).not.toBe(state.runId)
    }
  })
})

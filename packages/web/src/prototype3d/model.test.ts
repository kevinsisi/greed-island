import { describe, expect, it } from 'vitest'
import { cardInfo, createNewGame, distance, getInteraction, getObjective, loadDemo, reduceDemo, saveDemo } from './model'
import { SAVE_KEY, WORLD, type DemoAction, type DemoState, type Position } from './types'

const move = (state: DemoState, position: Position) => reduceDemo(state, { type: 'move', position })
const interact = (state: DemoState) => reduceDemo(state, { type: 'interact' })
const startForest = () => interact(move(createNewGame(), WORLD.guide))

function collectSeeds(state: DemoState): DemoState {
  for (const position of WORLD.seeds) state = interact(move(state, position))
  return state
}

function defeatEnemy(state: DemoState): DemoState {
  state = move(state, WORLD.enemy)
  for (let hit = 0; hit < 4; hit++) state = reduceDemo(state, { type: 'cast', card: 'ember' })
  return state
}

function openBridge(): DemoState {
  const gate = collectSeeds(defeatEnemy(startForest()))
  return reduceDemo(move(gate, WORLD.gate), { type: 'cast', card: 'wind' })
}

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[SAVE_KEY, initial]])
  const reads: string[] = []
  const writes: string[] = []
  return {
    values, reads, writes,
    getItem(key: string) { reads.push(key); return values.get(key) ?? null },
    setItem(key: string, value: string) { writes.push(key); values.set(key, value) },
  }
}

describe('isolated adventure rules', () => {
  it('plays the complete harbor → forest → card → bridge → relic → harbor loop', () => {
    let state = createNewGame()
    expect(getObjective(state).position).toEqual(WORLD.guide)
    expect(getInteraction(state)).toBeNull()
    expect(interact(state)).toBe(state)

    state = move(state, WORLD.guide)
    expect(getInteraction(state)?.kind).toBe('guide')
    state = interact(state)
    expect(state.stage).toBe('forest')

    state = collectSeeds(state)
    expect(state.seeds).toEqual([0, 1, 2])
    expect(state.stage).toBe('forest')
    expect(getObjective(state).position).toEqual(WORLD.enemy)
    state = defeatEnemy(state)
    expect(state).toMatchObject({ stage: 'gate', selectedCard: 'wind', enemyHp: 0, energy: 28 })

    state = move(state, WORLD.gate)
    expect(getInteraction(state)?.kind).toBe('gate')
    expect(interact(state)).toBe(state)
    state = reduceDemo(state, { type: 'cast', card: 'wind' })
    expect(state).toMatchObject({ stage: 'relic', bridgeOpen: true, energy: 3 })
    expect(getObjective(state).position).toEqual(WORLD.relic)

    state = move(state, WORLD.relic)
    expect(getInteraction(state)?.kind).toBe('relic')
    state = interact(state)
    expect(state).toMatchObject({ stage: 'return', relic: true })
    expect(getObjective(state).position).toEqual(WORLD.guide)
    state = move(state, WORLD.guide)
    expect(getInteraction(state)?.kind).toBe('camp')
    state = interact(state)
    expect(state.stage).toBe('complete')
    expect(getObjective(state).title).toBe('委託完成')
    expect(interact(state).stage).toBe('complete')
  })

  it('also rewards wind when the last seed is collected after defeating the enemy', () => {
    let state = defeatEnemy(startForest())
    expect(state.stage).toBe('forest')
    state = collectSeeds(state)
    expect(state).toMatchObject({ stage: 'gate', selectedCard: 'wind', seeds: [0, 1, 2] })
  })

  it('requires interaction range, avoids duplicate seeds, and ignores premature relic interactions', () => {
    let state = move(startForest(), { x: WORLD.seeds[0].x - 2.51, z: WORLD.seeds[0].z })
    expect(interact(state).seeds).toEqual([])
    state = move(state, { x: WORLD.seeds[0].x - 2.5, z: WORLD.seeds[0].z })
    state = interact(state)
    expect(state.seeds).toEqual([0])
    expect(interact(state).seeds).toEqual([0])
    state = move(state, WORLD.relic)
    expect(interact(state)).toBe(state)
    expect(state.relic).toBe(false)
  })

  it('rejects unavailable, out-of-range, empty-target, and insufficient-energy casts without charging', () => {
    const arrival = createNewGame()
    expect(reduceDemo(arrival, { type: 'cast', card: 'ember' })).toBe(arrival)
    const forest = startForest()
    expect(reduceDemo(forest, { type: 'cast', card: 'wind' })).toBe(forest)
    expect(reduceDemo(forest, { type: 'select-card', card: 'wind' })).toBe(forest)
    expect(reduceDemo(forest, { type: 'cast', card: 'ember' })).toBe(forest)
    expect(reduceDemo(forest, { type: 'cast', card: 'tide' })).toBe(forest)

    let edge = move(forest, { x: WORLD.enemy.x, z: WORLD.enemy.z - 11.01 })
    expect(reduceDemo(edge, { type: 'cast', card: 'ember' })).toBe(edge)
    edge = move(edge, { x: WORLD.enemy.x, z: WORLD.enemy.z - 11 })
    const hit = reduceDemo(edge, { type: 'cast', card: 'ember' })
    expect(hit.enemyHp).toBe(75)
    expect(hit.energy).toBe(100 - cardInfo.ember.cost)
    const exhausted = { ...hit, energy: 17.99 }
    expect(reduceDemo(exhausted, { type: 'cast', card: 'ember' })).toBe(exhausted)
    const defeated = defeatEnemy(forest)
    expect(reduceDemo(defeated, { type: 'cast', card: 'ember' })).toBe(defeated)
    expect(reduceDemo(forest, { type: 'cast', card: 'unknown' } as unknown as DemoAction)).toBe(forest)
  })

  it('requires gate proximity and only spends energy on the first bridge opening', () => {
    let state = collectSeeds(defeatEnemy(startForest()))
    state = move(state, { x: WORLD.gate.x, z: WORLD.gate.z - 5.01 })
    expect(reduceDemo(state, { type: 'cast', card: 'wind' })).toBe(state)
    state = move(state, { x: WORLD.gate.x, z: WORLD.gate.z - 5 })
    const opened = reduceDemo(state, { type: 'cast', card: 'wind' })
    expect(opened.bridgeOpen).toBe(true)
    const recovered = reduceDemo(opened, { type: 'recover', delta: 1 })
    expect(reduceDemo(recovered, { type: 'cast', card: 'wind' })).toBe(recovered)
  })

  it('heals the player only, caps health and energy, and rejects malformed recovery deltas', () => {
    let state = reduceDemo(startForest(), { type: 'enemy-hit', amount: 65 })
    state = reduceDemo(state, { type: 'cast', card: 'tide' })
    expect(state).toMatchObject({ hp: 75, enemyHp: 100, energy: 70 })
    state = reduceDemo(state, { type: 'cast', card: 'tide' })
    expect(state).toMatchObject({ hp: 100, enemyHp: 100, energy: 40 })
    state = reduceDemo(state, { type: 'recover', delta: 0.5 })
    expect(state.energy).toBe(45)
    state = reduceDemo(state, { type: 'recover', delta: 3600 })
    expect(state.energy).toBe(55)
    for (const delta of [-1, 0, NaN, Infinity]) expect(reduceDemo(state, { type: 'recover', delta })).toBe(state)
    state = reduceDemo({ ...state, energy: 99 }, { type: 'recover', delta: 1 })
    expect(state.energy).toBe(100)
    expect(reduceDemo(state, { type: 'recover', delta: 1 })).toBe(state)
  })

  it('blocks all actions while dead and respawns without erasing quest progress', () => {
    let state = interact(move(startForest(), WORLD.seeds[0]))
    state = reduceDemo(move(state, WORLD.enemy), { type: 'cast', card: 'ember' })
    state = reduceDemo(state, { type: 'enemy-hit', amount: 1000 })
    expect(state.hp).toBe(0)
    expect(getInteraction(state)).toBeNull()
    expect(getObjective(state).position).toEqual(WORLD.spawn)
    const blocked: DemoAction[] = [
      { type: 'move', position: WORLD.guide }, { type: 'interact' }, { type: 'cast', card: 'tide' },
      { type: 'cast', card: 'ember' }, { type: 'recover', delta: 1 }, { type: 'select-card', card: 'tide' }, { type: 'enemy-hit', amount: 8 },
    ]
    for (const action of blocked) expect(reduceDemo(state, action)).toBe(state)
    const revived = reduceDemo(state, { type: 'respawn' })
    expect(revived).toMatchObject({ hp: 100, energy: 100, stage: 'forest', seeds: [0], enemyHp: 75, runId: state.runId, position: WORLD.spawn })
    expect(reduceDemo(revived, { type: 'respawn' })).toBe(revived)
  })

  it('allows enemy damage only in an active encounter and never accepts negative or nonfinite damage', () => {
    const arrival = createNewGame()
    const deadEnemy = defeatEnemy(startForest())
    const gate = collectSeeds(deadEnemy)
    for (const state of [arrival, deadEnemy, gate, openBridge()]) expect(reduceDemo(state, { type: 'enemy-hit', amount: 8 })).toBe(state)
    const forest = startForest()
    for (const amount of [-5, 0, NaN, Infinity]) expect(reduceDemo(forest, { type: 'enemy-hit', amount })).toBe(forest)
  })

  it('clamps finite moves to the island bounds and rejects NaN/Infinity', () => {
    const state = createNewGame()
    expect(move(state, { x: -1e100, z: 1e100 }).position).toEqual({ x: WORLD.bounds.minX, z: WORLD.bounds.maxZ })
    expect(move(state, { x: 1e100, z: -1e100 }).position).toEqual({ x: WORLD.bounds.maxX, z: WORLD.bounds.minZ })
    expect(move(state, { x: NaN, z: 0 })).toBe(state)
    expect(move(state, { x: 0, z: Infinity })).toBe(state)
    expect(distance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5)
  })

  it('never mutates previous states or shares fresh-run arrays and positions', () => {
    const state = startForest()
    const snapshot = structuredClone(state)
    collectSeeds(state)
    defeatEnemy(state)
    expect(state).toEqual(snapshot)
    const other = createNewGame()
    const fresh = createNewGame()
    expect(other.runId).not.toBe(fresh.runId)
    expect(other.seeds).not.toBe(fresh.seeds)
    expect(other.position).not.toBe(fresh.position)
  })
})

describe('isolated versioned save', () => {
  it('restores saves beyond a closed seal to its safe south side without losing progress', () => {
    const gate = move(collectSeeds(defeatEnemy(startForest())), WORLD.relic)
    const storage = memoryStorage(JSON.stringify(gate))
    const restored = loadDemo(storage)
    expect(restored).toMatchObject({ runId: gate.runId, stage: 'gate', seeds: [0, 1, 2], enemyHp: 0, selectedCard: 'wind' })
    expect(restored.position.z).toBeLessThan(WORLD.gate.z)
    expect(reduceDemo(restored, { type: 'cast', card: 'wind' }).bridgeOpen).toBe(true)
    expect(storage.writes).toEqual([])
    const open = move(openBridge(), WORLD.relic)
    expect(loadDemo(memoryStorage(JSON.stringify(open)))).toEqual(open)
  })

  it('round trips every milestone, selected cards, combat damage, and death', () => {
    const forest = reduceDemo(startForest(), { type: 'select-card', card: 'tide' })
    const hurt = reduceDemo(forest, { type: 'enemy-hit', amount: 33 })
    const dead = reduceDemo(hurt, { type: 'enemy-hit', amount: 100 })
    const gate = collectSeeds(defeatEnemy(startForest()))
    const bridge = openBridge()
    const relic = interact(move(bridge, WORLD.relic))
    const complete = interact(move(relic, WORLD.guide))
    for (const state of [createNewGame(), forest, hurt, dead, gate, bridge, relic, complete]) {
      const storage = memoryStorage()
      expect(saveDemo(storage, state)).toBe(true)
      expect(loadDemo(storage)).toEqual(state)
      expect(storage.reads).toEqual([SAVE_KEY])
      expect(storage.writes).toEqual([SAVE_KEY])
    }
  })

  it('a new run resets only demo progress, preserving unrelated application storage', () => {
    const storage = memoryStorage()
    storage.values.set('production-account', 'untouched')
    const completed = interact(move(interact(move(openBridge(), WORLD.relic)), WORLD.guide))
    expect(saveDemo(storage, completed)).toBe(true)
    const fresh = createNewGame()
    expect(saveDemo(storage, fresh)).toBe(true)
    expect(loadDemo(storage)).toEqual(fresh)
    expect(fresh.runId).not.toBe(completed.runId)
    expect(fresh).toMatchObject({ stage: 'arrival', seeds: [], enemyHp: 100, bridgeOpen: false, relic: false })
    expect(storage.values.get('production-account')).toBe('untouched')
    expect(new Set([...storage.reads, ...storage.writes])).toEqual(new Set([SAVE_KEY]))
  })

  it.each([
    ['future schema', { version: 99 }], ['unknown stage', { stage: 'victory' }], ['missing health', { hp: undefined }],
    ['negative health', { hp: -1 }], ['overfull health', { hp: 101 }], ['null health', { hp: null }],
    ['string energy', { energy: '100' }], ['overfull energy', { energy: 1000 }], ['nonfinite energy', { energy: NaN }],
    ['impossible enemy damage', { enemyHp: 99 }], ['duplicate seeds', { seeds: [0, 0] }],
    ['invalid seed', { seeds: [3] }], ['fractional seed', { seeds: [0.5] }], ['string seed', { seeds: ['0'] }],
    ['outside bounds', { position: { x: 1e20, z: 0 } }], ['incomplete position', { position: { x: 0 } }],
    ['missing position', { position: null }], ['nonfinite position', { position: { x: Infinity, z: 0 } }],
    ['unknown card', { selectedCard: 'water' }], ['locked card', { selectedCard: 'wind' }],
    ['premature bridge', { bridgeOpen: true }], ['premature relic', { relic: true }],
    ['stage without requirements', { stage: 'gate' }], ['arrival damage', { enemyHp: 75 }],
    ['empty run identity', { runId: '' }], ['huge run identity', { runId: 'a'.repeat(101) }],
  ])('resets a corrupt %s save', (_name, patch) => {
    const original = createNewGame()
    const storage = memoryStorage(JSON.stringify({ ...original, ...patch }))
    const loaded = loadDemo(storage)
    expect(loaded).toMatchObject({ stage: 'arrival', hp: 100, energy: 100, seeds: [], bridgeOpen: false, relic: false })
    expect(loaded.runId).not.toBe(original.runId)
    expect(storage.writes).toEqual([])
  })

  it('rejects impossible late-stage combinations and invalid saves before writing', () => {
    const gate = collectSeeds(defeatEnemy(startForest()))
    const invalid = [
      { ...gate, stage: 'forest' as const }, { ...gate, enemyHp: 25 }, { ...gate, seeds: [0, 1] },
      { ...gate, stage: 'relic' as const }, { ...gate, stage: 'return' as const, bridgeOpen: true },
      { ...gate, stage: 'complete' as const, bridgeOpen: true, relic: false },
    ]
    for (const state of invalid) {
      const storage = memoryStorage(JSON.stringify(state))
      expect(loadDemo(storage).stage).toBe('arrival')
      expect(saveDemo(storage, state)).toBe(false)
      expect(storage.writes).toEqual([])
    }
  })

  it.each(['{', 'null', '[]', '3', '{}', 'x'.repeat(4097)])('safely resets malformed JSON or excessive input', raw => {
    expect(loadDemo(memoryStorage(raw)).stage).toBe('arrival')
  })

  it('handles unavailable storage without throwing or claiming persistence', () => {
    const storage = {
      getItem() { throw new Error('storage denied') },
      setItem() { throw new Error('quota exceeded') },
    }
    expect(loadDemo(storage).stage).toBe('arrival')
    expect(saveDemo(storage, createNewGame())).toBe(false)
    expect(loadDemo(memoryStorage()).stage).toBe('arrival')
  })
})

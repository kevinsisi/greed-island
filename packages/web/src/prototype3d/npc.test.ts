import { describe, expect, it } from 'vitest'
import { createNewGame, getInteraction, getObjective, loadDemo, reduceDemo, saveDemo } from './model'
import { createNpcs, getNearbyNpc, getNpc, getNpcs, NPC_CONFIG, NPC_IDS, NPC_MEMORY_LIMIT, npcDialogue, npcEfficiency, restoreNpcs } from './npc'
import { SAVE_KEY, WORLD, type DemoState, type NpcId } from './types'

function advance(state: DemoState, seconds: number): DemoState {
  for (let index = 0; index < seconds; index++) state = reduceDemo(state, { type: 'tick', delta: 1 })
  return state
}

function withNpc(state: DemoState, id: NpcId, patch: Partial<DemoState['npcs'][NpcId]>): DemoState {
  return { ...state, npcs: { ...state.npcs, [id]: { ...state.npcs[id], ...patch } } }
}

function memoryStorage(raw?: string) {
  let value = raw ?? null
  return {
    getItem(key: string) { expect(key).toBe(SAVE_KEY); return value },
    setItem(key: string, updated: string) { expect(key).toBe(SAVE_KEY); value = updated },
  }
}

describe('local autonomous NPCs', () => {
  it('develops four separate actors through real movement, work, skill gain, and needs', () => {
    const initial = createNewGame()
    const snapshot = structuredClone(initial)
    const after = advance(initial, 180)
    expect(after.worldTime).toBe(180)
    for (const id of NPC_IDS) {
      const npc = getNpc(after, id)
      expect(npc.completedActions).toBeGreaterThan(1)
      expect(Object.values(npc.skills).some(experience => experience > 0)).toBe(true)
      expect(npc.energy).toBeGreaterThanOrEqual(0)
      expect(npc.energy).toBeLessThanOrEqual(100)
      expect(npc.memories.length).toBeGreaterThan(0)
      expect(npc.memories.length).toBeLessThanOrEqual(NPC_MEMORY_LIMIT)
      expect(npcDialogue(after, id)).toContain(npc.memories.at(-1)!.text)
    }
    expect(after.npcs.herbalist.skills.study).toBeGreaterThan(0)
    const departing = advance(initial, 3)
    expect(departing.npcs.herbalist.position).not.toEqual(initial.npcs.herbalist.position)
    expect(departing.npcs.scout.position).not.toEqual(initial.npcs.scout.position)
    expect(initial).toEqual(snapshot)
  })

  it('uses energy to interrupt work and consumes gathered supplies for faster recovery', () => {
    const initial = withNpc(createNewGame(), 'herbalist', {
      energy: 10, supplies: 3, position: NPC_CONFIG.herbalist.home, goal: 'gather',
    })
    const withoutSupplies = withNpc(initial, 'herbalist', { supplies: 0 })
    const stocked = advance(initial, 5)
    const hungry = advance(withoutSupplies, 5)
    expect(stocked.npcs.herbalist.goal).toBe('rest')
    expect(stocked.npcs.herbalist.supplies).toBe(2)
    expect(stocked.npcs.herbalist.energy).toBeGreaterThan(hungry.npcs.herbalist.energy)
    expect(advance(initial, 20).npcs.herbalist.goal).not.toBe('rest')
  })

  it('uses gathering experience to increase work speed and actual supply yield', () => {
    const novice = withNpc(createNewGame(), 'herbalist', {
      position: { x: -6, z: -1 }, target: { x: -6, z: -1 }, supplies: 0, curiosity: 0,
    })
    const skilled = withNpc(novice, 'herbalist', { skills: { gathering: 120, study: 0, guarding: 0 } })
    expect(npcEfficiency(getNpc(skilled, 'herbalist'))).toBe(2)
    const noviceAfter = advance(novice, 3).npcs.herbalist
    const skilledAfter = advance(skilled, 3).npcs.herbalist
    expect(noviceAfter.completedActions).toBe(0)
    expect(skilledAfter.completedActions).toBe(1)
    expect(skilledAfter.supplies).toBe(5)
  })

  it('uses learned knowledge and player trust to change the next goal', () => {
    const novice = withNpc(createNewGame(), 'herbalist', { curiosity: 65, goal: 'gather' })
    const learned = withNpc(novice, 'herbalist', { skills: { gathering: 0, study: 120, guarding: 0 } })
    const trusted = withNpc(novice, 'herbalist', { trust: 100 })
    expect(advance(novice, 1).npcs.herbalist.goal).toBe('gather')
    expect(advance(learned, 1).npcs.herbalist.goal).toBe('study')
    expect(advance(trusted, 1).npcs.herbalist.goal).toBe('study')
  })

  it('uses the moving guide position for quest objectives and holds still during a nearby handoff', () => {
    let state = advance(createNewGame(), 3)
    const guide = getNpc(state, 'guide')
    expect(guide.position).not.toEqual(WORLD.guide)
    expect(getObjective(state).position).toEqual(guide.position)
    state = reduceDemo(state, { type: 'move', position: guide.position })
    expect(getInteraction(state)?.kind).toBe('guide')
    expect(advance(state, 3).npcs.guide.position).toEqual(guide.position)
    expect(reduceDemo(state, { type: 'interact' }).stage).toBe('forest')
    expect(guide.position.x).toBeGreaterThanOrEqual(-1.4)
    expect(guide.position.x).toBeLessThanOrEqual(1.4)
  })

  it('requires proximity to talk, remembers the exchange, and applies simulation-time cooldown', () => {
    const initial = createNewGame()
    expect(reduceDemo(initial, { type: 'npc-talk', id: 'herbalist' })).toBe(initial)
    let state = reduceDemo(initial, { type: 'move', position: initial.npcs.herbalist.position })
    expect(getNearbyNpc(state)?.id).toBe('herbalist')
    expect(getInteraction(state)).toMatchObject({ kind: 'npc', npcId: 'herbalist' })
    state = reduceDemo(state, { type: 'npc-talk', id: 'herbalist' })
    expect(state.npcs.herbalist.trust).toBe(5)
    expect(state.npcs.herbalist.memories.at(-1)?.kind).toBe('talk')
    expect(reduceDemo(state, { type: 'npc-talk', id: 'herbalist' })).toBe(state)
    state = advance(state, 10)
    state = reduceDemo(state, { type: 'move', position: state.npcs.herbalist.position })
    expect(reduceDemo(state, { type: 'npc-talk', id: 'herbalist' }).npcs.herbalist.trust).toBe(10)
    expect(reduceDemo(state, { type: 'npc-talk', id: 'sentinel' })).toBe(state)
  })

  it('lets the sentinel learn from visible card casts and sleep permanently after defeat', () => {
    let state = reduceDemo({ ...createNewGame(), position: { ...WORLD.guide } }, { type: 'interact' })
    state = reduceDemo(state, { type: 'move', position: WORLD.enemy })
    state = reduceDemo(state, { type: 'cast', card: 'ember' })
    expect(state.npcs.sentinel.skills.guarding).toBe(3)
    expect(state.npcs.sentinel.memories.at(-1)).toMatchObject({ kind: 'card', text: expect.stringContaining('星火') })
    expect(advance(state, 1).npcs.sentinel.goal).toBe('observe')
    for (let hits = 0; hits < 3; hits++) {
      state = reduceDemo(state, { type: 'tick', delta: 1 })
      state = reduceDemo(state, { type: 'cast', card: 'ember' })
    }
    const asleep = state.npcs.sentinel
    expect(asleep.goal).toBe('sleep')
    expect(asleep.skills.guarding).toBe(12)
    const after = advance(state, 30)
    expect(after.npcs.sentinel).toEqual(asleep)
    expect(after.enemyHp).toBe(0)
    expect(getNearbyNpc({ ...after, position: WORLD.enemy })?.id).not.toBe('sentinel')
  })

  it('reacts to an opened seal by changing peaceful actors to study and remembering the event', () => {
    let state: DemoState = { ...createNewGame(), stage: 'gate', enemyHp: 0, seeds: [0, 1, 2], position: WORLD.gate, selectedCard: 'wind' }
    state = reduceDemo(state, { type: 'cast', card: 'wind' })
    for (const id of ['guide', 'herbalist', 'scout'] as const) {
      expect(state.npcs[id].goal).toBe('study')
      expect(state.npcs[id].curiosity).toBe(100)
      expect(state.npcs[id].trust).toBe(5)
      expect(state.npcs[id].memories.at(-1)?.text).toContain('封印')
    }
    expect(advance(state, 1).npcs.scout.target).toEqual({ x: 6, z: 2 })
  })

  it('caps each tick, rejects invalid deltas, and cannot advance while dead or merely loading', () => {
    const initial = createNewGame()
    for (const delta of [0, -1, NaN, Infinity]) expect(reduceDemo(initial, { type: 'tick', delta })).toBe(initial)
    expect(reduceDemo(initial, { type: 'tick', delta: 3600 }).worldTime).toBe(1)
    const dead = { ...initial, hp: 0 }
    expect(reduceDemo(dead, { type: 'tick', delta: 1 })).toBe(dead)
    const storage = memoryStorage()
    const running = advance(initial, 30)
    expect(saveDemo(storage, running)).toBe(true)
    expect(loadDemo(storage)).toEqual(running)
    expect(loadDemo(storage).worldTime).toBe(30)
  })

  it('keeps memories and save size bounded over repeated work and creates independent new actors', () => {
    const after = advance(createNewGame(), 1500)
    for (const npc of getNpcs(after)) expect(npc.memories.length).toBeLessThanOrEqual(NPC_MEMORY_LIMIT)
    expect(JSON.stringify(after).length).toBeLessThan(32768)
    const first = createNpcs()
    const second = createNpcs()
    first.guide.skills.study = 100
    first.guide.position.x = 10
    expect(second.guide.skills.study).toBe(0)
    expect(second.guide.position).toEqual(WORLD.guide)
  })

  it('has reproducible evolution for the same state and sequence of ticks', () => {
    const initial = createNewGame()
    expect(advance(initial, 240)).toEqual(advance(structuredClone(initial), 240))
  })
})

describe('NPC save migration and HMR compatibility', () => {
  it('upgrades existing v1 saves without changing the adventure or run identity', () => {
    const original = { ...createNewGame(), stage: 'forest' as const, seeds: [0], hp: 61, energy: 42, enemyHp: 75, selectedCard: 'tide' as const }
    const { npcs: _npcs, worldTime: _time, ...legacy } = original
    const restored = loadDemo(memoryStorage(JSON.stringify(legacy)))
    expect(restored).toMatchObject(legacy)
    expect(restored.worldTime).toBe(0)
    expect(Object.keys(restored.npcs)).toEqual(NPC_IDS)
    expect(restored.npcs.sentinel.goal).toBe('guard')
  })

  it('reads and advances an old live HMR state with missing additions', () => {
    const original = createNewGame()
    const { npcs: _npcs, worldTime: _time, ...legacy } = original
    const old = legacy as DemoState
    expect(getNpcs(old)).toHaveLength(4)
    expect(getNpc(old, 'guide').position).toEqual(WORLD.guide)
    expect(getObjective(old).position).toEqual(WORLD.guide)
    const advanced = reduceDemo(old, { type: 'tick', delta: 0.5 })
    expect(advanced.worldTime).toBe(0.5)
    expect(advanced.npcs.herbalist.position).not.toEqual(NPC_CONFIG.herbalist.home)
  })

  it('restores sentinel sleep when upgrading an old completed battle', () => {
    const original = { ...createNewGame(), stage: 'gate', enemyHp: 0, seeds: [0, 1, 2] }
    const { npcs: _npcs, worldTime: _time, ...legacy } = original
    expect(loadDemo(memoryStorage(JSON.stringify(legacy))).npcs.sentinel.goal).toBe('sleep')
    expect(getNpc(legacy as DemoState, 'sentinel').goal).toBe('sleep')
  })

  it('resets only malformed NPC data instead of discarding player progress', () => {
    const progressed = advance(createNewGame(), 30)
    const corrupted = { ...progressed, npcs: { ...progressed.npcs, herbalist: { ...progressed.npcs.herbalist, energy: 'NaN' } } }
    const restored = loadDemo(memoryStorage(JSON.stringify(corrupted)))
    expect(restored.runId).toBe(progressed.runId)
    expect(restored.worldTime).toBe(progressed.worldTime)
    expect(restored.npcs.guide).toEqual(progressed.npcs.guide)
    expect(restored.npcs.herbalist).toEqual(createNpcs().herbalist)
  })

  it('rejects nonfinite positions, oversized memories, unknown goals, and impossible skills', () => {
    const npcs = createNpcs()
    const corruptions = [
      { position: { x: Infinity, z: 0 } }, { goal: 'teleport' }, { skills: { gathering: -1, study: 0, guarding: 0 } },
      { memories: Array.from({ length: 9 }, () => ({ time: 0, kind: 'talk', text: 'hello' })) },
      { memories: [{ time: 99, kind: 'talk', text: 'from the future' }] }, { supplies: 0.5 },
    ]
    for (const patch of corruptions) {
      const restored = restoreNpcs({ ...npcs, scout: { ...npcs.scout, trust: 50, ...patch } }, 0)
      expect(restored.scout).toEqual(npcs.scout)
    }
  })
})

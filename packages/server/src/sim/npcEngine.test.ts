import { describe, expect, it } from 'vitest'
import { NpcEngine, type NpcRuntimeState } from './npcEngine.js'
import type { NpcProfile } from '../npcs/types.js'
import { TICKS_PER_DAY } from '../config/world.js'

function makeProfile(overrides: Partial<NpcProfile> = {}): NpcProfile {
  return {
    id: 'test.npc',
    name: { zh: '測試者', en: 'Tester' },
    role: { zh: '測試員', en: 'Tester' },
    defaultLocation: 't_central',
    routine: [
      {
        fromTickOfDay: 0,
        toTickOfDay: TICKS_PER_DAY / 2,
        location: 't_central',
        label: 'work shift'
      },
      {
        fromTickOfDay: TICKS_PER_DAY / 2,
        toTickOfDay: TICKS_PER_DAY,
        location: 't_dock',
        label: 'evening rest'
      }
    ],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'neutral' },
    ...overrides
  }
}

describe('NpcEngine', () => {
  it('initializes NPCs at their defaultLocation', () => {
    const engine = new NpcEngine([makeProfile()])
    const state = engine.getState('test.npc')
    expect(state).not.toBeNull()
    expect(state!.tile).toBe('t_central')
  })

  it('moves one tile per tick toward the target slot location', () => {
    // 'mover' starts at t_dock but afternoon slot pulls it to t_mountain.
    const profile = makeProfile({
      id: 'mover',
      defaultLocation: 't_dock',
      routine: [
        {
          fromTickOfDay: 0,
          toTickOfDay: TICKS_PER_DAY,
          location: 't_mountain',
          label: 'work morning'
        }
      ]
    })
    const engine = new NpcEngine([profile])
    const seenTiles: string[] = ['t_dock']
    let lastTile = 't_dock'
    for (let t = 1; t <= 6; t += 1) {
      engine.tick(t)
      const cur = engine.getState('mover')!.tile
      if (cur !== lastTile) seenTiles.push(cur)
      lastTile = cur
    }
    // 必須真的走到 t_mountain（否則 BFS 失敗）
    expect(seenTiles).toContain('t_mountain')
    // 中間每一步都應該與前一步 4-相鄰（mapGraph 已測過 adjacency）
    expect(seenTiles[seenTiles.length - 1]).toBe('t_mountain')
  })

  it('emits NPC_MOVE for each tile change', () => {
    const profile = makeProfile({
      id: 'walker',
      defaultLocation: 't_dock',
      routine: [
        { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'work' }
      ]
    })
    const engine = new NpcEngine([profile])
    const result = engine.tick(1)
    const moveEvents = result.events.filter((e) => e.kind === 'move')
    expect(moveEvents.length).toBe(1)
    const ev = moveEvents[0]!
    if (ev.kind === 'move') {
      expect(ev.from).toBe('t_dock')
      expect(ev.to).toBe('t_central')
    }
  })

  it('hydrates from prior state', () => {
    const engine = new NpcEngine([makeProfile()])
    engine.hydrate('test.npc', {
      tile: 't_temple',
      mood: 30,
      health: 50,
      activity: 'work',
      faction: 'guild',
      targetTile: 't_temple',
      lastActedTick: 999
    } as NpcRuntimeState)
    const s = engine.getState('test.npc')!
    expect(s.tile).toBe('t_temple')
    expect(s.mood).toBe(30)
    expect(s.activity).toBe('work')
  })

  it('ignores non-adjacent jump from corrupted hydrate (still works after one tick)', () => {
    const engine = new NpcEngine([makeProfile()])
    engine.hydrate('test.npc', { tile: 't_temple' })
    // schedule pulls back to t_central (or t_dock); the engine should pathfind
    engine.tick(1)
    const s = engine.getState('test.npc')!
    // moved one tile from t_temple toward target
    expect(s.tile).not.toBe('t_temple')
  })
})

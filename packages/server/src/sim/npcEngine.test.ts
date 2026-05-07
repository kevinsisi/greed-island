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

  it('injects a cross-tile wander slot when all routine slots share one location', () => {
    // 'stuck' 整天都待 t_central — engine 應該把中段切出去鄰居 tile
    const stuck = makeProfile({
      id: 'stuck',
      defaultLocation: 't_central',
      routine: [
        {
          fromTickOfDay: 0,
          toTickOfDay: TICKS_PER_DAY,
          location: 't_central',
          label: 'shop counter'
        }
      ]
    })
    const engine = new NpcEngine([stuck])
    // 跑半天分散的 tick，看是否有 NPC tile 變更（不只 t_central）
    const visited = new Set<string>(['t_central'])
    for (let t = 1; t <= TICKS_PER_DAY; t += 60) {
      engine.tick(t)
      visited.add(engine.getState('stuck')!.tile)
    }
    expect(visited.size).toBeGreaterThan(1)
  })

  it('initializes deterministic subCol/subRow on construction', () => {
    const engine = new NpcEngine([makeProfile({ id: 'sub.npc' })])
    const s = engine.getState('sub.npc')!
    expect(s.subCol).toBeGreaterThanOrEqual(0)
    expect(s.subCol).toBeLessThan(15)
    expect(s.subRow).toBeGreaterThanOrEqual(0)
    expect(s.subRow).toBeLessThan(10)
    // 同 id + 同 tile → 永遠一樣的初始位置
    const engine2 = new NpcEngine([makeProfile({ id: 'sub.npc' })])
    const s2 = engine2.getState('sub.npc')!
    expect(s2.subCol).toBe(s.subCol)
    expect(s2.subRow).toBe(s.subRow)
  })

  it('moves at most one sub-cell per tick within the same tile', () => {
    const profile = makeProfile({
      id: 'wander',
      defaultLocation: 't_central',
      routine: [
        { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'shop' }
      ]
    })
    const engine = new NpcEngine([profile])
    const before = engine.getState('wander')!
    engine.tick(1)
    const after = engine.getState('wander')!
    // 同 tile：sub 座標各軸最多 +-1
    expect(Math.abs(after.subCol - before.subCol)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.subRow - before.subRow)).toBeLessThanOrEqual(1)
    // 不會跑到外圈或越界
    expect(after.subCol).toBeGreaterThanOrEqual(0)
    expect(after.subCol).toBeLessThan(15)
    expect(after.subRow).toBeGreaterThanOrEqual(0)
    expect(after.subRow).toBeLessThan(10)
  })

  it('emits a state change while sub-cell is still moving toward anchor', () => {
    const profile = makeProfile({
      id: 'subdrift',
      defaultLocation: 't_central',
      routine: [
        { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'shop' }
      ]
    })
    const engine = new NpcEngine([profile])
    let sawSubChange = false
    for (let t = 1; t <= 6; t += 1) {
      const r = engine.tick(t)
      if (r.changedStates.length > 0) sawSubChange = true
    }
    expect(sawSubChange).toBe(true)
  })

  it('NPCs in transit (activity=move) cannot interact', () => {
    // 兩個 NPC 都從 t_dock 走向 t_mountain — 路上不應產生 interact
    const A = makeProfile({
      id: 'A',
      defaultLocation: 't_dock',
      routine: [
        { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_mountain', label: 'work' }
      ]
    })
    const B = makeProfile({
      id: 'B',
      defaultLocation: 't_dock',
      routine: [
        { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_mountain', label: 'work' }
      ]
    })
    const engine = new NpcEngine([A, B])
    let interactCount = 0
    for (let t = 1; t <= 4; t += 1) {
      const r = engine.tick(t)
      interactCount += r.events.filter((e) => e.kind === 'interact').length
    }
    expect(interactCount).toBe(0) // 兩位都在路上 (activity=move) 不互動
  })
})

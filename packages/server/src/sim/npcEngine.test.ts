import { describe, expect, it } from 'vitest'
import { NpcEngine, NPC_PLAYER_DIALOG_HOLD_TICKS, type NpcRuntimeState } from './npcEngine.js'
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
    const state = engine.getState('walker')!
    expect(state.activity).toBe('move')
    expect(state.travelRoute).toEqual({
      fromTile: 't_dock',
      toTile: 't_central',
      targetTile: 't_central',
      startedAtTick: 1
    })
  })

  it('clears travelRoute after the NPC arrives and resumes local presence', () => {
    const profile = makeProfile({
      id: 'arrival',
      defaultLocation: 't_dock',
      routine: [
        { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }
      ]
    })
    const engine = new NpcEngine([profile])

    engine.tick(1)
    expect(engine.getState('arrival')!.activity).toBe('move')
    expect(engine.getState('arrival')!.travelRoute).not.toBeNull()

    engine.tick(2)
    const state = engine.getState('arrival')!
    expect(state.tile).toBe('t_central')
    expect(state.activity).toBe('idle')
    expect(state.travelRoute).toBeNull()
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

  it('injects a cross-tile wander slot for roaming archetype with all-same routine', () => {
    // 'stuck' 整天都待 t_central — entertainer / outsider 該自動補一段跨區外出。
    // Wanderer 會拿到比職責型 NPC 更長的外出時段。
    const stuck = makeProfile({
      id: 'stuck',
      defaultLocation: 't_central',
      routine: [
        {
          fromTickOfDay: 0,
          toTickOfDay: TICKS_PER_DAY,
          location: 't_central',
          label: 'busking circuit'
        }
      ],
      personality: {
        archetype: 'entertainer',
        talkativeness: 0.95,
        factionLean: 'civilian'
      }
    })
    const engine = new NpcEngine([stuck])
    const visited = new Set<string>(['t_central'])
    for (let t = 1; t <= TICKS_PER_DAY; t += 60) {
      engine.tick(t)
      visited.add(engine.getState('stuck')!.tile)
    }
    expect(visited.size).toBeGreaterThan(1)
  })

  it('lets duty-anchored shopkeepers leave home during a short off-duty errand', () => {
    // v0.15.14 行為：商店 NPC 大部分時間仍在店裡，但職責不是永久 hard lock。
    const shopkeeper = makeProfile({
      id: 'shop',
      defaultLocation: 't_central',
      routine: [
        {
          fromTickOfDay: 0,
          toTickOfDay: TICKS_PER_DAY,
          location: 't_central',
          label: 'shop counter'
        }
      ],
      personality: { archetype: 'shopkeeper', greed: 0.5, factionLean: 'civilian' }
    })
    const engine = new NpcEngine([shopkeeper])
    let crossed = false
    let homeTicks = 0
    let awayTicks = 0
    for (let t = 1; t <= TICKS_PER_DAY; t += 60) {
      engine.tick(t)
      if (engine.getState('shop')!.tile !== 't_central') {
        crossed = true
        awayTicks += 1
      } else {
        homeTicks += 1
      }
    }
    expect(crossed).toBe(true)
    expect(homeTicks).toBeGreaterThan(awayTicks)
  })

  it('honors explicit cross-district routine slots for duty-anchored priests', () => {
    const priest = makeProfile({
      id: 'priest',
      role: { zh: '地脈祭司', en: 'Ley Priest' },
      defaultLocation: 't_temple',
      routine: [
        {
          fromTickOfDay: 0,
          toTickOfDay: TICKS_PER_DAY / 2,
          location: 't_temple',
          label: 'temple duty'
        },
        {
          fromTickOfDay: TICKS_PER_DAY / 2,
          toTickOfDay: TICKS_PER_DAY,
          location: 't_central',
          label: 'council visit'
        }
      ],
      personality: { archetype: 'cleric', factionLean: 'temple' }
    })
    const engine = new NpcEngine([priest])

    for (let t = TICKS_PER_DAY / 2; t <= TICKS_PER_DAY / 2 + 6; t += 1) {
      engine.tick(t)
    }

    expect(engine.getState('priest')!.targetTile).toBe('t_central')
    expect(engine.getState('priest')!.tile).toBe('t_central')
  })

  it('does not inject extra errands into an already cross-district guard routine', () => {
    const guard = makeProfile({
      id: 'guard',
      role: { zh: '巡邏守衛', en: 'Patrol Guard' },
      defaultLocation: 't_dock',
      routine: [
        {
          fromTickOfDay: 0,
          toTickOfDay: TICKS_PER_DAY / 2,
          location: 't_dock',
          label: 'dock patrol'
        },
        {
          fromTickOfDay: TICKS_PER_DAY / 2,
          toTickOfDay: TICKS_PER_DAY,
          location: 't_central',
          label: 'central patrol'
        }
      ],
      personality: { archetype: 'guard', factionLean: 'civic' }
    })
    const engine = new NpcEngine([guard])

    // If an extra errand were injected into the first slot, this mid-duty tick
    // would point away from t_dock. Existing cross-district routines stay intact.
    engine.tick(Math.floor(TICKS_PER_DAY / 3))

    expect(engine.getState('guard')!.targetTile).toBe('t_dock')
  })

  it('initializes deterministic subCol/subRow on construction', () => {
    const engine = new NpcEngine([makeProfile({ id: 'sub.npc' })])
    const s = engine.getState('sub.npc')!
    expect(s.subCol).toBeGreaterThanOrEqual(0)
    expect(s.subCol).toBeLessThan(15)
    expect(s.subRow).toBeGreaterThanOrEqual(0)
    expect(s.subRow).toBeLessThan(10)
    expect(s.subZ).toBe(0)
    // 同 id + 同 tile → 永遠一樣的初始位置
    const engine2 = new NpcEngine([makeProfile({ id: 'sub.npc' })])
    const s2 = engine2.getState('sub.npc')!
    expect(s2.subCol).toBe(s.subCol)
    expect(s2.subRow).toBe(s.subRow)
    expect(s2.subZ).toBe(s.subZ)
  })

  it('does not allow same-tile NPCs to interact across different heights', () => {
    const A = makeProfile({
      id: 'near.A',
      defaultLocation: 't_central',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }],
      personality: { factionLean: 'civilian' }
    })
    const B = makeProfile({
      id: 'near.B',
      defaultLocation: 't_central',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }],
      personality: { factionLean: 'civilian' }
    })
    const engine = new NpcEngine([A, B])
    engine.hydrate('near.A', {
      tile: 't_central',
      targetTile: 't_central',
      activity: 'idle',
      subCol: 7,
      subRow: 5,
      subZ: 0
    })
    engine.hydrate('near.B', {
      tile: 't_central',
      targetTile: 't_central',
      activity: 'idle',
      subCol: 7,
      subRow: 5,
      subZ: 1
    })

    let interactCount = 0
    for (let t = 1; t <= 120; t += 1) {
      const r = engine.tick(t)
      interactCount += r.events.filter((e) => e.kind === 'interact').length
    }
    expect(interactCount).toBe(0)
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

  it('exposes deterministic agent state for each NPC', () => {
    const engine = new NpcEngine([makeProfile({ id: 'agent.npc' })])
    const initial = engine.getState('agent.npc')!

    expect(initial.agent.profileId).toBe('agent.npc')
    expect(initial.agent.permissions).toContain('move.cross_tile')
    expect(initial.agent.permissions).toContain('interact.social')
    expect(initial.agent.activeTask).toEqual({
      kind: 'bootstrap',
      reason: 'profile-loaded',
      targetTile: 't_central',
      startedAtTick: 0,
      expiresAtTick: null
    })

    engine.tick(1)
    const after = engine.getState('agent.npc')!
    expect(after.agent.activeTask.kind).toBe('scheduled-duty')
    expect(after.agent.activeTask.reason).toBe('schedule:work')
    expect(after.agent.activeTask.targetTile).toBe('t_central')
    expect(after.agent.lastDecision).toEqual({ tick: 1, source: 'schedule', reason: 'schedule:work' })
  })

  it('preserves an active agent task start tick while the task signature is stable', () => {
    const profile = makeProfile({
      id: 'stable.agent',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }]
    })
    const engine = new NpcEngine([profile])

    engine.tick(1)
    const startedAt = engine.getState('stable.agent')!.agent.activeTask.startedAtTick
    engine.tick(2)

    expect(engine.getState('stable.agent')!.agent.activeTask.kind).toBe('local-activity')
    expect(engine.getState('stable.agent')!.agent.activeTask.startedAtTick).toBe(startedAt)
  })

  it('marks NPC interaction participants with bounded social agent tasks', () => {
    const A = makeProfile({
      id: 'social.A',
      defaultLocation: 't_central',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }],
      personality: { factionLean: 'civilian' }
    })
    const B = makeProfile({
      id: 'social.B',
      defaultLocation: 't_central',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }],
      personality: { factionLean: 'civilian' }
    })
    const engine = new NpcEngine([A, B])
    engine.hydrate('social.A', { tile: 't_central', targetTile: 't_central', activity: 'idle', subCol: 7, subRow: 5, subZ: 0, mood: 80 })
    engine.hydrate('social.B', { tile: 't_central', targetTile: 't_central', activity: 'idle', subCol: 8, subRow: 5, subZ: 0, mood: 80 })

    let interactionTick = 0
    for (let t = 1; t <= 240; t += 1) {
      const result = engine.tick(t)
      if (result.events.some((e) => e.kind === 'interact')) {
        interactionTick = t
        break
      }
    }

    expect(interactionTick).toBeGreaterThan(0)
    // Runtime calls this only after Rule Engine acceptance; the engine test uses
    // the public commit hook directly to keep Event authority explicit.
    engine.commitSocialInteractionTask(['social.A', 'social.B'], 't_central', 'chat', interactionTick)

    expect(engine.getState('social.A')!.agent.activeTask).toEqual(
      expect.objectContaining({
        kind: 'social-interaction',
        targetTile: 't_central',
        startedAtTick: interactionTick,
        expiresAtTick: interactionTick + 6
      })
    )
    expect(engine.getState('social.B')!.agent.lastDecision.source).toBe('social')
  })

  it('keeps accepted social agent tasks until their deterministic expiry tick', () => {
    const profile = makeProfile({
      id: 'social.ttl',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'idle' }]
    })
    const engine = new NpcEngine([profile])

    engine.commitSocialInteractionTask(['social.ttl', 'missing.peer'], 't_central', 'argue', 10)
    engine.tick(11)
    expect(engine.getState('social.ttl')!.agent.activeTask.kind).toBe('social-interaction')
    engine.tick(16)
    expect(engine.getState('social.ttl')!.agent.activeTask.kind).toBe('local-activity')
  })

  it('holds an NPC in place while a player dialog task is active', () => {
    const profile = makeProfile({
      id: 'dialog.hold',
      defaultLocation: 't_central',
      routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_dock', label: 'work' }]
    })
    const engine = new NpcEngine([profile])

    const hold = engine.commitPlayerDialogHoldTask('dialog.hold', 10)
    expect(hold?.state.agent.activeTask).toEqual(
      expect.objectContaining({
        kind: 'player-dialog',
        targetTile: 't_central',
        expiresAtTick: 10 + NPC_PLAYER_DIALOG_HOLD_TICKS
      })
    )
    engine.tick(11)
    expect(engine.getState('dialog.hold')!.tile).toBe('t_central')
    expect(engine.getState('dialog.hold')!.agent.activeTask.kind).toBe('player-dialog')

    engine.tick(10 + NPC_PLAYER_DIALOG_HOLD_TICKS)
    expect(engine.getState('dialog.hold')!.agent.activeTask.kind).toBe('travel')
    expect(engine.getState('dialog.hold')!.tile).not.toBe('t_central')
  })

  it('hydrates old persisted state without agent using the hydrated tile as fallback target', () => {
    const engine = new NpcEngine([makeProfile({ id: 'legacy.agent' })])

    engine.hydrate('legacy.agent', {
      tile: 't_temple',
      targetTile: 't_temple',
      activity: 'work'
    })

    expect(engine.getState('legacy.agent')!.agent.activeTask).toEqual(
      expect.objectContaining({
        kind: 'bootstrap',
        reason: 'hydrate-fallback',
        targetTile: 't_temple'
      })
    )
  })
})

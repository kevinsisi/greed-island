import { describe, expect, it } from 'vitest'
import { deriveNpcIntentLine } from './npcIntent.js'
import type { NpcRuntimeState } from './npcEngine.js'

function state(input: Partial<NpcRuntimeState>): NpcRuntimeState {
  return {
    tile: 't_central',
    mood: 60,
    health: 80,
    activity: 'idle',
    faction: 'neutral',
    targetTile: 't_central',
    lastActedTick: 0,
    subCol: 7,
    subRow: 5,
    subZ: 0,
    personalityOverride: null,
    travelRoute: null,
    agent: {
      profileId: 'npc.intent',
      permissions: ['move.cross_tile', 'move.local_area', 'interact.social'],
      activeTask: {
        kind: 'local-activity',
        reason: 'schedule:idle',
        targetTile: 't_central',
        startedAtTick: 1,
        expiresAtTick: null
      },
      lastDecision: { tick: 1, source: 'schedule', reason: 'schedule:idle' }
    },
    ...input
  }
}

describe('deriveNpcIntentLine', () => {
  it('summarizes travel using the authoritative target tile', () => {
    const line = deriveNpcIntentLine(
      state({
        activity: 'move',
        targetTile: 't_dock',
        agent: {
          profileId: 'npc.intent',
          permissions: ['move.cross_tile', 'move.local_area', 'interact.social'],
          activeTask: {
            kind: 'travel',
            reason: 'scheduled-travel',
            targetTile: 't_dock',
            startedAtTick: 3,
            expiresAtTick: null
          },
          lastDecision: { tick: 3, source: 'movement', reason: 'scheduled-travel' }
        }
      })
    )

    expect(line.zh).toContain('前往')
    expect(line.en).toBe('Heading to Dock District')
  })

  it('keeps social and player-dialog tasks visible', () => {
    expect(
      deriveNpcIntentLine(
        state({
          agent: {
            profileId: 'npc.intent',
            permissions: ['move.cross_tile', 'move.local_area', 'interact.social'],
            activeTask: {
              kind: 'player-dialog',
              reason: 'player-dialog',
              targetTile: 't_central',
              startedAtTick: 10,
              expiresAtTick: 22
            },
            lastDecision: { tick: 10, source: 'player', reason: 'player-dialog' }
          }
        })
      ).zh
    ).toBe('正在和玩家交談')
  })

  it('maps daily-life activities to short localized labels', () => {
    expect(deriveNpcIntentLine(state({ activity: 'trade' })).zh).toContain('招呼交易')
    expect(deriveNpcIntentLine(state({ activity: 'patrol' })).en).toContain('Patrolling')
  })
})

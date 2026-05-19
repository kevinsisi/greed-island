import { describe, expect, it } from 'vitest'
import { PlayerCivilizationProjection } from './playerCivilization.js'
import type { Event } from '../kernel/types.js'

function makeEvent(eventType: string, data: Record<string, unknown>, sequence = 1): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType,
    occurredAt: 0,
    actorId: (data.playerAccountId as string) ?? 'player',
    payload: { data },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick: (data.tick as number) ?? 1,
  }
}

describe('PlayerCivilizationProjection', () => {
  it('returns empty row for unknown account', () => {
    const proj = new PlayerCivilizationProjection()
    const row = proj.getByAccount('acc-unknown')
    expect(row.wallet).toBe(0)
    expect(row.hiredNpcIds).toEqual([])
    expect(row.factionIds).toEqual([])
    expect(row.claimedTileIds).toEqual([])
  })

  it('hired NPC appears in hiredNpcIds', () => {
    const proj = new PlayerCivilizationProjection()
    proj.project(makeEvent('PLAYER_HIRED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tileId: 't_salt_marsh', tick: 1 }))
    expect(proj.getByAccount('acc-1').hiredNpcIds).toContain('npc_guard_1')
  })

  it('dismissed NPC removed from hiredNpcIds', () => {
    const proj = new PlayerCivilizationProjection()
    proj.project(makeEvent('PLAYER_HIRED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tileId: 't_salt_marsh', tick: 1 }))
    proj.project(makeEvent('PLAYER_DISMISSED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tick: 2 }))
    expect(proj.getByAccount('acc-1').hiredNpcIds).not.toContain('npc_guard_1')
  })

  it('joined faction appears in factionIds', () => {
    const proj = new PlayerCivilizationProjection()
    proj.project(makeEvent('PLAYER_JOINED_FACTION', { playerAccountId: 'acc-1', factionId: 'guild', tick: 1 }))
    expect(proj.getByAccount('acc-1').factionIds).toContain('guild')
  })

  it('left faction removed from factionIds', () => {
    const proj = new PlayerCivilizationProjection()
    proj.project(makeEvent('PLAYER_JOINED_FACTION', { playerAccountId: 'acc-1', factionId: 'guild', tick: 1 }))
    proj.project(makeEvent('PLAYER_LEFT_FACTION', { playerAccountId: 'acc-1', factionId: 'guild', tick: 2 }))
    expect(proj.getByAccount('acc-1').factionIds).not.toContain('guild')
  })

  it('claimed territory appears in claimedTileIds', () => {
    const proj = new PlayerCivilizationProjection()
    proj.project(makeEvent('PLAYER_CLAIMED_TERRITORY', { playerAccountId: 'acc-1', tileId: 't_salt_marsh', tick: 1 }))
    expect(proj.getByAccount('acc-1').claimedTileIds).toContain('t_salt_marsh')
  })

  it('no duplicate hiredNpcIds on repeated hire', () => {
    const proj = new PlayerCivilizationProjection()
    proj.project(makeEvent('PLAYER_HIRED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tileId: 't_salt_marsh', tick: 1 }))
    proj.project(makeEvent('PLAYER_HIRED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tileId: 't_salt_marsh', tick: 2 }))
    expect(proj.getByAccount('acc-1').hiredNpcIds.filter((id) => id === 'npc_guard_1')).toHaveLength(1)
  })

  it('boot hydration via rebuildFromEvents restores net state', () => {
    const proj = new PlayerCivilizationProjection()
    const events: Event[] = [
      makeEvent('PLAYER_HIRED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tileId: 't_salt_marsh', tick: 1 }, 1),
      makeEvent('PLAYER_HIRED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_archer_1', tileId: 't_salt_marsh', tick: 2 }, 2),
      makeEvent('PLAYER_DISMISSED_NPC', { playerAccountId: 'acc-1', npcId: 'npc_guard_1', tick: 3 }, 3),
      makeEvent('PLAYER_JOINED_FACTION', { playerAccountId: 'acc-1', factionId: 'guild', tick: 4 }, 4),
      makeEvent('PLAYER_CLAIMED_TERRITORY', { playerAccountId: 'acc-1', tileId: 't_ruin', tick: 5 }, 5),
    ]
    proj.rebuildFromEvents(events)
    const row = proj.getByAccount('acc-1')
    expect(row.hiredNpcIds).not.toContain('npc_guard_1')
    expect(row.hiredNpcIds).toContain('npc_archer_1')
    expect(row.factionIds).toContain('guild')
    expect(row.claimedTileIds).toContain('t_ruin')
  })
})

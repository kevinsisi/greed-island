import { describe, expect, it } from 'vitest'
import { crossingStatus, isAccountProfile, isCommandAcknowledgement, isPlayerWorldSnapshot, regionStatus, registrationError, snapshotIsNewer } from './protocol'
import { profileFixture, snapshotFixture } from './testFixtures'

describe('single-game canonical protocol', () => {
  it('accepts exact own profile and canonical snapshot with explicit server harbor progress', () => {
    expect(isAccountProfile(profileFixture())).toBe(true)
    expect(isPlayerWorldSnapshot(snapshotFixture())).toBe(true)
    expect(snapshotFixture().harborProgress).toEqual({ status: 'ready', supplies: 1, rewards: 0 })
    expect(snapshotFixture().players[0]).not.toHaveProperty('supplies')
  })
  it('requires canonical positive safe numeric account IDs', () => {
    for (const id of ['1', 0, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isAccountProfile({ ...profileFixture(), accountId: id })).toBe(false)
      expect(isPlayerWorldSnapshot({ ...snapshotFixture(), selfId: id })).toBe(false)
    }
    expect(isAccountProfile({ ...profileFixture(), role: 'owner' })).toBe(false)
  })
  it('rejects array-coerced enums instead of using their string representation', () => {
    const one = snapshotFixture()
    expect(isAccountProfile({ ...profileFixture(), role: ['player'] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, geometry: { ...one.geometry, presentation: ['harbor-3d'] } })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, map: { ...one.map, edges: [{ ...one.map.edges[0], crossingType: ['water-crossing'] }] } })).toBe(false)
  })
  it('rejects another room/version and missing self instead of guessing a fallback', () => {
    expect(isPlayerWorldSnapshot({ ...snapshotFixture(), worldId: 'harbor' })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...snapshotFixture(), version: 2 })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...snapshotFixture(), selfId: 3 })).toBe(false)
  })
  it('rejects duplicate peers, foreign regions and invalid positions', () => {
    const one = snapshotFixture()
    expect(isPlayerWorldSnapshot({ ...one, players: [...one.players, one.players[0]] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, players: [{ ...one.players[0], tileId: 't_central' }] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, players: [{ ...one.players[0], x: NaN }] })).toBe(false)
  })
  it('validates required server geometry and portal destinations', () => {
    const one = snapshotFixture()
    for (const geometry of [{ ...one.geometry, playerRadius: -1 }, { ...one.geometry, movePerStep: 0 }, { ...one.geometry, maxX: -12 }, { ...one.geometry, portals: [{ ...one.geometry.portals[0], toTileId: 'unknown' }] }]) {
      expect(isPlayerWorldSnapshot({ ...one, geometry })).toBe(false)
    }
    expect(isPlayerWorldSnapshot({ ...one, geometry: { ...one.geometry, obstacles: [{ x: 0, z: 1, width: 0, depth: 1 }] } })).toBe(false)
  })
  it('renders only canonical same-region outdoor NPC projection fields', () => {
    const one = snapshotFixture()
    expect(isPlayerWorldSnapshot({ ...one, npcs: [{ ...one.npcs[0], activity: 'move' }] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, npcs: [{ ...one.npcs[0], location: 't_central' }] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, npcs: [{ ...one.npcs[0], presentationPosition: { x: Infinity, z: 0 } }] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, npcs: [one.npcs[0], one.npcs[0]] })).toBe(false)
  })
  it('rejects map inconsistencies and keeps locked/unsupported distinct', () => {
    const one = snapshotFixture()
    expect(isPlayerWorldSnapshot({ ...one, map: { ...one.map, regionOnlineCounts: { unknown: 1 } } })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...one, map: { ...one.map, adjacency: { t_dock: ['unknown'] } } })).toBe(false)
    expect(regionStatus(one.map.regions[2]!)).toBe('區域場景尚未支援')
    expect(regionStatus(one.map.regions[3]!)).toBe('尚未開放')
  })
  it('orders global revision before movement-step and world-tick presence updates', () => {
    expect(snapshotIsNewer(snapshotFixture(5, 10), snapshotFixture(4, 100))).toBe(false)
    expect(snapshotIsNewer(snapshotFixture(5, 10), snapshotFixture(6, 1))).toBe(true)
    expect(snapshotIsNewer(snapshotFixture(5, 10), snapshotFixture(5, 11))).toBe(true)
    expect(snapshotIsNewer(snapshotFixture(5, 10), snapshotFixture(5, 10))).toBe(false)
    expect(snapshotIsNewer(snapshotFixture(5, 10), { ...snapshotFixture(5, 10), worldTick: 4 })).toBe(true)
    expect(snapshotIsNewer(snapshotFixture(5, 10), { ...snapshotFixture(5, 10), presenceRevision: 2 })).toBe(true)
    expect(snapshotIsNewer({ ...snapshotFixture(5, 10), presenceRevision: 2 }, snapshotFixture(5, 11))).toBe(false)
  })
  it('validates bounded public world chat messages from any known sender region', () => {
    const state = snapshotFixture()
    const message = { id: 'chat-1', accountId: 2, tileId: 't_central', text: '<script>escaped text</script>', sequence: 2, worldTick: 3, postedAtMovementStep: 1 }
    expect(isPlayerWorldSnapshot({ ...state, messages: [message] })).toBe(true)
    expect(isPlayerWorldSnapshot({ ...state, messages: [{ ...message, text: 'x'.repeat(241) }] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...state, messages: [message, message] })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...state, messages: [{ ...message, tileId: 'unknown' }] })).toBe(false)
  })
  it('requires a matching committed ACK but never treats it as a snapshot', () => {
    expect(isCommandAcknowledgement({ accepted: true, commandId: 'a', revision: 5 }, 'a')).toBe(true)
    for (const ack of [{ accepted: true, commandId: 'b', revision: 5 }, { accepted: true, commandId: 'a', revision: -1 }, { accepted: true, commandId: 'a', revision: 5, duplicate: false }]) expect(isCommandAcknowledgement(ack, 'a')).toBe(false)
  })
  it('requires confirmed signup bounds and exact password confirmation', () => {
    expect(registrationError('abc_1', '123456789012', '123456789012')).toBeNull()
    expect(registrationError('ab', '123456789012', '123456789012')).toContain('帳號')
    expect(registrationError('valid', 'short', 'short')).toContain('密碼')
    expect(registrationError('valid', '123456789012', 'different')).toContain('不一致')
  })
  it('allows only supported adjacent available portal crossings within server radius', () => {
    const one = snapshotFixture()
    expect(crossingStatus(one, 't_central')).toEqual({ ready: false, text: '走近渡水通路（22.0 m）' })
    const atPortal = { ...one, players: one.players.map(p => p.accountId === 1 ? { ...p, z: 16 } : p) }
    expect(crossingStatus(atPortal, 't_central')).toEqual({ ready: true, text: '渡水前往 夜潮區' })
    expect(crossingStatus(atPortal, 't_forest').ready).toBe(false)
    expect(crossingStatus(atPortal, 't_salt_marsh').text).toBe('尚未開放')
    expect(crossingStatus({ ...atPortal, map: { ...atPortal.map, edges: [] } }, 't_central').ready).toBe(false)
  })
})

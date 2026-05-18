import { describe, expect, it } from 'vitest'
import {
  PLAYER_HAND_CARDS,
  getCombatHandCardMeta,
  shouldShowRejectToast,
} from './combatHand.js'
import { CombatProjection } from '../../state/CombatProjection.js'

// ── Slice 5.4 tests ───────────────────────────────────────────────────────────

describe('CombatScene hand card metadata', () => {
  it('PLAYER_HAND_CARDS resolve to valid metadata', () => {
    for (const cardClass of PLAYER_HAND_CARDS) {
      const meta = getCombatHandCardMeta(cardClass)
      expect(meta, `meta for ${cardClass}`).not.toBeNull()
      expect(meta?.cardClass).toBe(cardClass)
      expect(typeof meta?.labelZh).toBe('string')
      expect(typeof meta?.labelEn).toBe('string')
      expect(meta?.labelZh.length).toBeGreaterThan(0)
      expect(typeof meta?.predictedHpDelta).toBe('number')
      expect(typeof meta?.targetSelf).toBe('boolean')
    }
  })

  it('FIRE_LASH has positive predictedHpDelta (damage) targeting NPC', () => {
    const meta = getCombatHandCardMeta('FIRE_LASH')
    expect(meta?.predictedHpDelta).toBeGreaterThan(0)
    expect(meta?.targetSelf).toBe(false)
  })

  it('MEND has negative predictedHpDelta (heal) targeting self', () => {
    const meta = getCombatHandCardMeta('MEND')
    expect(meta?.predictedHpDelta).toBeLessThan(0)
    expect(meta?.targetSelf).toBe(true)
  })

  it('unknown card returns null', () => {
    expect(getCombatHandCardMeta('NOT_A_CARD')).toBeNull()
  })
})

describe('shouldShowRejectToast', () => {
  it('returns true only for rejected result', () => {
    expect(shouldShowRejectToast({ kind: 'rejected', reason: 'card_rejected' })).toBe(true)
    expect(shouldShowRejectToast({ kind: 'accepted' })).toBe(false)
    expect(shouldShowRejectToast({ kind: 'accepted_with_delta', actualDelta: 20, predictedDelta: 18 })).toBe(false)
  })
})

describe('server-driven hp update via CombatProjection', () => {
  const BASE = {
    combatId: 'combat_test',
    lastCombatTick: 1,
    actors: [
      { actorId: 'player_1', hp: 100, maxHp: 100 },
      { actorId: 'npc_goblin', hp: 100, maxHp: 100 },
    ],
    statuses: [],
    targetLocks: [],
    resolved: false,
    tickDigest: 'digest_1',
  }

  it('COMBAT_DAMAGE event reduces actor hp — drives scene applyState()', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE)
    proj.applyEvent({
      eventType: 'COMBAT_DAMAGE',
      payload: { actorType: 'system', data: { combatId: 'combat_test', combatTick: 2, sourceActorId: 'player_1', targetActorId: 'npc_goblin', amount: 30 }, narration: null },
      tickDigest: 'digest_2',
    })
    const state = proj.state!
    expect(state.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(70)
    // isStale false after applying the authoritative tickDigest
    expect(proj.isStale('digest_2')).toBe(false)
  })

  it('tickDigest mismatch triggers isStale — snapshot refetch gate', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE)
    // Server sends a tickDigest we don't have
    expect(proj.isStale('digest_unknown')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  COMBAT_COMMAND_TYPES,
  isCombatCommandType,
  makeCombatCommandId,
  validateCombatPayload,
  type CombatCommandType,
} from './commands.js'

describe('combat commands — Phase C catalog', () => {
  it('exposes Phase B and Phase C command types without living-world registration', () => {
    expect(COMBAT_COMMAND_TYPES).toEqual([
      'COMBAT_INITIATE',
      'COMBAT_PLAYER_ACTION',
      'COMBAT_RESOLVE',
      'COMBAT_CARD_PLAY',
      'COMBAT_CARD_CANCEL',
      'COMBAT_DAMAGE',
      'COMBAT_HEAL',
      'COMBAT_STATUS_APPLY',
      'COMBAT_STATUS_TICK',
      'COMBAT_STATUS_END',
      'COMBAT_TARGET_LOCK',
      'COMBAT_PHASE_SHIFT',
      'COMBAT_FLEE_ATTEMPT',
      'COMBAT_DEFEAT',
    ])
    expect(isCombatCommandType('COMBAT_CARD_PLAY')).toBe(true)
    expect(isCombatCommandType('NOT_A_COMMAND')).toBe(false)
  })

  it('validates COMBAT_CARD_PLAY payloads against the card catalog', () => {
    expect(validateCombatPayload('COMBAT_CARD_PLAY', {
      combatId: 'combat_a',
      combatTick: 3,
      cardClass: 'FIRE_LASH',
      targetActorId: 'npc_1',
    })).toBeNull()

    expect(validateCombatPayload('COMBAT_CARD_PLAY', {
      combatId: 'combat_a',
      combatTick: 3,
      cardClass: 'NOT_A_CARD',
      targetActorId: 'npc_1',
    })).toBe('cardClass invalid')
  })

  it('validates sub-command payloads for damage, status, lock, phase, flee, and defeat', () => {
    const cases: readonly [CombatCommandType, unknown][] = [
      ['COMBAT_DAMAGE', {
        combatId: 'c', combatTick: 1, sourceActorId: 'a', targetActorId: 'b', amount: 18, cardClass: 'FIRE_LASH', element: 'fire',
      }],
      ['COMBAT_HEAL', {
        combatId: 'c', combatTick: 1, sourceActorId: 'a', targetActorId: 'b', amount: 16, cardClass: 'MEND',
      }],
      ['COMBAT_STATUS_APPLY', {
        combatId: 'c', combatTick: 1, sourceActorId: 'a', targetActorId: 'b', statusId: 'burn', remainingTicks: 30, potency: 2,
      }],
      ['COMBAT_STATUS_TICK', {
        combatId: 'c', combatTick: 2, targetActorId: 'b', statusId: 'burn', remainingTicksAfter: 29, potency: 2,
      }],
      ['COMBAT_STATUS_END', {
        combatId: 'c', combatTick: 31, targetActorId: 'b', statusId: 'burn', reason: 'expired',
      }],
      ['COMBAT_TARGET_LOCK', {
        combatId: 'c', combatTick: 1, sourceActorId: 'a', targetActorId: 'b', durationTicks: 10, cardClass: 'NO_ESCAPE',
      }],
      ['COMBAT_PHASE_SHIFT', {
        combatId: 'c', combatTick: 1, actorId: 'a', phase: 'shifted', cardClass: 'PHASE_SHIFT',
      }],
      ['COMBAT_FLEE_ATTEMPT', {
        combatId: 'c', combatTick: 1, actorId: 'a', cardClass: 'PHASE_SHIFT',
      }],
      ['COMBAT_DEFEAT', {
        combatId: 'c', combatTick: 1, actorId: 'b', defeatedByActorId: 'a', finalHp: 0,
      }],
    ]

    for (const [commandType, payload] of cases) {
      expect(validateCombatPayload(commandType, payload), commandType).toBeNull()
    }
  })

  it('rejects malformed sub-tick payloads', () => {
    expect(validateCombatPayload('COMBAT_DAMAGE', {
      combatId: 'c', combatTick: -1, sourceActorId: 'a', targetActorId: 'b', amount: 1,
    })).toBe('combatTick must be non-negative integer')

    expect(validateCombatPayload('COMBAT_STATUS_APPLY', {
      combatId: 'c', combatTick: 1, sourceActorId: 'a', targetActorId: 'b', statusId: 'burn', remainingTicks: 0,
    })).toBe('remainingTicks must be positive integer')

    expect(validateCombatPayload('COMBAT_CARD_CANCEL', {
      combatId: 'c', combatTick: 1, cancelCommandId: 'cmd_1', reason: 'because',
    })).toBe('invalid reason')
  })

  it('creates deterministic command ids from canonical payload JSON', () => {
    const a = makeCombatCommandId({
      commandType: 'COMBAT_CARD_PLAY',
      actorId: 'actor_a',
      tick: 10,
      combatTick: 4,
      payload: { cardClass: 'FIRE_LASH', targetActorId: 'actor_b', combatId: 'combat_x', combatTick: 4 },
    })
    const b = makeCombatCommandId({
      commandType: 'COMBAT_CARD_PLAY',
      actorId: 'actor_a',
      tick: 10,
      combatTick: 4,
      payload: { combatTick: 4, combatId: 'combat_x', targetActorId: 'actor_b', cardClass: 'FIRE_LASH' },
    })
    const differentCombatTick = makeCombatCommandId({
      commandType: 'COMBAT_CARD_PLAY',
      actorId: 'actor_a',
      tick: 10,
      combatTick: 5,
      payload: { combatTick: 4, combatId: 'combat_x', targetActorId: 'actor_b', cardClass: 'FIRE_LASH' },
    })

    expect(a).toMatch(/^cmd_[0-9a-f]{8}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(differentCombatTick)
  })
})

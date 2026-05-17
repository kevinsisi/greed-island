import { describe, expect, it } from 'vitest'
import { listCombatCardClasses } from './catalog.js'
import { compileCombatCardPlay } from './compiler.js'

const INPUT = {
  combatId: 'combat_2_2',
  actorId: 'actor_a',
  targetActorId: 'actor_b',
  cardClass: 'FIRE_LASH',
}

describe('combat.cards.compiler', () => {
  it('compiles FIRE_LASH into damage + burn status sub-commands', () => {
    const result = compileCombatCardPlay(INPUT)!

    expect(result.card.cardClass).toBe('FIRE_LASH')
    expect(result.subCommands).toEqual([
      {
        commandType: 'COMBAT_DAMAGE',
        payload: {
          combatId: 'combat_2_2',
          sourceActorId: 'actor_a',
          targetActorId: 'actor_b',
          amount: 18,
          element: 'fire',
          cardClass: 'FIRE_LASH',
        },
      },
      {
        commandType: 'COMBAT_STATUS_APPLY',
        payload: {
          combatId: 'combat_2_2',
          sourceActorId: 'actor_a',
          targetActorId: 'actor_b',
          statusId: 'burn',
          remainingTicks: 30,
          potency: 2,
          cardClass: 'FIRE_LASH',
        },
      },
    ])
  })

  it('returns null for unknown card classes', () => {
    expect(compileCombatCardPlay({ ...INPUT, cardClass: 'NOT_A_CARD' })).toBeNull()
  })

  it('keeps target-directed cards targeted at the requested target', () => {
    const result = compileCombatCardPlay({ ...INPUT, cardClass: 'MEND' })!
    expect(result.subCommands).toEqual([
      {
        commandType: 'COMBAT_HEAL',
        payload: {
          combatId: 'combat_2_2',
          sourceActorId: 'actor_a',
          targetActorId: 'actor_b',
          amount: 16,
          cardClass: 'MEND',
        },
      },
    ])
  })

  it('compiles pre-empt cards without requiring target mutation', () => {
    const phase = compileCombatCardPlay({ ...INPUT, cardClass: 'PHASE_SHIFT' })!
    const counter = compileCombatCardPlay({ ...INPUT, cardClass: 'INTERRUPT' })!

    expect(phase.subCommands).toEqual([
      {
        commandType: 'COMBAT_PHASE_SHIFT',
        payload: {
          combatId: 'combat_2_2',
          actorId: 'actor_a',
          phase: 'alt',
          cardClass: 'PHASE_SHIFT',
        },
      },
    ])
    expect(counter.subCommands).toEqual([
      {
        commandType: 'COMBAT_STATUS_APPLY',
        payload: {
          combatId: 'combat_2_2',
          sourceActorId: 'actor_a',
          targetActorId: 'actor_a',
          statusId: 'counter_damage',
          remainingTicks: 1,
          cardClass: 'INTERRUPT',
        },
      },
    ])
  })

  it('compiles every catalog card to at least one known sub-command type', () => {
    const known = new Set([
      'COMBAT_DAMAGE',
      'COMBAT_HEAL',
      'COMBAT_STATUS_APPLY',
      'COMBAT_TARGET_LOCK',
      'COMBAT_PHASE_SHIFT',
      'COMBAT_FLEE_ATTEMPT',
    ])

    for (const cardClass of listCombatCardClasses()) {
      const result = compileCombatCardPlay({ ...INPUT, cardClass })
      expect(result, cardClass).not.toBeNull()
      expect(result!.subCommands.length, cardClass).toBeGreaterThan(0)
      for (const subCommand of result!.subCommands) {
        expect(known.has(subCommand.commandType), `${cardClass}:${subCommand.commandType}`).toBe(true)
      }
    }
  })
})

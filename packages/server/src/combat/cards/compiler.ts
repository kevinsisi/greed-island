// Combat Phase C — Slice 2.2: pure card effect compiler.
//
// This file intentionally does not register commands or mutate combat
// state. It only turns a catalog card into deterministic sub-command
// drafts for the Slice 2.5 rule engine to validate and commit.

import { getCombatCard, type CombatCardClass, type CombatCardDef } from './catalog.js'

export type CombatCardPlayInput = Readonly<{
  combatId: string
  actorId: string
  targetActorId: string
  cardClass: string
}>

export type CombatCompiledSubCommand =
  | Readonly<{
      commandType: 'COMBAT_DAMAGE'
      payload: {
        combatId: string
        sourceActorId: string
        targetActorId: string
        amount: number
        cardClass: CombatCardClass
        element?: string
      }
    }>
  | Readonly<{
      commandType: 'COMBAT_HEAL'
      payload: {
        combatId: string
        sourceActorId: string
        targetActorId: string
        amount: number
        cardClass: CombatCardClass
      }
    }>
  | Readonly<{
      commandType: 'COMBAT_STATUS_APPLY'
      payload: {
        combatId: string
        sourceActorId: string
        targetActorId: string
        statusId: string
        remainingTicks: number
        cardClass: CombatCardClass
        potency?: number
      }
    }>
  | Readonly<{
      commandType: 'COMBAT_TARGET_LOCK'
      payload: {
        combatId: string
        sourceActorId: string
        targetActorId: string
        durationTicks: number
        cardClass: CombatCardClass
      }
    }>
  | Readonly<{
      commandType: 'COMBAT_PHASE_SHIFT'
      payload: {
        combatId: string
        actorId: string
        phase: string
        cardClass: CombatCardClass
      }
    }>
  | Readonly<{
      commandType: 'COMBAT_FLEE_ATTEMPT'
      payload: {
        combatId: string
        actorId: string
        cardClass: CombatCardClass
      }
    }>

export type CombatCardCompileResult = Readonly<{
  card: CombatCardDef
  subCommands: readonly CombatCompiledSubCommand[]
}>

export function compileCombatCardPlay(input: CombatCardPlayInput): CombatCardCompileResult | null {
  const card = getCombatCard(input.cardClass)
  if (!card) return null

  return {
    card,
    subCommands: card.effects.map((effect): CombatCompiledSubCommand => {
      switch (effect.kind) {
        case 'damage':
          return {
            commandType: 'COMBAT_DAMAGE',
            payload: {
              combatId: input.combatId,
              sourceActorId: input.actorId,
              targetActorId: input.targetActorId,
              amount: effect.power,
              cardClass: card.cardClass,
              ...(effect.element ? { element: effect.element } : {}),
            },
          }
        case 'heal':
          return {
            commandType: 'COMBAT_HEAL',
            payload: {
              combatId: input.combatId,
              sourceActorId: input.actorId,
              targetActorId: input.targetActorId,
              amount: effect.power,
              cardClass: card.cardClass,
            },
          }
        case 'status_apply':
          return {
            commandType: 'COMBAT_STATUS_APPLY',
            payload: {
              combatId: input.combatId,
              sourceActorId: input.actorId,
              targetActorId: input.targetActorId,
              statusId: effect.statusId,
              remainingTicks: effect.remainingTicks,
              cardClass: card.cardClass,
              ...(effect.potency !== undefined ? { potency: effect.potency } : {}),
            },
          }
        case 'target_lock':
          return {
            commandType: 'COMBAT_TARGET_LOCK',
            payload: {
              combatId: input.combatId,
              sourceActorId: input.actorId,
              targetActorId: input.targetActorId,
              durationTicks: effect.durationTicks,
              cardClass: card.cardClass,
            },
          }
        case 'phase_shift':
          return {
            commandType: 'COMBAT_PHASE_SHIFT',
            payload: {
              combatId: input.combatId,
              actorId: input.actorId,
              phase: effect.phase,
              cardClass: card.cardClass,
            },
          }
        case 'flee_attempt':
          return {
            commandType: 'COMBAT_FLEE_ATTEMPT',
            payload: {
              combatId: input.combatId,
              actorId: input.actorId,
              cardClass: card.cardClass,
            },
          }
        case 'counter':
          return {
            commandType: 'COMBAT_STATUS_APPLY',
            payload: {
              combatId: input.combatId,
              sourceActorId: input.actorId,
              targetActorId: input.actorId,
              statusId: `counter_${effect.absorbs}`,
              remainingTicks: 1,
              cardClass: card.cardClass,
            },
          }
      }
    }),
  }
}

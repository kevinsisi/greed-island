import { describe, expect, it } from 'vitest'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from './livingWorldCommands.js'
import { samePlayerInterventionReceiptIntent, validPlayerInterventionEffects } from './playerInterventionReceipt.js'

const intent = { playerAccountId: '1', npcA: 'a', npcB: 'b', tile: 't_central', intentClass: 'mediate' as const, message: '', narration: 'mediate' }
const effects = () => ({ npcA: { npcId: 'a', trust: 52, trustDelta: 2, moodDelta: 2 }, npcB: { npcId: 'b', trust: 52, trustDelta: 2, moodDelta: 2 } })
function draft(withEffects: boolean) {
  const base = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0, intent)
  const result = new LivingWorldRuleEngine().evaluate({ ...base, payload: { ...intent, ...(withEffects ? { effects: effects() } : {}) } })
  if (!result.accepted) throw new Error(result.rejection.reason)
  return result.events[0]!
}
describe('bounded typed intervention receipt contract', () => {
  it('preserves the existing command identity scope: another tick or classified intent is a different command', () => {
    const original = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0, intent)
    const later = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 21, 0, intent)
    const reclassified = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0, { ...intent, intentClass: 'threaten', narration: 'threaten' })
    expect(later.commandId).not.toBe(original.commandId); expect(reclassified.commandId).not.toBe(original.commandId)
    expect(makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 100, intent).commandId).toBe(original.commandId)
  })
  it('requires exact result keys, bounded numeric results and the original two NPC identities', () => {
    expect(validPlayerInterventionEffects(effects(), 'a', 'b')).toBe(true)
    for (const change of [{ npcId: 'other' }, { trust: Infinity }, { trust: 101 }, { trustDelta: 100 }, { moodDelta: -6 }, { arbitraryOutput: true }]) {
      expect(validPlayerInterventionEffects({ ...effects(), npcA: { ...effects().npcA, ...change } }, 'a', 'b')).toBe(false)
    }
    expect(validPlayerInterventionEffects({ ...effects(), arbitraryOutput: true }, 'a', 'b')).toBe(false)
  })
  it('accepts a historical matching intent but preserves actor, command, tick, ruleset and envelope conflicts', () => {
    const old = { ...draft(false), sequence: 1 }, next = draft(true)
    expect(samePlayerInterventionReceiptIntent(old, next)).toBe(true)
    for (const change of [{ actorId: '2' }, { commandId: 'other' }, { tick: 21 }, { rulesetVersion: 'other' }, { version: 2 }, { eventType: 'PLAYER_ATE' }]) {
      expect(samePlayerInterventionReceiptIntent({ ...old, ...change }, next)).toBe(false)
    }
    expect(samePlayerInterventionReceiptIntent({ ...old, payload: { ...old.payload, arbitraryOutput: true } }, next)).toBe(false)
  })
})

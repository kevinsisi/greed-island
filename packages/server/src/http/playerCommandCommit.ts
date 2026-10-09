import type { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { PlayerWorldError } from '../playerWorld/types.js'
import { samePlayerInterventionReceiptIntent } from '../kernel/playerInterventionReceipt.js'

/** Trusted server seam. Personal/wallet effects and the fact share the SAME database transaction. */
export function commitAuthorizedPlayerCommand(store: SqliteEventStore, command: LivingWorldCommand, hooks: { authorize: () => void; beforeCommit?: () => void }) {
  if (command.actorType !== 'player' || !/^[1-9][0-9]*$/.test(command.actorId)) throw new PlayerWorldError(400, 'INVALID_PLAYER_ACTOR', 'A canonical player actor is required.')
  const compiled = new LivingWorldRuleEngine().evaluate(command)
  if (!compiled.accepted || compiled.events.length !== 1) return null
  const draft = compiled.events[0]!
  return store.runInTransaction(() => {
    hooks.authorize()
    const prior = store.readEventsByActorCommand(command.actorId, command.commandId, [command.commandType])
    if (prior.length) {
      if (prior.length !== 1 || prior[0]!.eventId !== draft.eventId && !samePlayerInterventionReceiptIntent(prior[0]!, draft)) throw new PlayerWorldError(409, 'COMMAND_ID_CONFLICT', 'Player command ID already has different content.')
      return { event: prior[0]!, duplicate: true }
    }
    hooks.beforeCommit?.()
    const events = store.appendEvents([draft])
    if (events.length !== 1) throw new Error('A player command must commit one complete fact.')
    return { event: events[0]!, duplicate: false }
  })
}

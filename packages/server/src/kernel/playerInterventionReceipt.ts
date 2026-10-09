import { hashCanonicalJson } from './canonicalJson.js'
import type { Event, EventDraft } from './types.js'

export type PlayerInterventionEffects = Readonly<{
  npcA: Readonly<{ npcId: string; trust: number; trustDelta: number; moodDelta: number }>
  npcB: Readonly<{ npcId: string; trust: number; trustDelta: number; moodDelta: number }>
}>

const INTENT_FIELDS = ['playerAccountId', 'npcA', 'npcB', 'tile', 'intentClass', 'message', 'narration'] as const
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
}

/** Only the trusted intervention adapter supplies these result fields. */
export function validPlayerInterventionEffects(value: unknown, npcA: unknown, npcB: unknown): value is PlayerInterventionEffects {
  if (!record(value) || !exactKeys(value, ['npcA', 'npcB'])) return false
  return ([['npcA', npcA], ['npcB', npcB]] as const).every(([key, npcId]) => {
    const row = value[key]
    return record(row) && exactKeys(row, ['npcId', 'trust', 'trustDelta', 'moodDelta']) && row.npcId === npcId
      && typeof row.trust === 'number' && Number.isInteger(row.trust) && row.trust >= 0 && row.trust <= 100
      && typeof row.trustDelta === 'number' && Number.isInteger(row.trustDelta) && row.trustDelta >= -4 && row.trustDelta <= 2
      && typeof row.moodDelta === 'number' && Number.isInteger(row.moodDelta) && row.moodDelta >= -5 && row.moodDelta <= 2
  })
}

/** Compare the exact original typed intent, never arbitrary output/client fields. */
export function samePlayerInterventionReceiptIntent(prior: Event, draft: EventDraft): boolean {
  if (prior.eventType !== 'PLAYER_INTERVENE' || draft.eventType !== 'PLAYER_INTERVENE'
    || prior.actorId !== draft.actorId || prior.commandId !== draft.commandId || prior.tick !== draft.tick
    || prior.rulesetVersion !== draft.rulesetVersion || prior.version !== draft.version) return false
  const intent = (payload: unknown) => {
    if (!record(payload) || !exactKeys(payload, ['actorType', 'data', 'narration']) || payload.actorType !== 'player' || !record(payload.data)) return null
    const data = payload.data, fields = data.effects === undefined ? INTENT_FIELDS : [...INTENT_FIELDS, 'effects']
    if (!exactKeys(data, fields) || data.effects !== undefined && !validPlayerInterventionEffects(data.effects, data.npcA, data.npcB)) return null
    return { actorType: payload.actorType, narration: payload.narration,
      data: Object.fromEntries(INTENT_FIELDS.map(field => [field, data[field]])) }
  }
  const before = intent(prior.payload), next = intent(draft.payload)
  return before !== null && next !== null && hashCanonicalJson(before) === hashCanonicalJson(next)
}

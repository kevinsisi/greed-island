import type { SimulationRuntime } from '../sim/runtime.js'
import { PlayerWorldError } from '../playerWorld/types.js'
import { CanonicalGameplayAuthority } from './gameplayAuthority.js'

/** These are requests, not arbitrary facts. Every returned value is server-derived or checked. */
export function prepareCanonicalPlayerAction(runtime: SimulationRuntime, accountId: number, type: string, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PlayerWorldError(400, 'INVALID_INPUT', 'Action payload must be an object.')
  const payload = raw as Record<string, unknown>, authority = new CanonicalGameplayAuthority(runtime)
  const position = authority.requirePosition(accountId), state = runtime.getPlayerCivilizationSnapshot(String(accountId))
  const fields = (required: string[]) => {
    if (Object.keys(payload).length !== required.length || !required.every(field => Object.hasOwn(payload, field))) throw new PlayerWorldError(400, 'INVALID_INPUT', 'Only action-specific intent fields are accepted.')
  }
  if (type === 'PLAYER_DISMISSED_NPC') {
    fields(['npcId'])
    if (typeof payload.npcId !== 'string' || !state.hiredNpcIds.includes(payload.npcId)) throw new PlayerWorldError(403, 'NPC_NOT_HIRED_BY_PLAYER', 'Only the player’s own hired NPC can be dismissed.')
    return { npcId: payload.npcId }
  }
  if (type === 'PLAYER_LEFT_FACTION') {
    fields(['factionId'])
    if (typeof payload.factionId !== 'string' || !state.factionIds.includes(payload.factionId)) throw new PlayerWorldError(403, 'FACTION_MEMBERSHIP_REQUIRED', 'The canonical player does not belong to this faction.')
    return { factionId: payload.factionId }
  }
  if (type === 'PLAYER_DEPOSIT_GOODS') {
    fields(['goodsId', 'quantity', 'settlementId'])
    const { goodsId, quantity, settlementId } = payload
    if (typeof goodsId !== 'string' || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || typeof settlementId !== 'string') throw new PlayerWorldError(400, 'INVALID_INPUT', 'A valid goods deposit request is required.')
    const settlement = runtime.getSettlementById(settlementId)
    if (!settlement || settlement.tileId !== position.tileId) throw new PlayerWorldError(409, 'SETTLEMENT_NOT_LOCAL', 'Deposit destination must be an existing local settlement.')
    const owned = runtime.getGoodsInventory().find(row => row.holderType === 'player' && row.holderId === String(accountId) && row.tileId === position.tileId && row.goodsId === goodsId)
    if (!owned || owned.quantity < quantity) throw new PlayerWorldError(409, 'INSUFFICIENT_OWNED_GOODS', 'The canonical player does not own enough local goods.')
    return { goodsId, quantity, settlementId, tileId: position.tileId }
  }
  throw new PlayerWorldError(409, 'PLAYER_ACTION_NOT_SERVER_VERIFIED', 'This legacy outcome requires a dedicated server-owned rule or ownership adapter.')
}

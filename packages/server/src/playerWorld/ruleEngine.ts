import { accountActorId, accountId } from '../identity/principal.js'
import type { AccountId } from '../identity/principal.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { makeLivingWorldCommand, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { validWorldChatText, WORLD_CHAT_RATE_STEPS } from './chat.js'
import { canStand, computeMove, getRegionGeometry } from './geometry.js'
import { PlayerWorldError, type PlayerWorldIntent, type PlayerWorldMap, type PlayerWorldPosition } from './types.js'

function reject(status: number, code: string, message: string): never { throw new PlayerWorldError(status, code, message) }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
}
/** Client sends intent only. No positions, principal, timestamps, or progress are accepted. */
export function parsePlayerWorldIntent(body: unknown): PlayerWorldIntent {
  if (!record(body) || !keys(body, ['commandId', 'type', 'payload'])
    || typeof body.commandId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.commandId)
    || !record(body.payload)) reject(400, 'INVALID_COMMAND', 'Invalid player-world command.')
  if (body.type === 'enter' && keys(body.payload, [])) return { commandId: body.commandId, type: 'enter', payload: {} }
  if (body.type === 'move' && keys(body.payload, ['dx', 'dz'])) {
    const { dx, dz } = body.payload
    if (typeof dx === 'number' && typeof dz === 'number' && Number.isFinite(dx) && Number.isFinite(dz)
      && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) return { commandId: body.commandId, type: 'move', payload: { dx, dz } }
  }
  if (body.type === 'chat' && keys(body.payload, ['text']) && validWorldChatText(body.payload.text)) {
    return { commandId: body.commandId, type: 'chat', payload: { text: body.payload.text.trim() } }
  }
  if (body.type === 'transition' && keys(body.payload, ['toTileId'])
    && typeof body.payload.toTileId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(body.payload.toTileId)) {
    return { commandId: body.commandId, type: 'transition', payload: { toTileId: body.payload.toTileId } }
  }
  return reject(400, 'INVALID_COMMAND', 'Invalid intent payload or unsupported operation.')
}
export function playerWorldCommandId(id: AccountId, commandId: string): string { return `player-world:${accountActorId(id)}:${commandId}` }
export function intentDigest(intent: PlayerWorldIntent): string { return hashCanonicalJson(intent) }

export function evaluatePlayerWorldIntent(input: {
  accountId: AccountId; intent: PlayerWorldIntent; position: PlayerWorldPosition | null
  map: PlayerWorldMap; getGeometry?: (tileId: string) => import('./geometry.js').RegionGeometry | null; movementStep: number; worldTick: number; submittedAt: number; lastChatStep?: number; displayName?: string | null
}): LivingWorldCommand {
  const id = accountId(input.accountId), { intent, map, movementStep, position } = input
  if (!Number.isSafeInteger(movementStep) || movementStep < 0) reject(500, 'INVALID_SERVER_STEP', 'Server movement step is invalid.')
  const geometryFor = input.getGeometry ?? getRegionGeometry
  const common = { accountId: id, clientCommandId: intent.commandId, intentDigest: intentDigest(intent) }
  const command = (type: 'PLAYER_WORLD_ENTERED' | 'PLAYER_WORLD_MOVED' | 'PLAYER_REGION_TRANSITIONED', data: Omit<import('./types.js').PlayerWorldEventData, 'accountId' | 'clientCommandId' | 'intentDigest'>): LivingWorldCommand =>
    makeLivingWorldCommand(type, accountActorId(id), 'player', input.worldTick, input.submittedAt,
      { ...common, ...data }, playerWorldCommandId(id, intent.commandId))
  if (intent.type === 'enter') {
    if (position) reject(409, 'ALREADY_IN_WORLD', 'The existing canonical player position must be resumed.')
    const geometry = geometryFor('t_dock')!
    if (!map.regions.some(region => region.id === geometry.tileId && region.available)
      || !canStand(geometry.spawn, geometry)) reject(409, 'SPAWN_UNAVAILABLE', 'Canonical spawn is unavailable.')
    return command('PLAYER_WORLD_ENTERED', { tileId: geometry.tileId, ...geometry.spawn, movementStep: -1 })
  }
  if (!position || position.accountId !== id) reject(409, 'WORLD_ENTRY_REQUIRED', 'Enter the canonical world first.')
  if (intent.type === 'chat') {
    if (input.lastChatStep !== undefined && movementStep - input.lastChatStep < WORLD_CHAT_RATE_STEPS) reject(429, 'CHAT_RATE_LIMIT', 'Please wait before posting another world message.')
    if (!map.regions.some(region => region.id === position.tileId && region.available)) reject(409, 'REGION_UNAVAILABLE', 'Current canonical region is unavailable.')
    return makeLivingWorldCommand('PLAYER_WORLD_CHAT_POSTED', accountActorId(id), 'player', input.worldTick, input.submittedAt,
      { ...common, tileId: position.tileId, text: intent.payload.text, postedAtMovementStep: movementStep,
        ...(input.displayName ? { displayName: input.displayName } : {}) }, playerWorldCommandId(id, intent.commandId))
  }
  if (position.movementStep >= movementStep) reject(429, 'MOVE_RATE_LIMIT', 'Only one movement action per server sub-step is allowed.')
  if (!map.regions.some(region => region.id === position.tileId && region.available)) reject(409, 'REGION_UNAVAILABLE', 'Current canonical region is unavailable.')
  const geometry = geometryFor(position.tileId)
  if (!geometry || !canStand(position, geometry)) reject(409, 'GEOMETRY_UNAVAILABLE', 'Canonical position requires supported walkable geometry.')
  if (intent.type === 'move') return command('PLAYER_WORLD_MOVED', {
    tileId: position.tileId, ...computeMove(position, intent.payload.dx, intent.payload.dz, geometry), movementStep,
  })
  const toTileId = intent.payload.toTileId
  if (!map.regions.some(region => region.id === toTileId && region.available)
    || !(map.adjacency[position.tileId] ?? []).includes(toTileId)) reject(409, 'REGION_UNAVAILABLE', 'Destination is not an available adjacent canonical region.')
  const edge = map.edges.find(edge => edge.available && (
    edge.fromTileId === position.tileId && edge.toTileId === toTileId
    || edge.toTileId === position.tileId && edge.fromTileId === toTileId))
  if (!edge) reject(409, 'EDGE_UNAVAILABLE', 'Canonical crossing edge is unavailable.')
  const destination = geometryFor(toTileId), portal = geometry.portals.find(portal => portal.toTileId === toTileId)
  if (!destination || !portal) reject(409, 'GEOMETRY_UNAVAILABLE', 'Destination geometry or crossing is not supported yet.')
  if (Math.hypot(position.x - portal.x, position.z - portal.z) > portal.radius) reject(409, 'PORTAL_OUT_OF_RANGE', 'Walk to the canonical crossing first.')
  if (!canStand(portal.arrival, destination)) reject(409, 'ARRIVAL_BLOCKED', 'Canonical arrival is blocked.')
  return command('PLAYER_REGION_TRANSITIONED', { tileId: toTileId, ...portal.arrival, movementStep,
    fromTileId: position.tileId, crossingType: edge.crossingType })
}

import { createHash } from 'node:crypto'
import type { Event, EventDraft } from '../kernel/types.js'
import type { RoomCommand, RoomPlayer, RoomState } from './types.js'

export const ROOM_ID = 'local-harbor'
export const TICK_MS = 100
export const MOVE_PER_TICK = 0.4
export const PLAYER_RADIUS = 0.35
export const BEACON = { id: 'harbor-beacon-1', x: 0, z: 6, radius: 2.5, required: 2 }
export const WORLD = { minX: -12, maxX: 12, minZ: -10, maxZ: 18, obstacles: [
  { x: -7, z: 5, width: 4, depth: 5 }, { x: 7, z: 8, width: 4, depth: 5 },
] }
export const INITIAL_PLAYERS: readonly RoomPlayer[] = [
  { id: 'player-a', name: '晨光旅人', x: -2, z: -6, supplies: 1, rewards: 0 },
  { id: 'player-b', name: '潮汐旅人', x: 2, z: -6, supplies: 1, rewards: 0 },
]

export class DomainError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}
function reject(code: string, message: string, status = 400): never { throw new DomainError(status, code, message) }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)) }

export function parseCommand(body: unknown): RoomCommand {
  if (!record(body) || !exactKeys(body, ['commandId', 'type', 'payload'])) reject('INVALID_COMMAND', '命令包含不允許的欄位。')
  if (typeof body.commandId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.commandId)) reject('INVALID_COMMAND', 'commandId 格式不正確。')
  if (body.type !== 'move' && body.type !== 'chat' && body.type !== 'contribute') reject('INVALID_COMMAND', '不支援此操作。')
  if (!record(body.payload)) reject('INVALID_COMMAND', 'payload 必須是物件。')
  const allowed = body.type === 'move' ? ['dx', 'dz'] : body.type === 'chat' ? ['text'] : []
  if (!exactKeys(body.payload, allowed)) reject('INVALID_COMMAND', '不可指定玩家、位置、物資或獎勵。')
  return { commandId: body.commandId, type: body.type, payload: body.payload }
}

export function eventDraft(type: string, identity: string, actor: string, tick: number, payload: unknown, commandId = identity): EventDraft {
  const digest = createHash('sha256').update(`${ROOM_ID}:${type}:${identity}`).digest('hex')
  return { eventId: `mp_${digest}`, eventType: type, actorId: actor, tick, occurredAt: 0, payload, commandId, deterministicKey: digest, version: 1, rulesetVersion: 'local-multiplayer@1' }
}
export function initialEvent(): EventDraft { return eventDraft('MP_INITIALIZED', 'initial', 'system', 0, { players: INITIAL_PLAYERS }) }
export function tickEvent(tick: number): EventDraft { return eventDraft('MP_TICK', String(tick), 'system', tick, {}) }

export type SystemCommand = { type: 'initialize' } | { type: 'tick'; tick: number }
/** System actors pass the same command/rule/event boundary as player intents. */
export function evaluateSystemCommand(state: RoomState, command: SystemCommand): EventDraft[] {
  if (command.type === 'initialize') {
    if (state.sequence !== 0 || state.players.length !== 0) reject('ALREADY_INITIALIZED', '房間已初始化。', 409)
    return [initialEvent()]
  }
  if (state.players.length !== INITIAL_PLAYERS.length || !Number.isSafeInteger(command.tick) || command.tick !== state.tick + 1) reject('INVALID_TICK', '伺服器 tick 必須依序前進。', 409)
  return [tickEvent(command.tick)]
}

function canStand(x: number, z: number): boolean {
  if (x < WORLD.minX + PLAYER_RADIUS || x > WORLD.maxX - PLAYER_RADIUS || z < WORLD.minZ + PLAYER_RADIUS || z > WORLD.maxZ - PLAYER_RADIUS) return false
  return WORLD.obstacles.every(o => Math.abs(x - o.x) >= o.width / 2 + PLAYER_RADIUS || Math.abs(z - o.z) >= o.depth / 2 + PLAYER_RADIUS)
}

/** Pure rule evaluation. All output values are computed from server state. */
export function evaluateCommand(state: RoomState, actor: string, command: RoomCommand): EventDraft[] {
  const player = state.players.find(p => p.id === actor)
  if (!player) reject('UNAUTHORIZED', '找不到本機玩家。', 401)
  const identity = `${actor}:${command.commandId}`
  const draft = (type: string, payload: unknown) => eventDraft(type, identity, actor, state.tick, payload, command.commandId)
  if (command.type === 'move') {
    const { dx, dz } = command.payload
    if (typeof dx !== 'number' || typeof dz !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dz) || Math.abs(dx) > 1 || Math.abs(dz) > 1) reject('INVALID_DIRECTION', '方向必須介於 -1 到 1。')
    if (state.movedAt[actor] === state.tick) reject('MOVE_RATE_LIMIT', '每個伺服器 tick 只能移動一次。', 429)
    const scale = MOVE_PER_TICK / Math.max(1, Math.hypot(dx, dz))
    // Axis sliding avoids getting stuck on corners; a step is smaller than any obstacle.
    let x = player.x, z = player.z
    const nextX = Math.round((x + dx * scale) * 1e6) / 1e6
    const nextZ = Math.round((z + dz * scale) * 1e6) / 1e6
    if (canStand(nextX, z)) x = nextX
    if (canStand(x, nextZ)) z = nextZ
    return [draft('MP_MOVED', { playerId: actor, x, z })]
  }
  if (command.type === 'chat') {
    const raw = command.payload.text
    if (typeof raw !== 'string' || raw.trim().length < 1 || raw.trim().length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) reject('INVALID_MESSAGE', '訊息須為 1–240 字。')
    const previous = [...state.messages].reverse().find(message => message.playerId === actor)
    if (previous && state.tick - previous.tick < 5) reject('CHAT_RATE_LIMIT', '請稍候再發送訊息。', 429)
    return [draft('MP_CHAT', { id: identity, playerId: actor, name: player.name, text: raw.trim(), tick: state.tick })]
  }
  if (state.completed || state.contributors.includes(actor)) reject('ALREADY_CONTRIBUTED', '此角色已完成本次貢獻，不能重複領獎。', 409)
  if (Math.hypot(player.x - BEACON.x, player.z - BEACON.z) > BEACON.radius) reject('OUT_OF_RANGE', '請靠近信標再投入物資。', 409)
  if (player.supplies < 1) reject('NO_SUPPLIES', '沒有可投入的物資。', 409)
  const contributors = [...state.contributors, actor]
  const events = [eventDraft('MP_CONTRIBUTED', `${BEACON.id}:${actor}`, actor, state.tick, { playerId: actor, beaconId: BEACON.id }, command.commandId)]
  if (contributors.length === BEACON.required) {
    events.push(eventDraft('MP_BEACON_COMPLETED', BEACON.id, 'system', state.tick, { beaconId: BEACON.id }, command.commandId))
    for (const playerId of contributors) events.push(eventDraft('MP_REWARDED', `${BEACON.id}:${playerId}`, 'system', state.tick, { playerId, beaconId: BEACON.id }, command.commandId))
  }
  return events
}

export function emptyState(): RoomState { return { sequence: 0, tick: 0, players: [], messages: [], contributors: [], completed: false, movedAt: {} } }
/** Sequence gating makes duplicate delivery safe independently of receipt lookup. */
export function applyEvents(state: RoomState, events: readonly Event[]): RoomState {
  const next = structuredClone(state)
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.sequence <= next.sequence) continue
    const p = event.payload as Record<string, unknown>
    const player = next.players.find(item => item.id === p.playerId)
    switch (event.eventType) {
      case 'MP_INITIALIZED': next.players = structuredClone(p.players as RoomPlayer[]); break
      case 'MP_TICK': next.tick = event.tick!; break
      case 'MP_MOVED': if (player) { player.x = p.x as number; player.z = p.z as number; next.movedAt[player.id] = event.tick! }; break
      case 'MP_CHAT': next.messages.push(p as unknown as RoomState['messages'][number]); next.messages = next.messages.slice(-100); break
      case 'MP_CONTRIBUTED': if (player && !next.contributors.includes(player.id)) { player.supplies -= 1; next.contributors.push(player.id) }; break
      case 'MP_BEACON_COMPLETED': next.completed = true; break
      case 'MP_REWARDED': if (player) player.rewards += 1; break
      default: throw new Error(`Unexpected multiplayer event: ${event.eventType}`)
    }
    next.tick = Math.max(next.tick, event.tick ?? 0)
    next.sequence = event.sequence
  }
  return next
}
export function projectEvents(events: readonly Event[]): RoomState { return applyEvents(emptyState(), events) }

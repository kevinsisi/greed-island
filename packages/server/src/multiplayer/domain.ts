import { createHash } from 'node:crypto'
import type { Event, EventDraft } from '../kernel/types.js'
import type { RoomCommand, RoomConfig, RoomPlayer, RoomState, RosterPlayer } from './types.js'

export const ROOM_ID = 'local-harbor'
export const TICK_MS = 100
export const MOVE_PER_TICK = 0.4
export const PLAYER_RADIUS = 0.35
export const BEACON = { id: 'harbor-beacon-1', x: 0, z: 6, radius: 2.5 }
export const DEFAULT_ROOM_CONFIG: Readonly<RoomConfig> = { maxOnlinePlayers: 50, minParticipants: 2, participationWindowTicks: 300 }
export const MAX_FIXTURE_COUNT = 1000
export const WORLD = { minX: -12, maxX: 12, minZ: -10, maxZ: 18, obstacles: [
  { x: -7, z: 5, width: 4, depth: 5 }, { x: 7, z: 8, width: 4, depth: 5 },
] }
/** Deterministic temporary roster; none of these identities imply online users. */
export function generateRoster(count = DEFAULT_ROOM_CONFIG.maxOnlinePlayers): RosterPlayer[] {
  if (!Number.isSafeInteger(count) || count < 2 || count > MAX_FIXTURE_COUNT) reject('INVALID_ROSTER', `測試身份數必須介於 2 到 ${MAX_FIXTURE_COUNT}。`)
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return { id: 'player-a', name: '晨光旅人', x: -2, z: -6 }
    if (index === 1) return { id: 'player-b', name: '潮汐旅人', x: 2, z: -6 }
    return { id: `player-${index + 1}`, name: `港灣旅人 ${index + 1}`, x: -10 + (index % columns) * 20 / (columns - 1), z: -9 + Math.floor(index / columns) * 8 / Math.max(1, rows - 1) }
  })
}
export function validateRoomSetup(roster: readonly RosterPlayer[], config: RoomConfig): void {
  if (!record(config) || !exactKeys(config, ['maxOnlinePlayers', 'minParticipants', 'participationWindowTicks']) || !Number.isSafeInteger(config.maxOnlinePlayers) || config.maxOnlinePlayers < 2 || config.maxOnlinePlayers > MAX_FIXTURE_COUNT || !Number.isSafeInteger(config.minParticipants) || config.minParticipants < 2 || config.minParticipants > config.maxOnlinePlayers || !Number.isSafeInteger(config.participationWindowTicks) || config.participationWindowTicks < 1 || config.participationWindowTicks > 36_000) reject('INVALID_CONFIG', '房間容量、最低人數或參與期間不正確。')
  if (!Array.isArray(roster) || roster.length < config.minParticipants || roster.length > MAX_FIXTURE_COUNT) reject('INVALID_ROSTER', '測試身份名單不符合事件需求。')
  const ids = new Set<string>(), names = new Set<string>()
  for (const player of roster) {
    if (!record(player) || !exactKeys(player, ['id', 'name', 'x', 'z']) || typeof player.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(player.id) || ids.has(player.id) || typeof player.name !== 'string' || player.name.trim().length < 1 || player.name.length > 80 || names.has(player.name.trim()) || typeof player.x !== 'number' || !Number.isFinite(player.x) || typeof player.z !== 'number' || !Number.isFinite(player.z) || !canStand(player.x, player.z)) reject('INVALID_ROSTER', '玩家身份、名稱或出生位置不正確。')
    ids.add(player.id); names.add(player.name.trim())
  }
}

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
function initialEvent(roster: readonly RosterPlayer[], config: RoomConfig): EventDraft {
  return eventDraft('MP_INITIALIZED', 'initial', 'system', 0, { config: structuredClone(config), players: roster.map(p => ({ ...p, supplies: 1, rewards: 0 })) })
}
export function tickEvent(tick: number): EventDraft { return eventDraft('MP_TICK', String(tick), 'system', tick, {}) }

export type SystemCommand = { type: 'initialize'; roster?: readonly RosterPlayer[]; config?: RoomConfig } | { type: 'tick'; tick: number } | { type: 'player-joined'; player: RosterPlayer }
/** System actors pass the same command/rule/event boundary as player intents. */
export function evaluateSystemCommand(state: RoomState, command: SystemCommand): EventDraft[] {
  if (command.type === 'player-joined') {
    const { player } = command
    if (state.players.length >= MAX_FIXTURE_COUNT || state.players.some(existing => existing.id === player.id) || !/^[a-zA-Z0-9_-]{1,100}$/.test(player.id) || typeof player.name !== 'string' || player.name.trim().length < 1 || player.name.length > 80 || !canStand(player.x, player.z)) reject('INVALID_PLAYER', '玩家資料不正確。', 409)
    return [eventDraft('MP_PLAYER_JOINED', player.id, 'system', state.tick, { player: { ...player, supplies: 1, rewards: 0 } })]
  }
  if (command.type === 'initialize') {
    if (state.sequence !== 0 || state.players.length !== 0) reject('ALREADY_INITIALIZED', '房間已初始化。', 409)
    const config = command.config ?? { ...DEFAULT_ROOM_CONFIG }
    const roster = command.roster ?? generateRoster()
    validateRoomSetup(roster, config)
    return [initialEvent(roster, config)]
  }
  if (state.players.length === 0 || !Number.isSafeInteger(command.tick) || command.tick !== state.tick + 1) reject('INVALID_TICK', '伺服器 tick 必須依序前進。', 409)
  const events = [tickEvent(command.tick)]
  if (!state.completed && state.closesAtTick !== null && command.tick >= state.closesAtTick && state.contributors.length >= state.config.minParticipants) {
    events.push(eventDraft('MP_BEACON_COMPLETED', BEACON.id, 'system', command.tick, { beaconId: BEACON.id }))
    for (const playerId of state.contributors) {
      if (!state.awardedPlayerIds.includes(playerId)) events.push(eventDraft('MP_REWARDED', `${BEACON.id}:${playerId}`, 'system', command.tick, { playerId, beaconId: BEACON.id }))
    }
  }
  return events
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
    if (Object.hasOwn(state.movedAt, actor) && state.movedAt[actor] === state.tick) reject('MOVE_RATE_LIMIT', '每個伺服器 tick 只能移動一次。', 429)
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
  if (state.closesAtTick !== null && state.tick >= state.closesAtTick) reject('PARTICIPATION_CLOSED', '本次信標收集已截止。', 409)
  if (Math.hypot(player.x - BEACON.x, player.z - BEACON.z) > BEACON.radius) reject('OUT_OF_RANGE', '請靠近信標再投入物資。', 409)
  if (player.supplies < 1) reject('NO_SUPPLIES', '沒有可投入的物資。', 409)
  const contributors = [...state.contributors, actor]
  const events = [eventDraft('MP_CONTRIBUTED', `${BEACON.id}:${actor}`, actor, state.tick, { playerId: actor, beaconId: BEACON.id }, command.commandId)]
  if (state.closesAtTick === null && contributors.length >= state.config.minParticipants) {
    events.push(eventDraft('MP_COLLECTION_OPENED', BEACON.id, 'system', state.tick, { beaconId: BEACON.id, closesAtTick: state.tick + state.config.participationWindowTicks }, command.commandId))
  }
  return events
}

export function emptyState(): RoomState { return { sequence: 0, tick: 0, config: { ...DEFAULT_ROOM_CONFIG }, players: [], messages: [], contributors: [], completed: false, closesAtTick: null, awardedPlayerIds: [], movedAt: {} } }
/** Sequence gating makes duplicate delivery safe independently of receipt lookup. */
export function applyEvents(state: RoomState, events: readonly Event[]): RoomState {
  const next = structuredClone(state)
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.sequence <= next.sequence) continue
    const p = event.payload as Record<string, unknown>
    const player = next.players.find(item => item.id === p.playerId)
    switch (event.eventType) {
      case 'MP_INITIALIZED':
        next.players = structuredClone(p.players as RoomPlayer[])
        // Old two-player logs have no config. Preserve their recorded roster/resources exactly.
        next.config = structuredClone((p.config as RoomConfig | undefined) ?? DEFAULT_ROOM_CONFIG)
        break
      case 'MP_PLAYER_JOINED':
        if (!next.players.some(item => item.id === (p.player as RoomPlayer).id)) next.players.push(structuredClone(p.player as RoomPlayer))
        break
      case 'MP_TICK': next.tick = event.tick!; break
      case 'MP_MOVED': if (player) {
        player.x = p.x as number; player.z = p.z as number
        // Treat arbitrary roster IDs as data, including names such as __proto__.
        Object.defineProperty(next.movedAt, player.id, { value: event.tick!, enumerable: true, writable: true, configurable: true })
      }; break
      case 'MP_CHAT': next.messages.push(p as unknown as RoomState['messages'][number]); next.messages = next.messages.slice(-100); break
      case 'MP_CONTRIBUTED': if (player && !next.contributors.includes(player.id)) { player.supplies -= 1; next.contributors.push(player.id) }; break
      case 'MP_COLLECTION_OPENED': next.closesAtTick = p.closesAtTick as number; break
      case 'MP_BEACON_COMPLETED': next.completed = true; break
      case 'MP_REWARDED': if (player && !next.awardedPlayerIds.includes(player.id)) { player.rewards += 1; next.awardedPlayerIds.push(player.id) }; break
      default: throw new Error(`Unexpected multiplayer event: ${event.eventType}`)
    }
    next.tick = Math.max(next.tick, event.tick ?? 0)
    next.sequence = event.sequence
  }
  return next
}
export function projectEvents(events: readonly Event[]): RoomState { return applyEvents(emptyState(), events) }

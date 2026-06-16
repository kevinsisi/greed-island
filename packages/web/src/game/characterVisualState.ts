import type { NpcActivity, NpcSummary } from '../state/types'

export type CharacterVisualKind = 'npc' | 'local-player' | 'peer-player'
export type CharacterVisualAction =
  | 'idle'
  | 'walk'
  | 'work'
  | 'eat'
  | 'sleep'
  | 'trade'
  | 'patrol'
  | 'read'
  | 'perform'
  | 'craft'
  | 'study'
  | 'pray'
  | 'write'
  | 'guard'
export type CharacterVisualSource = 'server-npc' | 'server-player-presence' | 'local-input'
export type CharacterFacing = 'left' | 'right'

export type CharacterVisualState = Readonly<{
  id: string
  kind: CharacterVisualKind
  x: number
  y: number
  z: number
  label: string
  shortLabel: string
  color: number
  action: CharacterVisualAction
  facing: CharacterFacing
  source: CharacterVisualSource
  mood?: number
  health?: number
}>

export type CharacterPoint = Readonly<{
  x: number
  y: number
  z?: number | null
}>

export type NpcVisualInput = Readonly<{
  npc: Pick<NpcSummary, 'id' | 'name'> & Partial<Pick<NpcSummary, 'activity' | 'color' | 'mood' | 'health' | 'subZ'>>
  x: number
  y: number
  previous?: CharacterPoint | null
  fallbackColor?: number
}>

export type LocalPlayerVisualInput = Readonly<{
  id: string | number
  label: string
  shortLabel?: string
  x: number
  y: number
  z?: number | null
  velocityX?: number
  velocityY?: number
  previousFacing?: CharacterFacing
  color?: number
}>

export type PeerPlayerVisualInput = Readonly<{
  id: string | number
  label: string
  shortLabel?: string
  x: number | null | undefined
  y: number | null | undefined
  z?: number | null
  previous?: CharacterPoint | null
  fallback: CharacterPoint
  previousFacing?: CharacterFacing
  color?: number
}>

const DEFAULT_NPC_COLOR = 0xfff5b8
const DEFAULT_LOCAL_PLAYER_COLOR = 0xfff5b8
const DEFAULT_PEER_PLAYER_COLOR = 0x9ee0c7
const MOVEMENT_EPSILON = 0.5

export function characterActionForNpcActivity(activity: NpcActivity | undefined): CharacterVisualAction {
  switch (activity) {
    case 'move':    return 'walk'
    case 'work':    return 'work'
    case 'eat':     return 'eat'
    case 'sleep':   return 'idle'
    case 'trade':   return 'trade'
    case 'patrol':  return 'patrol'
    case 'read':    return 'read'
    case 'perform': return 'perform'
    case 'craft':   return 'craft'
    case 'study':   return 'study'
    case 'pray':    return 'pray'
    case 'write':   return 'write'
    case 'guard':   return 'guard'
    case 'idle':
    default:        return 'idle'
  }
}

export function characterVisualStateForNpc(input: NpcVisualInput): CharacterVisualState {
  const { npc, previous } = input
  return withOptionalVitals({
    id: npc.id,
    kind: 'npc',
    x: input.x,
    y: input.y,
    z: typeof npc.subZ === 'number' ? npc.subZ : 0,
    label: npc.name,
    shortLabel: npc.name.charAt(0),
    color: typeof npc.color === 'number' ? npc.color : input.fallbackColor ?? DEFAULT_NPC_COLOR,
    action: characterActionForNpcActivity(npc.activity),
    facing: facingFromDelta(previous, input, 'right'),
    source: 'server-npc',
  }, npc)
}

export function characterVisualStateForLocalPlayer(input: LocalPlayerVisualInput): CharacterVisualState {
  const moving = movementMagnitude(input.velocityX ?? 0, input.velocityY ?? 0) > MOVEMENT_EPSILON
  return {
    id: String(input.id),
    kind: 'local-player',
    x: input.x,
    y: input.y,
    z: normaliseZ(input.z),
    label: input.label,
    shortLabel: input.shortLabel ?? shortLabelFor(input.label),
    color: input.color ?? DEFAULT_LOCAL_PLAYER_COLOR,
    action: moving ? 'walk' : 'idle',
    facing: facingFromVelocity(input.velocityX ?? 0, input.previousFacing ?? 'right'),
    source: 'local-input',
  }
}

export function characterVisualStateForPeerPlayer(input: PeerPlayerVisualInput): CharacterVisualState {
  const x = typeof input.x === 'number' && Number.isFinite(input.x) ? input.x : input.fallback.x
  const y = typeof input.y === 'number' && Number.isFinite(input.y) ? input.y : input.fallback.y
  const point = { x, y }
  return {
    id: String(input.id),
    kind: 'peer-player',
    x,
    y,
    z: normaliseZ(input.z ?? input.fallback.z),
    label: input.label,
    shortLabel: input.shortLabel ?? shortLabelFor(input.label),
    color: input.color ?? DEFAULT_PEER_PLAYER_COLOR,
    action: hasMoved(input.previous, point) ? 'walk' : 'idle',
    facing: facingFromDelta(input.previous, point, input.previousFacing ?? 'right'),
    source: 'server-player-presence',
  }
}

function withOptionalVitals(
  state: CharacterVisualState,
  vitals: Partial<Pick<NpcSummary, 'mood' | 'health'>>
): CharacterVisualState {
  return {
    ...state,
    ...(typeof vitals.mood === 'number' ? { mood: vitals.mood } : {}),
    ...(typeof vitals.health === 'number' ? { health: vitals.health } : {}),
  }
}

function facingFromDelta(
  previous: CharacterPoint | null | undefined,
  current: Pick<CharacterPoint, 'x' | 'y'>,
  fallback: CharacterFacing
): CharacterFacing {
  if (!previous) return fallback
  const dx = current.x - previous.x
  if (Math.abs(dx) <= MOVEMENT_EPSILON) return fallback
  return dx < 0 ? 'left' : 'right'
}

function facingFromVelocity(velocityX: number, fallback: CharacterFacing): CharacterFacing {
  if (Math.abs(velocityX) <= MOVEMENT_EPSILON) return fallback
  return velocityX < 0 ? 'left' : 'right'
}

function hasMoved(previous: CharacterPoint | null | undefined, current: Pick<CharacterPoint, 'x' | 'y'>): boolean {
  if (!previous) return false
  return movementMagnitude(current.x - previous.x, current.y - previous.y) > MOVEMENT_EPSILON
}

function movementMagnitude(dx: number, dy: number): number {
  return Math.hypot(dx, dy)
}

function normaliseZ(z: number | null | undefined): number {
  return typeof z === 'number' && Number.isFinite(z) ? z : 0
}

function shortLabelFor(label: string): string {
  const trimmed = label.trim()
  return (trimmed.charAt(0) || '?').toUpperCase()
}

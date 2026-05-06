export const KERNEL_EVENT_VERSION = 1
export const KERNEL_WORLD_STATE_VERSION = 1
export const DEFAULT_RULESET_VERSION = 'simulation-kernel@0.1.0'

export type Command<TPayload = unknown> = Readonly<{
  commandId: string
  commandType: string
  actorId: string
  submittedAt: number
  payload: TPayload
}>

export type RuleRejection = Readonly<{
  commandId: string
  commandType: string
  actorId: string
  code: string
  reason: string
  details?: unknown
}>

export type EventDraft<TPayload = unknown> = Readonly<{
  eventId: string
  eventType: string
  occurredAt: number
  actorId: string
  payload: TPayload
  deterministicKey: string
  version: number
  commandId?: string
  tick?: number
  rulesetVersion?: string
}>

export type Event<TPayload = unknown> = EventDraft<TPayload> &
  Readonly<{
    sequence: number
  }>

export type RuleResult<TPayload = unknown> =
  | Readonly<{
      accepted: true
      events: readonly EventDraft<TPayload>[]
    }>
  | Readonly<{
      accepted: false
      rejection: RuleRejection
    }>

export type KernelFacts = Readonly<Record<string, unknown>>

export type WorldState = Readonly<{
  version: number
  lastSequence: number
  eventCount: number
  facts: KernelFacts
}>

export type Reducer<TState = WorldState> = (events: readonly Event[]) => TState

export type FactSetPayload = Readonly<{
  key: string
  value: unknown
}>

export type AiEventSnapshot = Readonly<{
  sequence: number
  eventType: string
  actorId: string
  commandId?: string
  payload: unknown
  deterministicKey: string
  version: number
  tick?: number
  rulesetVersion?: string
}>

export type AiSnapshotInput = Readonly<{
  lastSequence: number
  events: readonly AiEventSnapshot[]
  worldState: WorldState
}>

export type AiNarrationOutput = Readonly<{
  text: string
}>

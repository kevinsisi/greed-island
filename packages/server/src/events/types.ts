// World event system — types.
//
// World events are *narrative* simulation events (storms, festivals,
// shop deals, NPC squabbles, card rumours, etc.) that flavour the
// world independently of player actions. They are emitted by the
// world event engine on a fixed tick cadence and projected into the
// world snapshot under `world.activeEvents` so any client (HTTP poll
// or SSE listener) sees the same set.
//
// Determinism is preserved by seeding the engine's RNG from the
// current tick. Replaying the same event log will pick the same
// templates at the same ticks, with the same narrative wording.

export type WorldEventType = 'weather' | 'npc' | 'card' | 'city'

export type WorldEventScope =
  | Readonly<{ kind: 'world' }>
  | Readonly<{ kind: 'region'; tileIds: readonly string[] }>

export type LocalizedText = Readonly<{ zh: string; en: string }>

/**
 * Active world event — the runtime instance generated from a
 * template at spawn time. Stored in `world.activeEvents` for the
 * lifetime of the event.
 */
export type ActiveWorldEvent = Readonly<{
  /** Unique instance id, deterministic per (templateId, startedAtTick). */
  id: string
  templateId: string
  type: WorldEventType
  scope: WorldEventScope
  startedAtTick: number
  endsAtTick: number
  text: LocalizedText
  /**
   * Free-form payload describing the event's effect on players, so
   * the frontend can lean into mechanics later without re-coding the
   * template registry.
   */
  payload: Readonly<Record<string, unknown>>
}>

/** Template-time context passed to narrate / payload builders. */
export type WorldEventContext = Readonly<{
  tick: number
  weather: string
  season: string
  /**
   * Deterministic [0,1) RNG seeded from the spawn tick. Calling it
   * again yields a new value, but the *sequence* is fixed for that
   * tick — replays produce identical narration variants.
   */
  rng: () => number
}>

export type WorldEventTemplate = Readonly<{
  /** Stable id used in event ids and logs. */
  id: string
  type: WorldEventType
  scope: WorldEventScope
  /** How long the event stays active, in simulation ticks. */
  durationTicks: number
  narrate: (ctx: WorldEventContext) => LocalizedText
  buildPayload?: (ctx: WorldEventContext) => Readonly<Record<string, unknown>>
}>

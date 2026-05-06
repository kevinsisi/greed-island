// NPC profile schema. NPC behavior is data-driven from v1: each NPC
// is a JSON profile loaded at boot. Hard-coding NPC routines, names,
// or trigger logic in TypeScript is forbidden.
//
// The deterministic policy interpreter (added in a later task) reads
// these profiles + frozen WorldState(t-1) and emits NPCCommands. The
// interpreter contains no NPC-specific behavior — every NPC-specific
// fact lives in its profile.

export type NpcLocale = 'zh' | 'en'

export type NpcName = Readonly<Record<NpcLocale, string>>

/**
 * A daily routine slot. The NPC tries to be at `location` between
 * `fromTickOfDay` (inclusive) and `toTickOfDay` (exclusive). Times
 * are expressed as ticks-of-day (0..TICKS_PER_DAY-1) so the routine
 * is replayable independent of wall-clock.
 */
export type NpcRoutineSlot = Readonly<{
  fromTickOfDay: number
  toTickOfDay: number
  location: string
  /** Optional human-readable label for ops/admin tooling. */
  label?: string
}>

/** A trigger that fires when a deterministic predicate evaluates true. */
export type NpcTrigger = Readonly<{
  /** Stable identifier so emitted commands carry trigger provenance. */
  id: string
  /**
   * Predicate identifier. The interpreter maps this to a built-in
   * predicate function. Predicates are pure and deterministic:
   * - `relationshipBelow:<actorId>:<threshold>`
   * - `relationshipAbove:<actorId>:<threshold>`
   * - `idleTicksAbove:<count>`
   * - `cardOwned:<cardId>`
   * - `cardNotOwned:<cardId>`
   * - `nearLocation:<tileId>`
   * - `worldFactEquals:<factKey>:<jsonValue>`
   * - `rareWindowOpen:<windowId>`
   */
  when: string
  /**
   * Command type the NPC emits when `when` is satisfied. The Rule
   * Engine still validates and may reject the resulting command.
   */
  emitCommand: string
  /** Static payload merged into the emitted command. */
  payload?: Readonly<Record<string, unknown>>
}>

export type NpcMemoryReference = Readonly<{
  /**
   * Event types this NPC consults when forming memory of an actor.
   * Used by the policy interpreter to project per-actor history into
   * the NPC's decision context. Filtering is deterministic.
   */
  consultsEventTypes: readonly string[]
  /** Decay function name applied to relationship score per idle tick. */
  decayFn: 'linear' | 'exponential' | 'none'
  /** Decay parameter (slope or rate). Pure number, no IO. */
  decayParam: number
}>

export type NpcProfile = Readonly<{
  /** Stable id used as actor id in events and commands. */
  id: string
  name: NpcName
  /** Free-form role label used by UI; not consulted by the rule engine. */
  role: NpcName
  /** Default location id when no routine slot matches the current tick-of-day. */
  defaultLocation: string
  routine: readonly NpcRoutineSlot[]
  triggers: readonly NpcTrigger[]
  memory: NpcMemoryReference
  /**
   * Free-form personality knobs the policy interpreter may consult.
   * Keep numeric or string-enum to preserve canonical-JSON ordering.
   */
  personality: Readonly<Record<string, number | string>>
}>

export function assertValidProfile(profile: NpcProfile): void {
  if (!profile.id || typeof profile.id !== 'string') {
    throw new Error('NPC profile is missing an id.')
  }
  if (!profile.name?.zh || !profile.name?.en) {
    throw new Error(`NPC ${profile.id} is missing a bilingual name.`)
  }
  if (!profile.defaultLocation) {
    throw new Error(`NPC ${profile.id} is missing defaultLocation.`)
  }
  for (const slot of profile.routine) {
    if (
      slot.fromTickOfDay < 0 ||
      slot.toTickOfDay <= slot.fromTickOfDay
    ) {
      throw new Error(
        `NPC ${profile.id} has an invalid routine slot at ${slot.fromTickOfDay}..${slot.toTickOfDay}.`
      )
    }
  }
  const triggerIds = new Set<string>()
  for (const trigger of profile.triggers) {
    if (!trigger.id || !trigger.when || !trigger.emitCommand) {
      throw new Error(`NPC ${profile.id} has an incomplete trigger: ${JSON.stringify(trigger)}.`)
    }
    if (triggerIds.has(trigger.id)) {
      throw new Error(`NPC ${profile.id} has duplicate trigger id: ${trigger.id}.`)
    }
    triggerIds.add(trigger.id)
  }
  if (!['linear', 'exponential', 'none'].includes(profile.memory.decayFn)) {
    throw new Error(`NPC ${profile.id} has invalid memory.decayFn: ${profile.memory.decayFn}.`)
  }
  if (!Number.isFinite(profile.memory.decayParam)) {
    throw new Error(`NPC ${profile.id} has invalid memory.decayParam.`)
  }
}

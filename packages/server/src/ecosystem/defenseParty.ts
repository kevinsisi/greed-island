// Sprint 2C — npc-defense-coordination
//
// Pure deterministic planner for the "village rallies around a victim"
// mechanic. Given a recent ANIMAL_ATTACKED_NPC event, the surviving
// NPCs on the same tile form a coordinated hunting party that kills
// the attacker.
//
// Replay-safe: walks event history with hashSeed-derived party ids and
// lex-sorted member lists. Idempotent guard against double-firing on
// the same attackId.

import { hashSeed } from '../combat/commands.js'

export type DefensePartyAttackRow = Readonly<{
  attackId: string
  animalId: string
  speciesId: string
  tileId: string
  victimNpcId: string
  attackedAtTick: number
}>

export type DefensePartyAlivePredator = Readonly<{
  animalId: string
  speciesId: string
  tileId: string
}>

export type DefensePartyPlan = Readonly<{
  partyId: string
  reactionToAttackId: string
  targetAnimalId: string
  targetSpeciesId: string
  tileId: string
  victimNpcId: string
  /** Lex-sorted member NPC ids; first id is the party leader. */
  memberNpcIds: readonly string[]
  formedAtTick: number
}>

export type PlanDefensePartyInput = Readonly<{
  tick: number
  /** Recent ANIMAL_ATTACKED_NPC rows (one per qualifying event). */
  recentAttacks: readonly DefensePartyAttackRow[]
  /** Predators still alive in animal_population (animalId match). */
  alivePredators: readonly DefensePartyAlivePredator[]
  /** Outdoor NPC ids per tile (deterministic input from caller). */
  npcsByTile: ReadonlyMap<string, readonly string[]>
  /** Set of attackId values for which a party already formed. */
  priorPartyAttackIds: ReadonlySet<string>
  /** Minimum non-victim members required (default 2). */
  minMembers: number
}>

export function planDefenseParties(input: PlanDefensePartyInput): DefensePartyPlan[] {
  const plans: DefensePartyPlan[] = []
  const aliveById = new Map(input.alivePredators.map((p) => [p.animalId, p]))
  const handledAttackIds = new Set<string>([...input.priorPartyAttackIds])

  // Process attacks in deterministic order (oldest first, then by attackId).
  const sortedAttacks = [...input.recentAttacks].sort(
    (a, b) =>
      a.attackedAtTick - b.attackedAtTick ||
      a.attackId.localeCompare(b.attackId),
  )

  for (const attack of sortedAttacks) {
    if (handledAttackIds.has(attack.attackId)) continue
    const stillAlive = aliveById.get(attack.animalId)
    if (!stillAlive) continue
    if (stillAlive.tileId !== attack.tileId) continue

    const npcsOnTile = input.npcsByTile.get(attack.tileId) ?? []
    const members = npcsOnTile
      .filter((id) => id !== attack.victimNpcId)
      .slice()
      .sort((a, b) => a.localeCompare(b))
    if (members.length < input.minMembers) continue

    const partyId = `defense.${hashSeed(attack.attackId, input.tick, 'defense-party').toString(16)}`
    plans.push({
      partyId,
      reactionToAttackId: attack.attackId,
      targetAnimalId: attack.animalId,
      targetSpeciesId: attack.speciesId,
      tileId: attack.tileId,
      victimNpcId: attack.victimNpcId,
      memberNpcIds: members,
      formedAtTick: input.tick,
    })
    handledAttackIds.add(attack.attackId)
  }

  return plans
}

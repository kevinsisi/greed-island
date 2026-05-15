// Sprint 2B — animal-aggression
//
// Pure deterministic planners for two related mechanics:
//
//  1. Hungry-predator-attacks-NPC: when a predator would normally
//     starve (no eligible prey on its tile), but at least one NPC is
//     present on the same tile, the predator targets and attacks an
//     NPC instead. After a successful attack the predator may flee
//     to an adjacent ecosystem tile when species.fear is high.
//
//  2. Hunted-prey-retaliates: when an NPC initiates ANIMAL_HUNT_STARTED
//     against a species with non-zero aggression, the prey lands a
//     deterministic retaliation blow BEFORE the hunt resolves.
//
// Determinism: all RNG comes from hashSeed-derived integers; no
// wall-clock, no Math.random. Replays produce identical plans.

import { hashSeed } from '../combat/commands.js'
import type { Species } from './species.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'

export type AnimalDamageDelta = Readonly<{ mood: number; health: number }>

export type AnimalAggressionPlan = Readonly<{
  attackId: string
  predatorAnimalId: string
  predatorSpeciesId: string
  predatorActorId: string
  tileId: string
  targetNpcId: string
  damage: AnimalDamageDelta
  /** Adjacent tile id if the predator flees after attack, else null. */
  fleeRouteId: string | null
  fleeToTileId: string | null
}>

export type AnimalRetaliationPlan = Readonly<{
  retaliationId: string
  animalId: string
  speciesId: string
  hunterNpcId: string
  tileId: string
  damage: AnimalDamageDelta
}>

export type AggressionInput = Readonly<{
  tick: number
  /** Animal-population rows scoped to the predator's tile (matched
   * `species.category === 'predator'`). */
  predatorPopulation: readonly AnimalPopulationRow[]
  /** NPC ids currently on the tile (deterministic ordering by id). */
  npcsOnTile: readonly string[]
  /** Species lookup. */
  species: Species
  /** Adjacent tile ids from `MAP_ADJACENCY`. */
  adjacentTileIds: readonly string[]
}>

export type RetaliationInput = Readonly<{
  tick: number
  animalId: string
  speciesId: string
  tileId: string
  hunterNpcId: string
  species: Species
}>

/**
 * Default damage tuning. Kept small for v1 — the goal is to make the
 * world feel alive, not to one-shot NPCs.
 */
export const ANIMAL_ATTACK_DAMAGE_MOOD = 10
export const ANIMAL_ATTACK_DAMAGE_HEALTH = 10
export const ANIMAL_RETALIATION_DAMAGE_MOOD = 8
export const ANIMAL_RETALIATION_DAMAGE_HEALTH = 6

/**
 * Aggression-trigger threshold (0–99). `species.aggression` must be at
 * least this high to attack an NPC; using 1 keeps every aggressive
 * predator eligible while still allowing the planner to gate on
 * `aggression > 0` upstream.
 */
export const ANIMAL_AGGRESSION_THRESHOLD = 1

/**
 * Flee chance is `species.fear / 100`. The planner draws a value in
 * [0, 100) from `hashSeed(animalId, tileId, tick, 'flee-trigger')` and
 * flees when that value is less than `species.fear`.
 */
export function planAnimalAggression(input: AggressionInput): AnimalAggressionPlan | null {
  if (input.predatorPopulation.length === 0) return null
  if (input.npcsOnTile.length === 0) return null
  if (!input.species) return null
  if (input.species.aggression < ANIMAL_AGGRESSION_THRESHOLD) return null

  // Pick the predator with the most recent population row (lex on
  // animal id) to keep things deterministic. There is usually only one
  // row per (species, tile) so this is a degenerate sort, but it makes
  // the planner robust to future changes.
  const predatorRow = [...input.predatorPopulation]
    .filter((row) => row.count > 0)
    .sort((a, b) => a.tileId.localeCompare(b.tileId) || a.speciesId.localeCompare(b.speciesId))[0]
  if (!predatorRow) return null
  if (predatorRow.animalIds.length === 0) return null

  const predatorAnimalId = [...predatorRow.animalIds].sort((a, b) => a.localeCompare(b))[0]!
  const predatorActorId = `ecosystem.predator.${predatorRow.speciesId}`
  const tileId = predatorRow.tileId

  // Deterministic NPC selection.
  const sortedNpcs = [...input.npcsOnTile].sort((a, b) => a.localeCompare(b))
  const npcIdx = hashSeed(predatorAnimalId, tileId, input.tick, 'aggression-target-pick') % sortedNpcs.length
  const targetNpcId = sortedNpcs[npcIdx]!

  const attackId = `attack.${predatorAnimalId}.${tileId}.${input.tick}`

  // Flee roll
  const fearRoll = hashSeed(predatorAnimalId, tileId, input.tick, 'flee-trigger') % 100
  const willFlee = fearRoll < input.species.fear && input.adjacentTileIds.length > 0
  let fleeRouteId: string | null = null
  let fleeToTileId: string | null = null
  if (willFlee) {
    const adj = [...input.adjacentTileIds].sort((a, b) => a.localeCompare(b))
    const dirIdx = hashSeed(predatorAnimalId, tileId, input.tick, 'flee-dir') % adj.length
    fleeToTileId = adj[dirIdx]!
    fleeRouteId = `flee.${predatorAnimalId}.${tileId}.${fleeToTileId}.${input.tick}`
  }

  return {
    attackId,
    predatorAnimalId,
    predatorSpeciesId: predatorRow.speciesId,
    predatorActorId,
    tileId,
    targetNpcId,
    damage: { mood: -ANIMAL_ATTACK_DAMAGE_MOOD, health: -ANIMAL_ATTACK_DAMAGE_HEALTH },
    fleeRouteId,
    fleeToTileId,
  }
}

/**
 * Retaliation chance is `species.aggression / 100`. Roll is salted with
 * `'retaliation-trigger'` so the same hash cannot drive the aggression
 * planner and the retaliation planner together.
 */
export function planAnimalRetaliation(input: RetaliationInput): AnimalRetaliationPlan | null {
  if (!input.species) return null
  if (input.species.aggression < ANIMAL_AGGRESSION_THRESHOLD) return null
  const roll = hashSeed(input.animalId, input.tileId, input.tick, 'retaliation-trigger') % 100
  if (roll >= input.species.aggression) return null

  const retaliationId = `retaliation.${input.animalId}.${input.hunterNpcId}.${input.tick}`
  return {
    retaliationId,
    animalId: input.animalId,
    speciesId: input.speciesId,
    hunterNpcId: input.hunterNpcId,
    tileId: input.tileId,
    damage: { mood: -ANIMAL_RETALIATION_DAMAGE_MOOD, health: -ANIMAL_RETALIATION_DAMAGE_HEALTH },
  }
}

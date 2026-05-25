// IntentPlanner — pure functions that compute what an NPC intends to do next.
// No side effects: reads beliefs + profile, returns typed objects.
// The runtime calls these and applies results to NpcEngine.
//
// v0.51.0 NPC Intention Layer

import type { BeliefRow } from '../projections/beliefProjection.js'
import type { NpcProfile } from '../npcs/types.js'
import type { IntentKind } from '../kernel/livingWorldCommands.js'
import type { NpcRuntimeState } from '../sim/npcEngine.js'
import { MAP_ADJACENCY } from './mapGraph.js'
import { INTENT_URGENCY_THRESHOLD } from '../config/world.js'

export interface IntentEntry {
  kind: IntentKind
  urgency: number          // 0–100 (float)
  targetTile: string
  reason: string           // human-readable, e.g. "tile t_forest tile_safety=dangerous conf=85"
}

export interface IntentStack {
  npcId: string
  entries: IntentEntry[]   // sorted descending by urgency
  computedAtTick: number
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Returns val if it is a finite number, otherwise returns def. */
function numOrDefault(val: unknown, def: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : def
}

/**
 * Survival intent: fires when tile_safety 'dangerous' is believed about currentTile.
 * Target: first adjacent tile with no dangerous belief, fallback defaultLocation.
 */
function computeSurvivalIntent(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  currentTile: string,
  multiplier: number,
): IntentEntry | null {
  const trigger = beliefs.find(
    b => b.subject === 'tile_safety' && b.qualifier === currentTile && b.value === 'dangerous',
  )
  if (!trigger) return null

  const safetyWeight = numOrDefault(profile.personality?.safetyWeight, 1.0)
  const urgency = Math.min(100, trigger.confidence * safetyWeight * multiplier)

  const dangerousTiles = new Set(
    beliefs
      .filter(b => b.subject === 'tile_safety' && b.value === 'dangerous')
      .map(b => b.qualifier),
  )

  const adjacents = MAP_ADJACENCY[currentTile] ?? []
  const safeTile = adjacents.find(t => !dangerousTiles.has(t))

  // If all adjacents are dangerous (or no adjacents), use profile.defaultLocation.
  // Otherwise pick the first adjacent tile with no dangerous belief.
  const targetTile = safeTile ?? (profile.defaultLocation || currentTile)

  return {
    kind: 'survival',
    urgency,
    targetTile,
    reason: `tile ${currentTile} tile_safety=dangerous conf=${trigger.confidence}`,
  }
}

/**
 * Economic intent: fires when goods_scarcity 'scarce' belief exists (NPC perceives local scarcity).
 * In BeliefRow, goods_scarcity uses goodsId as qualifier (e.g. 'fish', 'meat', 'grain'),
 * not tileId. The belief is produced when the NPC is on or adjacent to a tile with GOODS_CONSUMED.
 * Target: first adjacent tile (any — moving away from scarcity zone), fallback defaultLocation.
 */
function computeEconomicIntent(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  currentTile: string,
  multiplier: number,
): IntentEntry | null {
  const trigger = beliefs.find(b => b.subject === 'goods_scarcity' && b.value === 'scarce')
  if (!trigger) return null

  const economyWeight = numOrDefault(profile.personality?.economyWeight, 0.7)
  const urgency = Math.min(100, trigger.confidence * economyWeight * multiplier)

  // Pick first adjacent tile as the economic target (moving away from scarcity)
  const adjacents = MAP_ADJACENCY[currentTile] ?? []
  const targetTile = adjacents[0] ?? (profile.defaultLocation || currentTile)

  return {
    kind: 'economic',
    urgency,
    targetTile,
    reason: `goods_scarcity=${trigger.qualifier} scarce conf=${trigger.confidence}`,
  }
}

/**
 * Social intent: fires when faction_control 'controlled' by enemy faction is believed on currentTile.
 * Enemy: b.factionId !== npcFaction (and factionId is defined).
 * If npcFaction is undefined/null: never fires.
 * Target: first adjacent tile with no enemy faction_control belief, fallback defaultLocation.
 */
function computeSocialIntent(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  currentTile: string,
  npcFaction: string | undefined,
  multiplier: number,
): IntentEntry | null {
  if (!npcFaction) return null

  const trigger = beliefs.find(
    b =>
      b.subject === 'faction_control' &&
      b.qualifier === currentTile &&
      b.value === 'controlled' &&
      b.factionId !== undefined &&
      b.factionId !== npcFaction,
  )
  if (!trigger) return null

  const factionLoyalty = numOrDefault(profile.personality?.factionLoyalty, 0.5)
  const urgency = Math.min(100, trigger.confidence * factionLoyalty * multiplier)

  // Enemy-controlled tiles by enemy factions
  const enemyControlledTiles = new Set(
    beliefs
      .filter(
        b =>
          b.subject === 'faction_control' &&
          b.value === 'controlled' &&
          b.factionId !== undefined &&
          b.factionId !== npcFaction,
      )
      .map(b => b.qualifier),
  )

  const adjacents = MAP_ADJACENCY[currentTile] ?? []
  const safeTile = adjacents.find(t => !enemyControlledTiles.has(t))
  const targetTile = safeTile ?? (profile.defaultLocation || currentTile)

  return {
    kind: 'social',
    urgency,
    targetTile,
    reason: `tile ${currentTile} faction_control=controlled factionId=${trigger.factionId} conf=${trigger.confidence}`,
  }
}

/**
 * Ecosystem intent: fires when ecosystem_health 'depleted' is believed on currentTile.
 * Target: first adjacent tile with no depleted ecosystem belief, fallback defaultLocation.
 */
function computeEcosystemIntent(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  currentTile: string,
  multiplier: number,
): IntentEntry | null {
  const trigger = beliefs.find(
    b => b.subject === 'ecosystem_health' && b.qualifier === currentTile && b.value === 'depleted',
  )
  if (!trigger) return null

  const urgency = Math.min(100, trigger.confidence * 0.4 * multiplier)

  const depletedTiles = new Set(
    beliefs
      .filter(b => b.subject === 'ecosystem_health' && b.value === 'depleted')
      .map(b => b.qualifier),
  )

  const adjacents = MAP_ADJACENCY[currentTile] ?? []
  const healthyTile = adjacents.find(t => !depletedTiles.has(t))
  const targetTile = healthyTile ?? (profile.defaultLocation || currentTile)

  return {
    kind: 'ecosystem',
    urgency,
    targetTile,
    reason: `tile ${currentTile} ecosystem_health=depleted conf=${trigger.confidence}`,
  }
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Computes a sorted intent stack for an NPC based on its beliefs, profile,
 * and past learning weights. Pure function — no side effects.
 */
export function computeIntentStack(
  npcId: string,
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  learningWeights: Readonly<Partial<Record<IntentKind, number>>>,
  currentTile: string,
  npcFaction: string | undefined,
  currentTick: number,
  memoryUrgencyBoost = 0,
): IntentStack {
  const entries: IntentEntry[] = []

  const survivalMultiplier = learningWeights.survival ?? 1.0
  const economicMultiplier = learningWeights.economic ?? 1.0
  const socialMultiplier = learningWeights.social ?? 1.0
  const ecosystemMultiplier = learningWeights.ecosystem ?? 1.0

  const survival = computeSurvivalIntent(beliefs, profile, currentTile, survivalMultiplier + memoryUrgencyBoost)
  if (survival) entries.push(survival)

  const economic = computeEconomicIntent(beliefs, profile, currentTile, economicMultiplier)
  if (economic) entries.push(economic)

  const social = computeSocialIntent(beliefs, profile, currentTile, npcFaction, socialMultiplier)
  if (social) entries.push(social)

  const ecosystem = computeEcosystemIntent(beliefs, profile, currentTile, ecosystemMultiplier)
  if (ecosystem) entries.push(ecosystem)

  // Sort descending by urgency
  entries.sort((a, b) => b.urgency - a.urgency)

  return { npcId, entries, computedAtTick: currentTick }
}

/**
 * Selects the highest-urgency intent from the stack.
 *
 * Returns null if:
 *   - stack.entries is empty
 *   - OR stack.entries[0].urgency <= threshold (strictly >)
 *
 * Overrides existing intentOverride only if:
 *   1. stack.entries[0].urgency > threshold AND
 *   2. currentOverride is null/undefined OR stack.entries[0].urgency > currentOverride.urgency * 1.5
 */
export function selectHighestIntent(
  stack: IntentStack,
  threshold: number,
  currentOverride: NpcRuntimeState['intentOverride'],
): IntentEntry | null {
  if (stack.entries.length === 0) return null

  const top = stack.entries[0]!
  if (top.urgency <= threshold) return null

  if (currentOverride == null) return top

  // Anti-thrash: new intent must be 1.5× more urgent than the existing override
  if (top.urgency > currentOverride.urgency * 1.5) return top

  return null
}

// Re-export threshold for callers that need it
export { INTENT_URGENCY_THRESHOLD }

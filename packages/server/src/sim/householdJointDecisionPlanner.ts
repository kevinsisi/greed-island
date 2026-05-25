// Household Joint Decision planner (v0.81.0).
//
// Scans all households with ≥2 living members co-located on the same tile.
// Emits a NPC_HOUSEHOLD_JOINT_DECISION social record when both criteria are met:
//   1. All living members share the same tileId (co-located)
//   2. Household balance is known (may be zero)
//
// decisionKind:
//   'invest_in_settlement' — household balance >= HOUSEHOLD_JOINT_DECISION_GOLD_THRESHOLD
//   'pool_resources'       — members are together with modest savings
//
// This is a social record event only (no gold movement). The event feeds both
// members' NPC memory at importance 5 to enrich future dialog.

import type { NpcLineageProjection } from '../projections/npcLineage.js'
import type { NpcMortalityProjection } from '../projections/npcMortality.js'
import type { HouseholdEconomyProjection } from '../projections/householdEconomy.js'
import { HOUSEHOLD_JOINT_DECISION_GOLD_THRESHOLD } from '../config/world.js'

export type HouseholdJointDecisionIntent = Readonly<{
  householdId: string
  memberNpcIds: readonly string[]
  tileId: string
  decisionKind: 'invest_in_settlement' | 'pool_resources'
  goldCommitted: number
}>

export function planHouseholdJointDecisions(input: {
  npcLineage: NpcLineageProjection
  npcMortality: NpcMortalityProjection
  householdEconomy: HouseholdEconomyProjection
  npcTileMap: ReadonlyMap<string, string>  // npcId → tileId
}): readonly HouseholdJointDecisionIntent[] {
  const { npcLineage, npcMortality, householdEconomy, npcTileMap } = input

  const intents: HouseholdJointDecisionIntent[] = []
  const seenHouseholds = new Set<string>()

  for (const [npcId] of npcTileMap) {
    const hId = npcLineage.householdId(npcId)
    if (seenHouseholds.has(hId)) continue
    seenHouseholds.add(hId)

    const livingMembers = npcLineage.livingMembersOf(hId, npcMortality)
    if (livingMembers.length < 2) continue

    const tiles = livingMembers.map((id) => npcTileMap.get(id)).filter(Boolean)
    if (tiles.length < 2) continue

    const sharedTile = tiles[0]!
    if (!tiles.every((t) => t === sharedTile)) continue

    const economy = householdEconomy.getByHouseholdId(hId)
    const balance = economy?.balance ?? 0
    const decisionKind: 'invest_in_settlement' | 'pool_resources' =
      balance >= HOUSEHOLD_JOINT_DECISION_GOLD_THRESHOLD ? 'invest_in_settlement' : 'pool_resources'
    const goldCommitted = decisionKind === 'invest_in_settlement' ? Math.floor(balance * 0.1) : 0

    intents.push({
      householdId: hId,
      memberNpcIds: livingMembers,
      tileId: sharedTile,
      decisionKind,
      goldCommitted,
    })
  }

  return intents
}

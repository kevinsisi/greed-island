// MaturationPlanner — promotes born children into runtime NPC entities.
//
// Reads:
//   - `LifeExpansionState.children` (childId → bornAtTick + householdId)
//   - `LifeExpansionState.households` (householdId → partnerNpcIds + homeTileId)
//   - `BornNpcsProjection.isMatured` (skip already-promoted children)
//   - `NpcMortalityProjection.isDeceased` (skip orphans where both parents are dead)
//
// Cadence-gated: only runs when `currentTick % MATURATION_CADENCE_TICKS === 0`.
//
// Emits `MaturationIntent[]` — runtime converts each to a `NPC_MATURED` Command.
//
// Spec: openspec/changes/born-npc-becomes-runtime-entity/specs/born-npc-maturation/spec.md

import type { LifeExpansionState } from './cityLife.js'
import type { BornNpcsProjection } from '../projections/bornNpcs.js'
import type { NpcMortalityProjection } from '../projections/npcMortality.js'
import { NPC_MATURATION_TICKS, MATURATION_CADENCE_TICKS } from '../config/world.js'

export type MaturationIntent = Readonly<{
  npcId: string
  bornAtTick: number
  householdId: string
  parentNpcIds: readonly string[]
  homeTileId: string
  nameZh: string
  nameEn: string
}>

export function planMaturation(input: {
  currentTick: number
  lifeExpansion: LifeExpansionState
  bornNpcsProjection: BornNpcsProjection
  mortalityProjection: NpcMortalityProjection
}): readonly MaturationIntent[] {
  const { currentTick, lifeExpansion, bornNpcsProjection, mortalityProjection } = input
  if (currentTick % MATURATION_CADENCE_TICKS !== 0) return []

  const intents: MaturationIntent[] = []
  for (const child of Object.values(lifeExpansion.children)) {
    // Skip if already matured.
    if (bornNpcsProjection.isMatured(child.childId)) continue
    // Skip if not yet old enough.
    if (currentTick - child.bornAtTick < NPC_MATURATION_TICKS) continue
    // Skip if both parents are deceased (orphan guard).
    const household = lifeExpansion.households[child.householdId]
    if (!household) continue
    const parentNpcIds = household.partnerNpcIds
    const anyParentAlive = parentNpcIds.some((id) => !mortalityProjection.isDeceased(id))
    if (!anyParentAlive) continue

    intents.push({
      npcId: child.childId,
      bornAtTick: child.bornAtTick,
      householdId: child.householdId,
      parentNpcIds,
      homeTileId: household.homeTileId,
      nameZh: child.nameZh,
      nameEn: child.nameEn,
    })
  }
  return intents
}

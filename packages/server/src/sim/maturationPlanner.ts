// MaturationPlanner — promotes born children into runtime NPC entities.
//
// Reads:
//   - `LifeExpansionState.children` (childId → bornAtTick + householdId)
//   - `LifeExpansionState.households` (householdId → partnerNpcIds + homeTileId)
//   - `BornNpcsProjection.isMatured` (skip already-promoted children)
//   - `NpcMortalityProjection` (kept in the input shape for inheritance/mortality integrations)
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
import { displayChildName } from '../data/npcChildNamePool.js'

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
  const { currentTick, lifeExpansion, bornNpcsProjection } = input
  if (currentTick % MATURATION_CADENCE_TICKS !== 0) return []

  const intents: MaturationIntent[] = []
  for (const child of Object.values(lifeExpansion.children)) {
    // Skip if already matured.
    if (bornNpcsProjection.isMatured(child.childId)) continue
    // Skip if not yet old enough.
    if (currentTick - child.bornAtTick < NPC_MATURATION_TICKS) continue
    // Children are already canonical EventLog entities once NPC_CHILD_BORN is
    // committed. They must still mature if their parents die before cadence.
    const household = lifeExpansion.households[child.householdId]
    if (!household) continue
    const parentNpcIds = household.partnerNpcIds
    const { nameZh, nameEn } = displayChildName({
      childId: child.childId,
      householdId: child.householdId,
      nameZh: child.nameZh,
      nameEn: child.nameEn,
    })

    intents.push({
      npcId: child.childId,
      bornAtTick: child.bornAtTick,
      householdId: child.householdId,
      parentNpcIds,
      homeTileId: household.homeTileId,
      nameZh,
      nameEn,
    })
  }
  return intents
}

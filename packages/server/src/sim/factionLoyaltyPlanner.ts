import type { FactionId } from './areaStateEngine.js'
import type { FactionSeizureIntent } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'

export type FactionLoyaltyShiftIntent = Readonly<{
  npcId: string
  tileId: string
  fromFaction: FactionId
  toFaction: FactionId
  tick: number
}>

export type FactionLoyaltyPlannerInput = Readonly<{
  seizureIntents: readonly FactionSeizureIntent[]
  npcStates: ReadonlyMap<string, NpcRuntimeState>
  npcFactionLean: ReadonlyMap<string, FactionId>
  tick: number
}>

export function planLoyaltyShifts(input: FactionLoyaltyPlannerInput): readonly FactionLoyaltyShiftIntent[] {
  const intents: FactionLoyaltyShiftIntent[] = []

  for (const seizure of input.seizureIntents) {
    if (seizure.factionId === 'civilian') continue

    for (const [npcId, state] of input.npcStates) {
      if (state.tile !== seizure.tileId) continue
      const currentLean = input.npcFactionLean.get(npcId) ?? 'civilian'
      if (currentLean === seizure.factionId) continue
      if (currentLean === 'civilian') continue

      intents.push({
        npcId,
        tileId: seizure.tileId,
        fromFaction: currentLean,
        toFaction: seizure.factionId,
        tick: input.tick,
      })
    }
  }

  return intents
}

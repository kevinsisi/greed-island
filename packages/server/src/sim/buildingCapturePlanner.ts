import type { FactionControlProjection } from '../projections/factionControl.js'

export type BuildingCaptureInput = Readonly<{
  buildingId: string
  tileId: string
  controllingFactionId: string | null
}>

export type BuildingCaptureIntent = Readonly<{
  buildingId: string
  tileId: string
  capturingFactionId: string
  previousFactionId: string | null
}>

export function planBuildingCaptures(input: {
  buildings: readonly BuildingCaptureInput[]
  factionControlProjection: FactionControlProjection
}): readonly BuildingCaptureIntent[] {
  const intents: BuildingCaptureIntent[] = []
  for (const b of input.buildings) {
    const dominant = input.factionControlProjection.dominantFactionOf(b.tileId)
    if (!dominant) continue
    if (dominant === b.controllingFactionId) continue
    intents.push({
      buildingId: b.buildingId,
      tileId: b.tileId,
      capturingFactionId: dominant,
      previousFactionId: b.controllingFactionId,
    })
  }
  return intents
}

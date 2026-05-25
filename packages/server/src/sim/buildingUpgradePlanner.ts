export type BuildingUpgradeInput = Readonly<{
  buildingId: string
  tileId: string
  state: string
  upgradeLevel: number
  lastActivityTick: number
}>

export type BuildingUpgradeIntent = Readonly<{
  buildingId: string
  tileId: string
  fromLevel: number
  toLevel: number
}>

export function planBuildingUpgrades(input: {
  buildings: readonly BuildingUpgradeInput[]
  currentTick: number
  minAgeTicks: number
  maxLevel: number
}): readonly BuildingUpgradeIntent[] {
  const intents: BuildingUpgradeIntent[] = []
  for (const b of input.buildings) {
    if (b.state !== 'operational') continue
    if (b.upgradeLevel >= input.maxLevel) continue
    const age = input.currentTick - b.lastActivityTick
    if (age < input.minAgeTicks) continue
    intents.push({ buildingId: b.buildingId, tileId: b.tileId, fromLevel: b.upgradeLevel, toLevel: b.upgradeLevel + 1 })
  }
  return intents
}

export type SlaughterGoods = Readonly<{ goodsId: string; amount: number }>

export type SlaughterIntent = Readonly<{
  type: 'LIVESTOCK_SLAUGHTERED'
  animalId: string
  settlementId: string
  speciesId: string
  goods: readonly SlaughterGoods[]
  tick: number
}>

export type SlaughterAnimalRow = Readonly<{
  animalId: string
  speciesId: string
  acquiredAtTick: number
}>

export type SlaughterInput = Readonly<{
  tick: number
  settlementId: string
  livestock: readonly SlaughterAnimalRow[]
  ranchCapacity: number
  byproducts: readonly string[]
  edibleYield: number
}>

export function planSlaughter(input: SlaughterInput): SlaughterIntent | null {
  const { tick, settlementId, livestock, ranchCapacity, byproducts, edibleYield } = input

  if (livestock.length <= ranchCapacity) return null

  const oldest = [...livestock].sort(
    (a, b) => a.acquiredAtTick - b.acquiredAtTick || a.animalId.localeCompare(b.animalId)
  )[0]!

  const goods: SlaughterGoods[] = []
  if (edibleYield > 0) {
    goods.push({ goodsId: 'meat', amount: edibleYield })
  }
  for (const bp of byproducts) {
    goods.push({ goodsId: bp, amount: 1 })
  }

  return {
    type: 'LIVESTOCK_SLAUGHTERED',
    animalId: oldest.animalId,
    settlementId,
    speciesId: oldest.speciesId,
    goods,
    tick,
  }
}

import { describe, expect, it } from 'vitest'
import { planSlaughter } from './slaughterPlanner.js'

const BASE = {
  tick: 100,
  settlementId: 's1',
  ranchCapacity: 2,
  byproducts: ['milk', 'hide'],
  edibleYield: 6,
}

function animal(id: string, acquiredAtTick: number) {
  return { animalId: id, speciesId: 'marsh_yak', acquiredAtTick }
}

describe('planSlaughter', () => {
  it('returns null when within capacity', () => {
    expect(planSlaughter({ ...BASE, livestock: [animal('a1', 1), animal('a2', 2)] })).toBeNull()
  })

  it('slaughters oldest when over capacity', () => {
    const result = planSlaughter({
      ...BASE,
      livestock: [animal('a1', 5), animal('a2', 2), animal('a3', 10)],
    })
    expect(result).not.toBeNull()
    expect(result!.animalId).toBe('a2')
    expect(result!.type).toBe('LIVESTOCK_SLAUGHTERED')
    expect(result!.settlementId).toBe('s1')
  })

  it('includes meat and byproduct goods', () => {
    const result = planSlaughter({
      ...BASE,
      livestock: [animal('a1', 1), animal('a2', 2), animal('a3', 3)],
    })
    expect(result!.goods.find((g) => g.goodsId === 'meat')?.amount).toBe(6)
    expect(result!.goods.find((g) => g.goodsId === 'milk')).toBeTruthy()
    expect(result!.goods.find((g) => g.goodsId === 'hide')).toBeTruthy()
  })

  it('uses stable sort for ties — picks alphabetically first id', () => {
    const result = planSlaughter({
      ...BASE,
      livestock: [animal('b1', 1), animal('a1', 1), animal('c1', 2)],
    })
    expect(result!.animalId).toBe('a1')
  })
})

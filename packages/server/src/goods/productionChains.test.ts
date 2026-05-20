import { describe, expect, it } from 'vitest'
import { listProductionRecipes, planGoodsProduction } from './productionChains.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

describe('production chains', () => {
  it('exposes the deterministic salt refining recipe', () => {
    expect(listProductionRecipes()).toContainEqual({
      recipeId: 'recipe.brine_to_refined_salt',
      inputGoodsId: 'brine',
      inputQuantity: 10,
      outputGoodsId: 'refined_salt',
      outputQuantity: 4,
      holderType: 'settlement',
      holderId: 'settlement.t_central',
      tileId: 't_central',
    })
  })

  it('plans production only when input inventory is available', () => {
    expect(planGoodsProduction({ inventory: [], plannedRecipeIds: new Set() })).toEqual([])
    expect(planGoodsProduction({ inventory: [inventoryRow(10)], plannedRecipeIds: new Set() })).toHaveLength(1)
    expect(planGoodsProduction({ inventory: [inventoryRow(9)], plannedRecipeIds: new Set() })).toEqual([])
  })
})

function inventoryRow(quantity: number): GoodsInventoryRow {
  return {
    goodsId: 'brine',
    holderType: 'settlement',
    holderId: 'settlement.t_central',
    tileId: 't_central',
    quantity,
    lastUpdatedTick: 1,
    lastSequence: 1,
  }
}

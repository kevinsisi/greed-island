import type { GoodsHolderType } from '../kernel/livingWorldCommands.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

export type ProductionRecipe = Readonly<{
  recipeId: string
  inputGoodsId: string
  inputQuantity: number
  outputGoodsId: string
  outputQuantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
}>

export type PlannedProduction = Readonly<{
  recipe: ProductionRecipe
}>

export const SALT_REFINING_RECIPE: ProductionRecipe = Object.freeze({
  recipeId: 'recipe.brine_to_refined_salt',
  inputGoodsId: 'brine',
  inputQuantity: 10,
  outputGoodsId: 'refined_salt',
  outputQuantity: 4,
  holderType: 'settlement',
  holderId: 'settlement.t_central',
  tileId: 't_central',
})

const PRODUCTION_RECIPES: readonly ProductionRecipe[] = Object.freeze([
  SALT_REFINING_RECIPE,
])

export function listProductionRecipes(): readonly ProductionRecipe[] {
  return PRODUCTION_RECIPES
}

export function planGoodsProduction(input: {
  inventory: readonly GoodsInventoryRow[]
  plannedRecipeIds: ReadonlySet<string>
}): PlannedProduction[] {
  const planned: PlannedProduction[] = []
  for (const recipe of PRODUCTION_RECIPES) {
    if (input.plannedRecipeIds.has(recipe.recipeId)) continue
    const row = input.inventory.find(
      (item) =>
        item.goodsId === recipe.inputGoodsId &&
        item.holderType === recipe.holderType &&
        item.holderId === recipe.holderId &&
        item.quantity >= recipe.inputQuantity
    )
    if (!row) continue
    planned.push({ recipe })
  }
  return planned
}

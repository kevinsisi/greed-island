export type GoodsTier = 'raw' | 'processed' | 'manufactured'
export type GoodsUnit = 'piece' | 'kg' | 'bundle'

export type GoodsSpecies = Readonly<{
  goodsId: string
  nameZh: string
  unit: GoodsUnit
  tier: GoodsTier
}>

const GOODS_CATALOG: readonly GoodsSpecies[] = Object.freeze([
  Object.freeze({ goodsId: 'meat',         nameZh: '肉',    unit: 'piece',  tier: 'raw' }        as GoodsSpecies),
  Object.freeze({ goodsId: 'fish',         nameZh: '魚',    unit: 'piece',  tier: 'raw' }        as GoodsSpecies),
  Object.freeze({ goodsId: 'brine',        nameZh: '鹽水',  unit: 'kg',     tier: 'raw' }        as GoodsSpecies),
  Object.freeze({ goodsId: 'lumber',       nameZh: '木材',  unit: 'bundle', tier: 'raw' }        as GoodsSpecies),
  Object.freeze({ goodsId: 'ore',          nameZh: '礦石',  unit: 'kg',     tier: 'raw' }        as GoodsSpecies),
  Object.freeze({ goodsId: 'grain',        nameZh: '穀物',  unit: 'kg',     tier: 'raw' }        as GoodsSpecies),
  Object.freeze({ goodsId: 'refined_salt', nameZh: '精鹽',  unit: 'kg',     tier: 'processed' }  as GoodsSpecies),
  Object.freeze({ goodsId: 'iron_ingot',   nameZh: '鐵錠',  unit: 'piece',  tier: 'processed' }  as GoodsSpecies),
  Object.freeze({ goodsId: 'bread',        nameZh: '麵包',  unit: 'piece',  tier: 'manufactured' } as GoodsSpecies),
  Object.freeze({ goodsId: 'tools',        nameZh: '工具',  unit: 'piece',  tier: 'manufactured' } as GoodsSpecies),
])

const CATALOG_BY_ID = new Map<string, GoodsSpecies>(GOODS_CATALOG.map((g) => [g.goodsId, g]))

export function listGoodsSpecies(): readonly GoodsSpecies[] {
  return GOODS_CATALOG
}

export function getGoodsSpecies(goodsId: string): GoodsSpecies | undefined {
  return CATALOG_BY_ID.get(goodsId)
}

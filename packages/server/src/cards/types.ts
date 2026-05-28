// Card catalog schema. Each entry is deterministic, replayable data.
// AI MUST NOT mutate catalog entries at runtime; AI may only narrate
// discovery moments using existing catalog fields.
//
// v0.15.0 redesign — "Greed Island canon" rebalance:
//   * Rank set 收斂為 S / A / B / C / D（5 階）。SS/E/F/G/H 移除：
//     - SS 過於極端，跟 S 區分不明；S 即為「殿堂級」
//     - E~H 之前是垃圾階；現在改成所有定序卡都有設計意義，最低階 D 仍稀有
//   * 每張卡屬於 10 大類別（潮源系 / 食飲系 / 技藝系 / 地景系 / 潮器系 /
//     生靈系 / 契約系 / 秘聞系 / 潮術系 / 深淵系），對應獵人貪婪之島的
//     世界觀分類，影響掉落區、AI 旁白風格、紋典 UI 分組。
//   * 新增 acquisitionMethod：玩家取得卡的「正典」途徑（任務 / 戰鬥勝利 /
//     好感度上限 / 商店購買 / 探索觸發 / 解謎 / 隨機掉落）。隨機掉落保留
//     給 D 階低稀有卡 + 部分 C 階；高階卡（S/A/B）必須走任務 / 戰鬥 /
//     深度互動。
//   * maxCopies：跨整個世界的同卡上限（取代舊的 RANK_EXISTENCE_CAP；
//     由 catalog 直接宣告，不再從 rank 推）。
//   * effectDescription：人類讀的效果描述。實作 hook 留 Phase C。
//
// 術式卡（technique cards）走獨立檔（techniques.json + techniques.ts），
// 不在 100 張定序卡裡，不會隨機掉，只能在天際百貨（霓港區）購買。

export type CardRuleOperatorScope = 'goods' | 'tile' | 'global'

export type CardRuleOperatorEffectKind = 'multiply_price' | 'multiply_production'

/** Phase 4 — defines how a card modifies living-world rule evaluation for a bounded scope. */
export type CardRuleOperatorDef = Readonly<{
  /** What domain this operator targets. */
  scope: CardRuleOperatorScope
  /** The specific target id (goodsId for 'goods', tileId for 'tile', '*' for 'global'). */
  scopeId: string
  /** What the operator does to the target. */
  effectKind: CardRuleOperatorEffectKind
  /** Multiplicative factor. E.g. 0.7 = −30% price, 1.5 = +50% production. */
  effectValue: number
  /** How long the operator stays active (in simulation ticks). */
  durationTicks: number
  /** Which actor types are permitted to invoke this card as a world rule operator. */
  permittedInvokers: readonly ('player' | 'npc' | 'faction')[]
}>

export type CardRank = 'S' | 'A' | 'B' | 'C' | 'D'

export const CARD_RANKS: readonly CardRank[] = ['S', 'A', 'B', 'C', 'D']

export type CardCategory =
  | '潮源系'
  | '食飲系'
  | '技藝系'
  | '地景系'
  | '潮器系'
  | '生靈系'
  | '契約系'
  | '秘聞系'
  | '潮術系'
  | '深淵系'

export const CARD_CATEGORIES: readonly CardCategory[] = [
  '潮源系',
  '食飲系',
  '技藝系',
  '地景系',
  '潮器系',
  '生靈系',
  '契約系',
  '秘聞系',
  '潮術系',
  '深淵系',
]

/**
 * 玩家取得這張卡的正典途徑。掉率引擎只會把 'random_drop' 的卡放進池子裡，
 * 其它路徑由各自的 system / 任務 / 商店 / 戰鬥 endpoint 觸發。
 */
export type CardAcquisitionMethod =
  | 'main_quest' // 主線任務
  | 'side_quest' // NPC 支線
  | 'affinity_bond' // 跟特定 NPC 好感度到「羈絆」階段
  | 'combat_victory' // 戰鬥擊敗指定 NPC / 區域 BOSS
  | 'shop_purchase' // 商店購買（潮幣）
  | 'location_trigger' // 到達特定地點 + 條件
  | 'puzzle_solve' // 解謎 / 收集線索
  | 'random_drop' // 隨機掉落（僅 D / 部分 C 階開放）

export const CARD_ACQUISITION_METHODS: readonly CardAcquisitionMethod[] = [
  'main_quest',
  'side_quest',
  'affinity_bond',
  'combat_victory',
  'shop_purchase',
  'location_trigger',
  'puzzle_solve',
  'random_drop',
]

export type CardCatalogEntry = Readonly<{
  /** 1-100 inclusive. Stable across catalog versions. */
  id: number
  /** Card rank — drives spawn rarity and existence cap. */
  rank: CardRank
  /** 10 大分類之一。 */
  category: CardCategory
  /** Traditional Chinese name. */
  nameZh: string
  /** English name. */
  nameEn: string
  /** Short description used by UI tooltips and narration prompts. */
  description: string
  /** Long-form lore used by the discovery-detail surface. */
  story: string
  /** 同時存世的最大份數（取代 rank-derived cap）。 */
  maxCopies: number
  /** 取得方式 enum。 */
  acquisitionMethod: CardAcquisitionMethod
  /** 取得方式的人類可讀說明（給玩家看，譬如「擊敗潮聲區秘語者後掉落」）。 */
  acquisitionDetail: string
  /** 卡的效果描述（戰鬥 / 探索 / 社交）。Phase C 才接實際 mechanic。 */
  effectDescription: string
  /** Identifier of the discovery rule that can mint this card. */
  discoveryRuleId: string
  /** Identifier of the restriction rule (anti-duplication, anti-trade, etc.). */
  restrictionRuleId: string
  /** Optional card art image URL. Populated at runtime from dataDir/card-images/. */
  imageUrl?: string
  /**
   * Phase 4 — optional world rule operator definition.
   * When set, playing this card via PLAYER_PLAYED_CARD emits
   * CARD_RULE_OPERATOR_ACTIVATED and modifies simulation rule evaluation
   * for `durationTicks`.
   */
  ruleOperator?: CardRuleOperatorDef
}>

export type CardCatalog = Readonly<{
  version: string
  entries: readonly CardCatalogEntry[]
}>

export const CARD_CATALOG_TOTAL = 100

/** 各 category 對應的固定 id 範圍。固定範圍才能讓 acquisitionMethod 預期化。 */
export const CATEGORY_ID_RANGES: ReadonlyArray<
  Readonly<{ category: CardCategory; from: number; to: number }>
> = [
  { category: '潮源系', from: 1, to: 10 },
  { category: '食飲系', from: 11, to: 20 },
  { category: '技藝系', from: 21, to: 30 },
  { category: '地景系', from: 31, to: 40 },
  { category: '潮器系', from: 41, to: 50 },
  { category: '生靈系', from: 51, to: 60 },
  { category: '契約系', from: 61, to: 70 },
  { category: '秘聞系', from: 71, to: 80 },
  { category: '潮術系', from: 81, to: 90 },
  { category: '深淵系', from: 91, to: 100 },
]

export function categoryForId(id: number): CardCategory {
  for (const r of CATEGORY_ID_RANGES) if (id >= r.from && id <= r.to) return r.category
  throw new Error(`Card id ${id} is outside any known category range.`)
}

export function assertValidCatalog(catalog: CardCatalog): void {
  if (catalog.entries.length !== CARD_CATALOG_TOTAL) {
    throw new Error(
      `Card catalog must contain exactly ${CARD_CATALOG_TOTAL} entries, got ${catalog.entries.length}.`
    )
  }
  const seenIds = new Set<number>()
  for (const entry of catalog.entries) {
    if (!Number.isInteger(entry.id) || entry.id < 1 || entry.id > CARD_CATALOG_TOTAL) {
      throw new Error(`Invalid card id: ${entry.id} (must be 1..${CARD_CATALOG_TOTAL}).`)
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate card id in catalog: ${entry.id}.`)
    }
    seenIds.add(entry.id)
    if (!CARD_RANKS.includes(entry.rank)) {
      throw new Error(`Invalid rank for card ${entry.id}: ${entry.rank}.`)
    }
    if (!CARD_CATEGORIES.includes(entry.category)) {
      throw new Error(`Invalid category for card ${entry.id}: ${entry.category}.`)
    }
    const expectedCategory = categoryForId(entry.id)
    if (entry.category !== expectedCategory) {
      throw new Error(
        `Card ${entry.id} category mismatch: declared ${entry.category}, expected ${expectedCategory} by id range.`
      )
    }
    if (!entry.nameZh || !entry.nameEn) {
      throw new Error(`Card ${entry.id} is missing a name (zh or en).`)
    }
    if (!Number.isInteger(entry.maxCopies) || entry.maxCopies < 1 || entry.maxCopies > 100) {
      throw new Error(`Card ${entry.id} has invalid maxCopies: ${entry.maxCopies}.`)
    }
    if (!CARD_ACQUISITION_METHODS.includes(entry.acquisitionMethod)) {
      throw new Error(
        `Card ${entry.id} has invalid acquisitionMethod: ${entry.acquisitionMethod}.`
      )
    }
    if (!entry.acquisitionDetail || entry.acquisitionDetail.length === 0) {
      throw new Error(`Card ${entry.id} is missing acquisitionDetail.`)
    }
    if (!entry.effectDescription || entry.effectDescription.length === 0) {
      throw new Error(`Card ${entry.id} is missing effectDescription.`)
    }
    if (!entry.discoveryRuleId || !entry.restrictionRuleId) {
      throw new Error(`Card ${entry.id} is missing discovery or restriction rule reference.`)
    }
  }
}

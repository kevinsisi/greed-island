// Card catalog schema. Each entry is deterministic, replayable data.
// AI MUST NOT mutate catalog entries at runtime; AI may only narrate
// discovery moments using existing catalog fields.
//
// The runtime card catalog is loaded from `catalog.json` (sibling
// file). The JSON file is the editable source of truth — the project
// owner can fill in canon names and descriptions without touching
// code.

export type CardRank = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

export const CARD_RANKS: readonly CardRank[] = ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export type CardCatalogEntry = Readonly<{
  /** 1-100 inclusive. Stable across catalog versions. */
  id: number
  /** Card rank — drives spawn rarity and restriction tiers. */
  rank: CardRank
  /** Traditional Chinese name. */
  nameZh: string
  /** English name. */
  nameEn: string
  /** Short description used by UI tooltips and narration prompts. */
  description: string
  /** Long-form lore used by the discovery-detail surface. */
  story: string
  /** Identifier of the discovery rule that can mint this card. */
  discoveryRuleId: string
  /** Identifier of the restriction rule (anti-duplication, anti-trade, etc.). */
  restrictionRuleId: string
}>

export type CardCatalog = Readonly<{
  version: string
  entries: readonly CardCatalogEntry[]
}>

export const CARD_CATALOG_TOTAL = 100

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
    if (!entry.nameZh || !entry.nameEn) {
      throw new Error(`Card ${entry.id} is missing a name (zh or en).`)
    }
    if (!entry.discoveryRuleId || !entry.restrictionRuleId) {
      throw new Error(`Card ${entry.id} is missing discovery or restriction rule reference.`)
    }
  }
}

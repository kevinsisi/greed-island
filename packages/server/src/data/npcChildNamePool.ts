// Bilingual name pool for autonomously-born NPCs.
//
// Adding entries is safe: prefer APPEND-ONLY to preserve replay determinism for
// already-generated names. Changing the ORDER of existing entries will break
// determinism for worlds that have already hashed children to specific
// indices, so don't reorder — only append.
//
// All names follow 潮鳴市 (Tideway/Greed Island) lore conventions:
//   - Chinese names are 2 or 3 characters with sea/tide/island/mist motifs
//   - English names are evocative single words or short compounds
//
// Used by `generateChildName` in this file; called from runtime.ts's
// planHouseholdCommands instead of the hardcoded 「潮生 / Tideborn」 fallback.

import { hashSeed } from '../combat/commands.js'

export type ChildName = Readonly<{ nameZh: string; nameEn: string }>

export const NPC_CHILD_NAME_POOL: readonly ChildName[] = [
  { nameZh: '潮生', nameEn: 'Tideborn' },
  { nameZh: '潮安', nameEn: 'Tideanne' },
  { nameZh: '潮明', nameEn: 'Tidelight' },
  { nameZh: '潮影', nameEn: 'Tideshade' },
  { nameZh: '海映', nameEn: 'Seamirror' },
  { nameZh: '海平', nameEn: 'Seaplain' },
  { nameZh: '海石', nameEn: 'Seastone' },
  { nameZh: '霧聲', nameEn: 'Mistecho' },
  { nameZh: '霧瀾', nameEn: 'Mistwave' },
  { nameZh: '霧川', nameEn: 'Mistrun' },
  { nameZh: '汐月', nameEn: 'Ebbmoon' },
  { nameZh: '汐丹', nameEn: 'Ebbsienna' },
  { nameZh: '汐安', nameEn: 'Ebbsworn' },
  { nameZh: '苔青', nameEn: 'Mossward' },
  { nameZh: '苔靜', nameEn: 'Mossquiet' },
  { nameZh: '蘆白', nameEn: 'Reedmoon' },
  { nameZh: '蘆煙', nameEn: 'Reedsmoke' },
  { nameZh: '鹽明', nameEn: 'Saltgleam' },
  { nameZh: '鹽溪', nameEn: 'Saltbrook' },
  { nameZh: '鹽柔', nameEn: 'Saltgentle' },
  { nameZh: '燼安', nameEn: 'Emberstill' },
  { nameZh: '燼華', nameEn: 'Emberglow' },
  { nameZh: '燼朗', nameEn: 'Emberbright' },
  { nameZh: '燈明', nameEn: 'Lampbright' },
  { nameZh: '燈影', nameEn: 'Lampshade' },
  { nameZh: '燈渡', nameEn: 'Lampferry' },
  { nameZh: '岸臨', nameEn: 'Shorewend' },
  { nameZh: '岸隅', nameEn: 'Shorenook' },
  { nameZh: '岩聰', nameEn: 'Stoneclever' },
  { nameZh: '岩望', nameEn: 'Stonewatch' },
  { nameZh: '雨絮', nameEn: 'Rainmoth' },
  { nameZh: '雨弦', nameEn: 'Rainstring' },
  { nameZh: '雲簾', nameEn: 'Cloudveil' },
  { nameZh: '雲漪', nameEn: 'Cloudripple' },
  { nameZh: '星渡', nameEn: 'Starferry' },
  { nameZh: '星沉', nameEn: 'Stardown' },
] as const

/**
 * Deterministic bilingual name generation for a born child.
 * Same `childId` always yields the same `{ nameZh, nameEn }`.
 *
 * Selection: `hashSeed(childId, 'name') % NPC_CHILD_NAME_POOL.length`.
 *
 * @param childId  Stable identifier of the child (e.g., `household.alice.bob.child.1`)
 * @param householdId  Household id (mixed into hash for additional variety; same id
 *                     across siblings would otherwise produce the same name)
 */
export function generateChildName(childId: string, householdId: string): ChildName {
  const idx = hashSeed(childId, 'name', householdId) % NPC_CHILD_NAME_POOL.length
  return NPC_CHILD_NAME_POOL[idx]!
}

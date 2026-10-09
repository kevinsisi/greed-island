/**
 * Exact existing hand-authored Temple/SaltMarsh masks promoted to server collision authority.
 * Source: packages/web/src/game/terrainMask.ts RAW_MASKS at repository commit
 * 1b15f311b881fd4f4404ba37942191a105449c24. No invented terrain or new region.
 * L land, P pier, S shore, s shallow walkable water, . blocked open water.
 * Dock retains its reviewed existing harbor-3d collision instead of this grid.
 */
const WATER_MASKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  t_temple: Object.freeze([
    'LLLLLLLLLLLSss.', 'LLLLLLLLLLLSss.', 'LLLLLLLLLLLSss.', 'LLLLLLLLLLPPss.', 'LLLLLLLLLLPPss.',
    'LLLLLLLLLLLSss.', 'LLLLLLLLLLLSss.', 'LLLLLLLLLLLSss.', 'LLLLLLLLLLLSss.', 'LLLLLLLLLLLSs..',
  ]),
  t_salt_marsh: Object.freeze([
    'LLLLLLSSssssss.', 'LLLLLLSSSsssss.', 'LLLLLLSSSsss...', 'LLLLLLSSss.....', 'LLLLLLLLLLSss..',
    'LLLLLLLLLLSss..', 'LLLLLLSSss.....', 'LLLLLLSSSsss...', 'LLLLLLSSSsssss.', 'LLLLLLSSssssss.',
  ]),
})
export function getAuthoredWaterTerrainMask(tileId: string): readonly string[] {
  return Object.freeze([...(WATER_MASKS[tileId] ?? [])])
}

// 潮鳴市八方街區 + adjacency graph。
// MAP_TILES 定義：每格的座標、生態、顯示名稱。
// MAP_ADJACENCY 定義：哪些 tile 4-連通可步行抵達。
// NPC engine 用 BFS over MAP_ADJACENCY 來決定下一步要踏哪一格，
// 確保 tile-by-tile 移動而非瞬移。

export type MapTileDef = Readonly<{
  id: string
  name: string
  x: number
  y: number
  biome: string
}>

export const MAP_TILES: ReadonlyArray<MapTileDef> = [
  { id: 't_desert', name: '潮聲區', x: 0, y: 4, biome: 'desert' },
  { id: 't_forest', name: '潮見丘', x: 1, y: 1, biome: 'forest' },
  { id: 't_mountain', name: '煙嵐山', x: 4, y: 0, biome: 'mountain' },
  { id: 't_temple', name: '霓港區', x: 7, y: 1, biome: 'water' },
  { id: 't_central', name: '夜潮區', x: 4, y: 3, biome: 'grass' },
  { id: 't_ruin', name: '鏽灣區', x: 7, y: 4, biome: 'ruin' },
  { id: 't_dock', name: '碼頭區', x: 3, y: 5, biome: 'water' },
  { id: 't_dimai', name: '地脈層', x: 4, y: 2, biome: 'ruin' }
]

export const EXPANSION_TILES: ReadonlyArray<MapTileDef> = [
  { id: 't_salt_marsh', name: '鹽沼外環', x: 8, y: 5, biome: 'water' }
]

const ALL_KNOWN_TILES: ReadonlyArray<MapTileDef> = [...MAP_TILES, ...EXPANSION_TILES]

export const TILE_BY_ID: Readonly<Record<string, MapTileDef>> = ALL_KNOWN_TILES.reduce(
  (acc, tile) => {
    acc[tile.id] = tile
    return acc
  },
  {} as Record<string, MapTileDef>
)

export const TILE_NAME_BY_ID: Readonly<Record<string, string>> = ALL_KNOWN_TILES.reduce(
  (acc, tile) => {
    acc[tile.id] = tile.name
    return acc
  },
  {} as Record<string, string>
)

// 8 個 tile 的真實座標非規則格子，無法用 Manhattan 1 = 相鄰。改以
// 地理直覺 + 玩家移動距離寫死成圖：每格只跟「自然走得到」的鄰居連接。
export const MAP_ADJACENCY: Readonly<Record<string, readonly string[]>> = {
  t_desert: ['t_forest', 't_dock'],
  t_forest: ['t_desert', 't_mountain', 't_central'],
  t_mountain: ['t_forest', 't_dimai', 't_temple'],
  t_temple: ['t_mountain', 't_ruin', 't_dimai'],
  t_central: ['t_forest', 't_dimai', 't_dock', 't_ruin'],
  t_dimai: ['t_central', 't_mountain', 't_temple'],
  t_dock: ['t_desert', 't_central', 't_ruin'],
  t_ruin: ['t_temple', 't_central', 't_dock']
}

export const EXPANSION_ADJACENCY: Readonly<Record<string, readonly string[]>> = {
  t_salt_marsh: ['t_dock', 't_ruin']
}

// Frontier zones: coordinate slots NOT in MAP_TILES or EXPANSION_TILES.
// These tiles are created at runtime by TILE_GENERATED events when
// civilization expands beyond the starting territory.
export type FrontierZoneDef = MapTileDef & { readonly adjacentTo: readonly string[] }

export const FRONTIER_ZONES: ReadonlyArray<FrontierZoneDef> = [
  { id: 't_frontier_badlands', name: '荒土地帶', x: 9, y: 3, biome: 'ruin', adjacentTo: ['t_ruin', 't_salt_marsh'] },
  { id: 't_frontier_highland', name: '高地山脊', x: 2, y: -1, biome: 'mountain', adjacentTo: ['t_forest', 't_mountain'] },
  { id: 't_frontier_cove', name: '隱蔽海灣', x: 1, y: 6, biome: 'water', adjacentTo: ['t_desert', 't_dock'] },
]

export function listMapTiles(
  unlockedTileIds: readonly string[] = [],
  generatedTileIds: readonly string[] = []
): ReadonlyArray<MapTileDef> {
  const unlocked = new Set(unlockedTileIds)
  const generated = new Set(generatedTileIds)
  return [
    ...MAP_TILES,
    ...EXPANSION_TILES.filter((tile) => unlocked.has(tile.id)),
    ...FRONTIER_ZONES.filter((zone) => generated.has(zone.id)),
  ]
}

export function getMapAdjacency(
  unlockedTileIds: readonly string[] = [],
  generatedTileIds: readonly string[] = []
): Readonly<Record<string, readonly string[]>> {
  const unlocked = new Set(unlockedTileIds)
  const generated = new Set(generatedTileIds)
  const base: Record<string, readonly string[]> = { ...MAP_ADJACENCY }

  if (unlocked.has('t_salt_marsh')) {
    base.t_dock = [...(MAP_ADJACENCY.t_dock ?? []), 't_salt_marsh']
    base.t_ruin = [...(MAP_ADJACENCY.t_ruin ?? []), 't_salt_marsh']
    base.t_salt_marsh = EXPANSION_ADJACENCY.t_salt_marsh ?? []
  }

  for (const zone of FRONTIER_ZONES) {
    if (!generated.has(zone.id)) continue
    base[zone.id] = zone.adjacentTo
    for (const neighborId of zone.adjacentTo) {
      const existing = base[neighborId] ?? []
      if (!existing.includes(zone.id)) {
        base[neighborId] = [...existing, zone.id]
      }
    }
  }

  return base
}

/**
 * BFS：從 origin 找到 target 路徑上的下一格 tile id。
 * - origin === target 回傳 null（已抵達）
 * - 找不到路徑（例如 target 不在 graph）也回傳 null
 */
export function nextStepTowards(originId: string, targetId: string, unlockedTileIds: readonly string[] = [], generatedTileIds: readonly string[] = []): string | null {
  const adjacency = getMapAdjacency(unlockedTileIds, generatedTileIds)
  if (originId === targetId) return null
  if (!adjacency[originId] || !adjacency[targetId]) return null

  const visited = new Set<string>([originId])
  const queue: Array<{ id: string; firstStep: string }> = []

  for (const neighbor of adjacency[originId] ?? []) {
    if (visited.has(neighbor)) continue
    visited.add(neighbor)
    if (neighbor === targetId) return neighbor
    queue.push({ id: neighbor, firstStep: neighbor })
  }

  while (queue.length > 0) {
    const head = queue.shift()!
    for (const neighbor of adjacency[head.id] ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      if (neighbor === targetId) return head.firstStep
      queue.push({ id: neighbor, firstStep: head.firstStep })
    }
  }
  return null
}

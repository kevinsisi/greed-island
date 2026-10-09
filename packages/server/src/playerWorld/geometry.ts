import { AREA_SUB_COLS, AREA_SUB_ROWS, getAreaTerrainMask } from '../sim/npcEngine.js'
import { getKnownMapEdges, getKnownMapRegions } from '../sim/mapGraph.js'
import { getAuthoredWaterTerrainMask } from './waterTerrain.js'
import { listBuildingsForTile } from '../buildings/catalog.js'
import type { Point } from './types.js'

export type WorldObstacle = Readonly<{ id?: string; x: number; z: number; width: number; depth: number }>
export type RegionPortal = Point & Readonly<{ toTileId: string; radius: number; arrival: Point }>
export type RegionGeometry = Readonly<{
  tileId: string
  presentation: 'harbor-3d' | 'canonical-area-grid'
  minX: number; maxX: number; minZ: number; maxZ: number
  playerRadius: number; movePerStep: number
  spawn: Point
  terrain?: readonly string[]
  obstacles: readonly WorldObstacle[]
  portals: readonly RegionPortal[]
}>
// Existing multiplayer server harbor dimensions/collision, now one canonical tile.
const HARBOR_PLAYER_RADIUS = 0.35
const HARBOR_MOVE_PER_STEP = 0.4
// Canonical building catalog/NPC area coordinates are the existing 15 × 10 grid.
const AREA_GRID_COLUMNS = AREA_SUB_COLS
const AREA_GRID_ROWS = AREA_SUB_ROWS
const AREA_CELL_FOOTPRINT = 0.8
const AREA_PLAYER_RADIUS = 0.2
const AREA_MOVE_PER_STEP = 0.2
const DOCK_PORTAL: Point = { x: 0, z: 16 }
const CENTRAL_PORTAL: Point = { x: 7, z: 9 }
const PORTAL_RADIUS = 0.8
const COLLISION_EPSILON = 1e-7

const geometryCache = new Map<string, ReadonlyMap<string, RegionGeometry>>()

/** Same converter for existing authored regions; authored frontiers included; unknown masks fail closed. */
export function getRegionGeometry(tileId: string, unlockedBuildingIds: readonly string[] = []): RegionGeometry | null {
  const key = JSON.stringify([...new Set(unlockedBuildingIds)].sort())
  let geometries = geometryCache.get(key)
  if (!geometries) { geometries = buildKnownGeometries(unlockedBuildingIds); geometryCache.set(key, geometries) }
  return geometries.get(tileId) ?? null
}
function buildKnownGeometries(unlockedBuildingIds: readonly string[]): ReadonlyMap<string, RegionGeometry> {
  const regions = getKnownMapRegions(), drafts = new Map<string, RegionGeometry>()
  for (const region of regions) {
    if (region.id === 't_dock') {
      drafts.set(region.id, { tileId: region.id, presentation: 'harbor-3d', minX: -12, maxX: 12, minZ: -10, maxZ: 18,
        playerRadius: HARBOR_PLAYER_RADIUS, movePerStep: HARBOR_MOVE_PER_STEP, spawn: { x: 0, z: -6 },
        obstacles: [{ x: -7, z: 5, width: 4, depth: 5 }, { x: 7, z: 8, width: 4, depth: 5 }], portals: [] })
      continue
    }
    const land = getAreaTerrainMask(region.id), mask = land.length ? land : getAuthoredWaterTerrainMask(region.id)
    if (mask.length !== AREA_GRID_ROWS || mask.some(row => row.length !== AREA_GRID_COLUMNS)) continue
    const world: RegionGeometry = { tileId: region.id, presentation: 'canonical-area-grid',
      minX: -0.5, maxX: AREA_GRID_COLUMNS - 0.5, minZ: -0.5, maxZ: AREA_GRID_ROWS - 0.5,
      playerRadius: AREA_PLAYER_RADIUS, movePerStep: AREA_MOVE_PER_STEP, spawn: { x: 7, z: 5 }, terrain: mask,
      obstacles: [...mask.flatMap((row, z) => [...row].flatMap((cell, x) =>
        cell === 'X' || cell === '.' ? [{ id: `terrain-${x}-${z}`, x, z, width: 1, depth: 1 }] : [])),
        ...listBuildingsForTile(region.id, unlockedBuildingIds).map(building => ({ id: building.id,
          x: building.placement.col, z: building.placement.row, width: AREA_CELL_FOOTPRINT, depth: AREA_CELL_FOOTPRINT }))],
      portals: [],
    }
    const candidates = walkableCells(world), preferred = region.id === 't_central' ? CENTRAL_PORTAL : world.spawn
    const spawn = nearest(candidates, preferred)
    if (!spawn) continue
    drafts.set(region.id, { ...world, spawn })
  }
  const components = new Map([...drafts].map(([id, world]) => [id, reachableCells(world)])), markers = new Map<string, Map<string, Point>>()
  const edges = getKnownMapEdges().filter(edge => drafts.has(edge.fromTileId) && drafts.has(edge.toTileId))
  for (const [id, world] of drafts) {
    const current = regions.find(region => region.id === id)!, markerMap = new Map<string, Point>(), used = new Set<string>()
    const neighbors = edges.flatMap(edge => edge.fromTileId === id ? [edge.toTileId] : edge.toTileId === id ? [edge.fromTileId] : [])
    // Preserve the first reviewed real dock↔central endpoint coordinates.
    const fixed = id === 't_dock' ? ['t_central', DOCK_PORTAL] as const : id === 't_central' ? ['t_dock', CENTRAL_PORTAL] as const : null
    if (fixed && components.get(id)!.some(point => point.x === fixed[1].x && point.z === fixed[1].z)) {
      markerMap.set(fixed[0], fixed[1]); used.add(pointKey(fixed[1]))
    }
    for (const neighbor of neighbors.sort()) {
      if (markerMap.has(neighbor)) continue
      const target = regions.find(region => region.id === neighbor)!, dx = target.x - current.x, dz = target.y - current.y
      const center = { x: (world.minX + world.maxX) / 2, z: (world.minZ + world.maxZ) / 2 }
      const desired = Math.abs(dx) >= Math.abs(dz)
        ? { x: dx < 0 ? world.minX + world.playerRadius : world.maxX - world.playerRadius, z: center.z }
        : { x: center.x, z: dz < 0 ? world.minZ + world.playerRadius : world.maxZ - world.playerRadius }
      const available = components.get(id)!.filter(point => !used.has(pointKey(point))), point = nearest(available, desired)
      if (point) { markerMap.set(neighbor, point); used.add(pointKey(point)) }
    }
    markers.set(id, markerMap)
  }
  return new Map([...drafts].map(([id, world]) => [id, freezeGeometry({ ...world,
    portals: [...(markers.get(id) ?? [])].flatMap(([toTileId, point]) => {
      const arrival = markers.get(toTileId)?.get(id)
      return arrival ? [{ ...point, toTileId, radius: PORTAL_RADIUS, arrival: { ...arrival } }] : []
    }),
  })]))
}
function walkableCells(world: RegionGeometry): Point[] {
  const points: Point[] = []
  for (let z = Math.ceil(world.minZ + world.playerRadius); z <= Math.floor(world.maxZ - world.playerRadius); z += 1) {
    for (let x = Math.ceil(world.minX + world.playerRadius); x <= Math.floor(world.maxX - world.playerRadius); x += 1) {
      if (canStand({ x, z }, world)) points.push({ x, z })
    }
  }
  return points
}
function pointKey(point: Point): string { return `${point.x},${point.z}` }
function nearest(points: readonly Point[], target: Point): Point | undefined {
  return [...points].sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z)
    || a.z - b.z || a.x - b.x)[0]
}
/** Deterministic grid flood-fill used only to choose reachable authored-region markers. */
export function reachableCells(world: RegionGeometry): Point[] {
  const available = new Map(walkableCells(world).map(point => [pointKey(point), point])), queue = [world.spawn], visited = new Set([pointKey(world.spawn)])
  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index]!
    for (const next of [{ x: point.x - 1, z: point.z }, { x: point.x + 1, z: point.z }, { x: point.x, z: point.z - 1 }, { x: point.x, z: point.z + 1 }]) {
      const key = pointKey(next)
      if (available.has(key) && !visited.has(key) && canSlide(point, next, world)) { visited.add(key); queue.push(next) }
    }
  }
  return queue
}
function freezeGeometry(world: RegionGeometry): RegionGeometry {
  if (world.terrain) Object.freeze(world.terrain)
  Object.freeze(world.spawn)
  world.obstacles.forEach(obstacle => Object.freeze(obstacle)); Object.freeze(world.obstacles)
  world.portals.forEach(portal => { Object.freeze(portal.arrival); Object.freeze(portal) }); Object.freeze(world.portals)
  return Object.freeze(world)
}

export function canStand(point: Point, world: RegionGeometry): boolean {
  const r = world.playerRadius
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)
    || point.x < world.minX + r - COLLISION_EPSILON || point.x > world.maxX - r + COLLISION_EPSILON
    || point.z < world.minZ + r - COLLISION_EPSILON || point.z > world.maxZ - r + COLLISION_EPSILON) return false
  return world.obstacles.every(o => Math.abs(point.x - o.x) + COLLISION_EPSILON >= o.width / 2 + r
    || Math.abs(point.z - o.z) + COLLISION_EPSILON >= o.depth / 2 + r)
}
/** Server-only axis sliding; segment checks prevent future smaller obstacles from tunneling. */
export function computeMove(start: Point, dx: number, dz: number, world: RegionGeometry): Point {
  const scale = world.movePerStep / Math.max(1, Math.hypot(dx, dz))
  let x = start.x, z = start.z
  const nextX = round(x + dx * scale), nextZ = round(z + dz * scale)
  if (canSlide({ x, z }, { x: nextX, z }, world)) x = nextX
  if (canSlide({ x, z }, { x, z: nextZ }, world)) z = nextZ
  return { x, z }
}
function canSlide(start: Point, end: Point, world: RegionGeometry): boolean {
  if (!canStand(end, world)) return false
  const r = world.playerRadius
  return world.obstacles.every(o => {
    const left = o.x - o.width / 2 - r, right = o.x + o.width / 2 + r
    const top = o.z - o.depth / 2 - r, bottom = o.z + o.depth / 2 + r
    if (start.z === end.z) return !(start.z > top + COLLISION_EPSILON && start.z < bottom - COLLISION_EPSILON
      && Math.max(start.x, end.x) > left + COLLISION_EPSILON && Math.min(start.x, end.x) < right - COLLISION_EPSILON)
    return !(start.x > left + COLLISION_EPSILON && start.x < right - COLLISION_EPSILON
      && Math.max(start.z, end.z) > top + COLLISION_EPSILON && Math.min(start.z, end.z) < bottom - COLLISION_EPSILON)
  })
}
function round(value: number): number { return Math.round(value * 1e6) / 1e6 }
/** Read-only rendering transform. Gameplay interactions retain original NPC grid coordinates. */
export function projectNpcPoint(subCol: number, subRow: number, geometry: RegionGeometry): Point {
  if (geometry.presentation === 'canonical-area-grid') return { x: subCol, z: subRow }
  const r = geometry.playerRadius
  return { x: geometry.minX + r + subCol / (AREA_GRID_COLUMNS - 1) * (geometry.maxX - geometry.minX - 2 * r),
    z: geometry.minZ + r + subRow / (AREA_GRID_ROWS - 1) * (geometry.maxZ - geometry.minZ - 2 * r) }
}

export type CanonicalPlayerGridPose = Readonly<{ subCol: number; subRow: number; subZ: 0 }>
/** Exterior-only projection into canonical NPC/building coordinates. No caller pose or floor authority. */
export function canonicalWorldPointToGrid(point: Point, geometry: RegionGeometry): CanonicalPlayerGridPose | null {
  if (!canStand(point, geometry)) return null
  if (geometry.presentation === 'canonical-area-grid') return { subCol: point.x, subRow: point.z, subZ: 0 }
  if (geometry.presentation !== 'harbor-3d') return null
  const r = geometry.playerRadius, width = geometry.maxX - geometry.minX - 2 * r, depth = geometry.maxZ - geometry.minZ - 2 * r
  if (width <= 0 || depth <= 0) return null
  return { subCol: (point.x - geometry.minX - r) / width * (AREA_GRID_COLUMNS - 1),
    subRow: (point.z - geometry.minZ - r) / depth * (AREA_GRID_ROWS - 1), subZ: 0 }
}

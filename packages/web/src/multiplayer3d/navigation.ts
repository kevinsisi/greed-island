export interface NavigationPoint {
  x: number
  z: number
}

export interface NavigationWorld {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Supplied by the authoritative server; older servers may omit it. */
  playerRadius?: number
  movePerTick?: number
  obstacles: Array<{ x: number; z: number; width: number; depth: number }>
}

interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const EPSILON = 1e-7
const CORNER_CLEARANCE = 0.04

function finitePoint(point: NavigationPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z)
}

function validWorld(world: NavigationWorld): boolean {
  return Number.isFinite(world.minX) && Number.isFinite(world.maxX) && world.maxX > world.minX
    && Number.isFinite(world.minZ) && Number.isFinite(world.maxZ) && world.maxZ > world.minZ
    && typeof world.playerRadius === 'number' && Number.isFinite(world.playerRadius) && world.playerRadius >= 0
    && typeof world.movePerTick === 'number' && Number.isFinite(world.movePerTick) && world.movePerTick > 0
    && Array.isArray(world.obstacles) && world.obstacles.every((obstacle) =>
      Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z)
      && Number.isFinite(obstacle.width) && obstacle.width > 0
      && Number.isFinite(obstacle.depth) && obstacle.depth > 0)
}

function expandedObstacles(world: NavigationWorld): Rect[] {
  const radius = world.playerRadius!
  return world.obstacles.map((obstacle) => ({
    minX: obstacle.x - obstacle.width / 2 - radius,
    maxX: obstacle.x + obstacle.width / 2 + radius,
    minZ: obstacle.z - obstacle.depth / 2 - radius,
    maxZ: obstacle.z + obstacle.depth / 2 + radius,
  }))
}

function insideAnyObstacle(point: NavigationPoint, obstacles: Rect[]): boolean {
  return obstacles.some((rect) => insideRectInterior(point, rect))
}

function insideBounds(point: NavigationPoint, world: NavigationWorld): boolean {
  const radius = world.playerRadius!
  return point.x >= world.minX + radius - EPSILON && point.x <= world.maxX - radius + EPSILON
    && point.z >= world.minZ + radius - EPSILON && point.z <= world.maxZ - radius + EPSILON
}

function insideRectInterior(point: NavigationPoint, rect: Rect): boolean {
  return point.x > rect.minX + EPSILON && point.x < rect.maxX - EPSILON
    && point.z > rect.minZ + EPSILON && point.z < rect.maxZ - EPSILON
}

/** True only when the segment passes through the open interior of the rectangle. */
function segmentCrossesRectInterior(start: NavigationPoint, end: NavigationPoint, rect: Rect): boolean {
  const dx = end.x - start.x
  const dz = end.z - start.z
  let lower = 0
  let upper = 1
  const clip = (origin: number, delta: number, minimum: number, maximum: number): boolean => {
    if (Math.abs(delta) < EPSILON) return origin > minimum + EPSILON && origin < maximum - EPSILON
    const first = (minimum + EPSILON - origin) / delta
    const second = (maximum - EPSILON - origin) / delta
    lower = Math.max(lower, Math.min(first, second))
    upper = Math.min(upper, Math.max(first, second))
    return upper - lower > EPSILON
  }
  return clip(start.x, dx, rect.minX, rect.maxX) && clip(start.z, dz, rect.minZ, rect.maxZ)
    && upper > Math.max(lower, 0) + EPSILON && lower < Math.min(upper, 1) - EPSILON
}

function segmentIsClear(start: NavigationPoint, end: NavigationPoint, world: NavigationWorld, obstacles: Rect[]): boolean {
  if (!insideBounds(start, world) || !insideBounds(end, world)) return false
  return obstacles.every((rect) => !segmentCrossesRectInterior(start, end, rect))
}

function distance(a: NavigationPoint, b: NavigationPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function pointKey(point: NavigationPoint): string {
  return `${point.x.toFixed(6)}:${point.z.toFixed(6)}`
}

/**
 * Plan a shortest visible-corner route using the bounds and obstacle footprints
 * sent by the server. The route is only a client-side intent; all steps still go
 * through the server's normal authoritative move command and collision checks.
 * Returns null when the world geometry is incomplete or the destination is not
 * walkable, so pre-radius servers fail closed instead of guessing clearance.
 */
export function findNavigationPath(start: NavigationPoint, destination: NavigationPoint, world: NavigationWorld): NavigationPoint[] | null {
  if (!finitePoint(start) || !finitePoint(destination) || !validWorld(world)) return null
  const obstacles = expandedObstacles(world)
  if (!insideBounds(start, world) || !insideBounds(destination, world)) return null
  if (obstacles.some((rect) => insideRectInterior(start, rect) || insideRectInterior(destination, rect))) return null
  if (distance(start, destination) <= EPSILON) return []

  const nodes: NavigationPoint[] = [start, destination]
  const keys = new Set(nodes.map(pointKey))
  for (const rect of obstacles) {
    for (const point of [
      { x: rect.minX - CORNER_CLEARANCE, z: rect.minZ - CORNER_CLEARANCE },
      { x: rect.minX - CORNER_CLEARANCE, z: rect.maxZ + CORNER_CLEARANCE },
      { x: rect.maxX + CORNER_CLEARANCE, z: rect.minZ - CORNER_CLEARANCE },
      { x: rect.maxX + CORNER_CLEARANCE, z: rect.maxZ + CORNER_CLEARANCE },
    ]) {
      const key = pointKey(point)
      if (!keys.has(key) && insideBounds(point, world) && obstacles.every((other) => !insideRectInterior(point, other))) {
        nodes.push(point)
        keys.add(key)
      }
    }
  }

  const distances = nodes.map((_, index) => index === 0 ? 0 : Number.POSITIVE_INFINITY)
  const previous = nodes.map(() => -1)
  const visited = nodes.map(() => false)
  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1
    for (let index = 0; index < nodes.length; index += 1) {
      const candidateDistance = distances[index]
      if (visited[index] || candidateDistance === undefined || !Number.isFinite(candidateDistance)) continue
      if (current < 0) { current = index; continue }
      const currentDistance = distances[current]
      if (currentDistance === undefined || candidateDistance < currentDistance) current = index
    }
    if (current < 0) break
    const currentDistance = distances[current]
    const currentPoint = nodes[current]
    if (currentDistance === undefined || !Number.isFinite(currentDistance) || !currentPoint) break
    if (current === 1) break
    visited[current] = true
    for (let next = 0; next < nodes.length; next += 1) {
      const nextPoint = nodes[next]
      const nextDistance = distances[next]
      if (next === current || visited[next] || !nextPoint || nextDistance === undefined
        || !segmentIsClear(currentPoint, nextPoint, world, obstacles)) continue
      const candidate = currentDistance + distance(currentPoint, nextPoint)
      if (candidate < nextDistance) {
        distances[next] = candidate
        previous[next] = current
      }
    }
  }

  const destinationDistance = distances[1]
  if (destinationDistance === undefined || !Number.isFinite(destinationDistance)) return null
  const path: NavigationPoint[] = []
  for (let cursor = 1; cursor !== 0;) {
    if (cursor < 0) return null
    const point = nodes[cursor]
    const parent = previous[cursor]
    if (!point || parent === undefined) return null
    path.push(point)
    cursor = parent
  }
  return path.reverse()
}

/** Return a bounded server move intent that stops at, rather than past, one waypoint. */
export function moveIntentToward(current: NavigationPoint, waypoint: NavigationPoint, movePerTick: number): NavigationPoint | null {
  if (!finitePoint(current) || !finitePoint(waypoint) || !Number.isFinite(movePerTick) || movePerTick <= 0) return null
  const dx = waypoint.x - current.x
  const dz = waypoint.z - current.z
  const remaining = Math.hypot(dx, dz)
  if (remaining <= EPSILON) return null
  const magnitude = Math.min(1, remaining / movePerTick)
  return { x: dx / remaining * magnitude, z: dz / remaining * magnitude }
}

/** Verify planned segments against the authoritative player-radius footprint. */
export function isNavigationPathClear(start: NavigationPoint, path: readonly NavigationPoint[], world: NavigationWorld): boolean {
  if (!finitePoint(start) || !validWorld(world)) return false
  const obstacles = expandedObstacles(world)
  if (!insideBounds(start, world) || insideAnyObstacle(start, obstacles)) return false
  let previous = start
  for (const point of path) {
    if (!finitePoint(point) || !segmentIsClear(previous, point, world, obstacles)) return false
    previous = point
  }
  return true
}

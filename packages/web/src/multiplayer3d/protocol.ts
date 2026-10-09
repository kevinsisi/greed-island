import type { AccountProfile, CommandAcknowledgement, HarborBeacon, HarborProgress, PlayerWorldSnapshot, WorldRegion } from './types'

export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const accountId = (value: unknown): value is number => integer(value) && value > 0
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const nullableText = (value: unknown): boolean => value === null || typeof value === 'string'
const point = (value: unknown): boolean => record(value) && finite(value.x) && finite(value.z)
const unique = (values: unknown[]): boolean => new Set(values).size === values.length

export function isHarborProgress(value: unknown): value is HarborProgress {
  return record(value) && (value.status === 'ready' && integer(value.supplies) && integer(value.rewards)
    || value.status === 'legacy-review-required' && value.supplies === null && value.rewards === null)
}
export function isHarborBeacon(value: unknown): value is HarborBeacon {
  if (!record(value) || value.id !== 'harbor-beacon-1' || value.tileId !== 't_dock' || !point(value)
    || !finite(value.radius) || value.radius <= 0 || !integer(value.required) || value.required < 2 || value.required > 1000
    || !integer(value.participationWindowTicks) || value.participationWindowTicks < 1 || value.participationWindowTicks > 36000
    || !integer(value.tick) || value.tickMs !== 100 || value.closesAtTick !== null && !integer(value.closesAtTick)
    || !Array.isArray(value.contributors) || value.contributors.length > 1000 || !value.contributors.every(accountId) || !unique(value.contributors)
    || !Array.isArray(value.awardedAccountIds) || !value.awardedAccountIds.every(accountId) || !unique(value.awardedAccountIds)
    || !value.awardedAccountIds.every(id => (value.contributors as number[]).includes(id)) || typeof value.completed !== 'boolean') return false
  if (value.closesAtTick === null) return value.phase === 'gathering' && !value.completed && value.contributors.length < value.required && value.awardedAccountIds.length === 0
  if (value.contributors.length < value.required || value.closesAtTick < value.participationWindowTicks
    || value.tick < value.closesAtTick - value.participationWindowTicks) return false
  return value.phase === 'collecting' && !value.completed && value.tick < value.closesAtTick && value.awardedAccountIds.length === 0
    || value.phase === 'completed' && value.completed && value.tick >= value.closesAtTick && value.awardedAccountIds.length === value.contributors.length
}

export function isAccountProfile(value: unknown): value is AccountProfile {
  return record(value) && accountId(value.accountId) && nullableText(value.email) && nullableText(value.username)
    && nullableText(value.nickname) && text(value.avatar) && text(value.displayName) && integer(value.createdAt)
    && typeof value.role === 'string' && ['player', 'gm', 'admin', 'agent'].includes(value.role)
}
export function isCommandAcknowledgement(value: unknown, commandId: string): value is CommandAcknowledgement {
  return record(value) && value.accepted === true && value.commandId === commandId && integer(value.revision)
    && (value.duplicate === undefined || value.duplicate === true)
}

/** Fail closed before an untrusted network projection can reach navigation or rendering. */
export function isPlayerWorldSnapshot(value: unknown): value is PlayerWorldSnapshot {
  if (!record(value) || value.version !== 1 || value.worldId !== 'canonical-world' || !accountId(value.selfId)
    || !text(value.tileId) || !integer(value.presenceRevision) || !integer(value.revision) || !integer(value.movementStep) || !integer(value.worldTick)
    || !isHarborBeacon(value.beacon) || !isHarborProgress(value.harborProgress)
    || !Array.isArray(value.players) || !Array.isArray(value.messages) || value.messages.length > 100 || !Array.isArray(value.npcs) || !record(value.geometry) || !record(value.map)) return false
  const tileId = value.tileId
  const beacon = value.beacon
  if (!value.players.every(p => record(p) && accountId(p.accountId) && p.tileId === tileId && point(p)
    && finite(p.movementStep) && Number.isSafeInteger(p.movementStep) && p.movementStep >= -1
    && integer(p.sequence) && typeof p.online === 'boolean' && isHarborProgress(p.harborProgress) && (p.displayName === undefined || text(p.displayName)))) return false
  const playerIds = value.players.map(p => (p as Record<string, unknown>).accountId)
  if (!unique(playerIds) || !playerIds.includes(value.selfId)) return false
  if (!value.players.every(p => record(p) && (!beacon.awardedAccountIds.includes(p.accountId as number)
    || isHarborProgress(p.harborProgress) && p.harborProgress.status === 'ready' && p.harborProgress.rewards >= 1))) return false
  const self = value.players.find(p => record(p) && p.accountId === value.selfId) as Record<string, unknown>
  const selfProgress = self.harborProgress as HarborProgress
  if (selfProgress.status !== value.harborProgress.status || selfProgress.supplies !== value.harborProgress.supplies || selfProgress.rewards !== value.harborProgress.rewards) return false
  if (!value.npcs.every(n => record(n) && text(n.id) && record(n.name) && text(n.name.zh) && typeof n.name.en === 'string'
    && integer(n.color) && n.color <= 0xffffff && n.location === tileId && text(n.activity)
    && n.activity !== 'move' && finite(n.subCol) && finite(n.subRow) && finite(n.subZ) && point(n.presentationPosition))) return false
  if (!unique(value.npcs.map(n => (n as Record<string, unknown>).id))) return false
  const g = value.geometry
  if (g.tileId !== tileId || typeof g.presentation !== 'string' || !['harbor-3d', 'canonical-area-grid'].includes(g.presentation)
    || !finite(g.minX) || !finite(g.maxX) || g.minX >= g.maxX || !finite(g.minZ) || !finite(g.maxZ) || g.minZ >= g.maxZ
    || !finite(g.playerRadius) || g.playerRadius < 0 || 2 * g.playerRadius >= Math.min(g.maxX - g.minX, g.maxZ - g.minZ)
    || !finite(g.movePerStep) || g.movePerStep <= 0 || !point(g.spawn) || !Array.isArray(g.obstacles) || !Array.isArray(g.portals)
    || !g.obstacles.every(o => record(o) && point(o) && finite(o.width) && o.width > 0 && finite(o.depth) && o.depth > 0 && (o.id === undefined || text(o.id)))
    || !g.portals.every(p => record(p) && point(p) && text(p.toTileId) && finite(p.radius) && p.radius > 0 && point(p.arrival))) return false
  const map = value.map
  if (!Array.isArray(map.regions) || !record(map.adjacency) || !Array.isArray(map.edges) || !record(map.regionOnlineCounts)
    || !map.regions.every(r => record(r) && text(r.id) && text(r.name) && finite(r.x) && finite(r.y) && text(r.biome)
      && typeof r.available === 'boolean' && typeof r.generated === 'boolean' && typeof r.geometrySupported === 'boolean')) return false
  if (!value.messages.every(m => record(m) && text(m.id) && accountId(m.accountId) && text(m.tileId)
    && text(m.text) && m.text.trim().length > 0 && m.text.length <= 240 && integer(m.sequence) && m.sequence > 0
    && integer(m.worldTick) && integer(m.postedAtMovementStep) && (m.displayName === undefined || text(m.displayName)))) return false
  if (!unique(value.messages.map(m => (m as Record<string, unknown>).id))) return false
  const regionIds = map.regions.map(r => (r as Record<string, unknown>).id)
  const known = new Set(regionIds)
  if (!value.messages.every(m => record(m) && known.has(m.tileId))) return false
  if (!unique(regionIds) || !known.has(tileId) || !known.has(value.beacon.tileId)) return false
  if (!Object.entries(map.adjacency).every(([id, adjacent]) => known.has(id) && Array.isArray(adjacent)
    && adjacent.every(text) && unique(adjacent) && adjacent.every(next => next !== id && known.has(next)))) return false
  if (!map.edges.every(e => record(e) && known.has(e.fromTileId) && known.has(e.toTileId) && e.fromTileId !== e.toTileId
    && typeof e.crossingType === 'string' && ['land', 'water-crossing'].includes(e.crossingType) && typeof e.available === 'boolean')) return false
  if (!Object.entries(map.regionOnlineCounts).every(([id, count]) => known.has(id) && integer(count))) return false
  if (!g.portals.every(p => record(p) && known.has(p.toTileId))) return false
  const current = map.regions.find(r => record(r) && r.id === tileId) as Record<string, unknown> | undefined
  return current?.available === true && current.geometrySupported === true
}

/** Global revision leads; the server sub-clock also carries presence-only updates. */
export function snapshotIsNewer(previous: PlayerWorldSnapshot, next: PlayerWorldSnapshot): boolean {
  return next.revision > previous.revision || next.revision === previous.revision
    && (next.presenceRevision > previous.presenceRevision || next.presenceRevision === previous.presenceRevision
      && (next.movementStep > previous.movementStep || next.movementStep === previous.movementStep && next.worldTick > previous.worldTick))
}
export function registrationError(username: string, password: string, confirmation: string): string | null {
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username.trim())) return '帳號須為 3–32 個英數、底線或連字號。'
  if (password.length < 12 || password.length > 200) return '密碼須為 12–200 字元。'
  if (password !== confirmation) return '兩次輸入的密碼不一致。'
  return null
}
export function regionStatus(region: WorldRegion): string {
  return !region.available ? '尚未開放' : !region.geometrySupported ? '區域場景尚未支援' : '已開放'
}
export function crossingStatus(snapshot: PlayerWorldSnapshot, toTileId: string): { ready: boolean; text: string } {
  const region = snapshot.map.regions.find(r => r.id === toTileId)
  if (!region) return { ready: false, text: '未知區域' }
  if (!region.available || !region.geometrySupported) return { ready: false, text: regionStatus(region) }
  if (!(snapshot.map.adjacency[snapshot.tileId] ?? []).includes(toTileId)) return { ready: false, text: '須先前往相鄰區域' }
  const edge = snapshot.map.edges.find(e => e.fromTileId === snapshot.tileId && e.toTileId === toTileId || e.toTileId === snapshot.tileId && e.fromTileId === toTileId)
  if (!edge?.available) return { ready: false, text: '通路尚未開放' }
  const portal = snapshot.geometry.portals.find(p => p.toTileId === toTileId)
  if (!portal) return { ready: false, text: '通路場景尚未支援' }
  const self = snapshot.players.find(p => p.accountId === snapshot.selfId)
  const distance = self ? Math.hypot(self.x - portal.x, self.z - portal.z) : Number.POSITIVE_INFINITY
  const type = edge.crossingType === 'water-crossing' ? '渡水' : '步行'
  return distance <= portal.radius ? { ready: true, text: `${type}前往 ${region.name}` }
    : { ready: false, text: `走近${type}通路（${Number.isFinite(distance) ? distance.toFixed(1) : '—'} m）` }
}

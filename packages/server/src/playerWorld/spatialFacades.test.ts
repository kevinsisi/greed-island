import { describe, expect, it } from 'vitest'
import { accountId } from '../identity/principal.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { FRONTIER_ZONES, getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { canonicalWorldPointToGrid, canStand, getRegionGeometry, projectNpcPoint } from './geometry.js'
import { PlayerWorldService } from './service.js'
import { EventFixture } from './service.testSupport.js'

function setup(getGeometry: (tileId: string) => ReturnType<typeof getRegionGeometry> = getRegionGeometry) {
  const fixture = new EventFixture()
  const service = new PlayerWorldService(fixture as unknown as SqliteEventStore, {
    getGeometry, getTick: () => 0, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: () => [],
    getMap: () => ({ regions: getKnownMapRegions(), edges: getKnownMapEdges(), adjacency: getMapAdjacency() }),
  })
  return { service, fixture }
}
const enter = { commandId: 'enter', type: 'enter', payload: {} }
describe('canonical spatial read facades', () => {
  it('inverts the dock NPC transform including radius-padded extrema exactly', () => {
    const geometry = getRegionGeometry('t_dock')!
    for (const [col, row] of [[0, 0], [14, 0], [0, 9], [14, 9], [7, 2], [7, 8]]) {
      const point = projectNpcPoint(col!, row!, geometry)
      expect(canStand(point, geometry)).toBe(true)
      const pose = canonicalWorldPointToGrid(point, geometry)!
      expect(pose.subCol).toBeCloseTo(col!, 12); expect(pose.subRow).toBeCloseTo(row!, 12); expect(pose.subZ).toBe(0)
    }
  })
  it('keeps all 12 authored regions, including frontiers, in canonical coordinates and refuses blocked/outside points', () => {
    const regions = getKnownMapRegions().flatMap(region => { const geometry = getRegionGeometry(region.id); return geometry ? [geometry] : [] })
    expect(regions).toHaveLength(12)
    for (const frontier of FRONTIER_ZONES) {
      expect(regions.find(region => region.tileId === frontier.id)?.presentation).toBe('canonical-area-grid')
      expect(getKnownMapRegions().find(region => region.id === frontier.id)?.available).toBe(false)
    }
    for (const geometry of regions.filter(region => region.presentation === 'canonical-area-grid')) {
      expect(canonicalWorldPointToGrid(geometry.spawn, geometry)).toEqual({ subCol: geometry.spawn.x, subRow: geometry.spawn.z, subZ: 0 })
      expect(canonicalWorldPointToGrid({ x: geometry.minX - 1, z: geometry.minZ }, geometry)).toBeNull()
      for (const obstacle of geometry.obstacles) expect(canonicalWorldPointToGrid(obstacle, geometry)).toBeNull()
    }
    expect(canonicalWorldPointToGrid({ x: NaN, z: 0 }, getRegionGeometry('t_dock')!)).toBeNull()
  })
  it('reads pose only from the persisted position and injected server geometry, with unsupported terrain fail closed', () => {
    let supported = true
    const { service, fixture } = setup(tileId => supported ? getRegionGeometry(tileId) : null), id = accountId(1)
    expect(service.getGridPose(id)).toBeNull(); service.execute(id, enter)
    const position = service.getPosition(id)!
    expect(service.getGridPose(id)).toEqual(canonicalWorldPointToGrid(position, getRegionGeometry(position.tileId)!))
    const count = fixture.events.length; supported = false
    expect(service.getGridPose(id)).toBeNull(); expect(fixture.events).toHaveLength(count)
  })
  it('returns one defensive actor per admitted account across regions, with refcount/reconnect and no cookie presence', () => {
    const { service, fixture } = setup(), alice = accountId(1), bob = accountId(2)
    service.execute(alice, enter); service.execute(bob, enter)
    expect(service.getAdmittedActors()).toEqual([])
    const a1 = service.connect(alice), a2 = service.connect(alice), b = service.connect(bob)
    const previous = fixture.events.at(-1)!
    fixture.events.push({ ...previous, sequence: previous.sequence + 1, eventId: 'canonical-central-position', actorId: '2',
      eventType: 'PLAYER_REGION_TRANSITIONED', payload: { data: { accountId: 2, tileId: 't_central', x: 7, z: 9, movementStep: 2 } } })
    const reopened = new PlayerWorldService(fixture as unknown as SqliteEventStore, {
      getTick: () => 0, getRevision: () => fixture.events.at(-1)!.sequence, getNpcs: () => [],
      getMap: () => ({ regions: getKnownMapRegions(), edges: getKnownMapEdges(), adjacency: getMapAdjacency() }),
    })
    reopened.connect(alice); reopened.connect(bob)
    expect(reopened.getAdmittedActors().map(actor => actor.tileId)).toEqual(['t_dock', 't_central'])
    expect(reopened.getGridPose(bob)).toEqual({ subCol: 7, subRow: 9, subZ: 0 })
    const roster = service.getAdmittedActors(); expect(roster.map(actor => actor.accountId)).toEqual([alice, bob])
    ;(roster[0] as { x: number }).x = 12345
    expect(service.getPosition(alice)!.x).toBe(0)
    a1(); expect(service.getAdmittedActors()).toHaveLength(2); a2(); expect(service.getAdmittedActors()).toHaveLength(1)
    b(); expect(service.getAdmittedActors()).toEqual([]); expect(service.getPosition(bob)).not.toBeNull()
    const fresh = service.connect(alice); expect(service.getAdmittedActors()).toHaveLength(1); fresh()
  })
})

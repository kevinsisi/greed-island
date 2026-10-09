import { describe, expect, it } from 'vitest'
import { accountId } from '../identity/principal.js'
import { listAllBuildings, listBuildingsForTile } from '../buildings/catalog.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { canonicalWorldPointToGrid, canStand, getRegionGeometry, reachableCells } from './geometry.js'
import { parsePlayerWorldIntent, evaluatePlayerWorldIntent } from './ruleEngine.js'
import { EventFixture } from './service.testSupport.js'
import { PlayerWorldService } from './service.js'
import type { PlayerWorldPosition } from './types.js'

const id = accountId(1)
const building = listBuildingsForTile('t_central').find(b => b.enterable)!
const map = () => ({ regions: getKnownMapRegions(), edges: getKnownMapEdges(), adjacency: getMapAdjacency() })
const near = reachableCells(getRegionGeometry('t_central')!).find(p => Math.max(Math.abs(p.x - building.placement.col), Math.abs(p.z - building.placement.row)) <= 1.5)!
const position: PlayerWorldPosition = { accountId: id, tileId: 't_central', ...near, movementStep: -1, sequence: 1 }
const body = (commandId: string, type = 'enter-building', payload: object = { buildingId: building.id }) => ({ commandId, type, payload })
function setup() {
  const fixture = new EventFixture()
  const source = { getMap: map, getTick: () => 10, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: () => [],
    getBuilding: (buildingId: string, tileId: string) => listBuildingsForTile(tileId).find(b => b.id === buildingId) ?? null }
  const create = () => new PlayerWorldService(fixture as unknown as SqliteEventStore, source)
  const service = create(); service.execute(id, body('world', 'enter', {}))
  const old = fixture.events.at(-1)!, payload = old.payload as { data: Record<string, unknown> }
  fixture.events.push({ ...old, eventId: 'at-building', sequence: 2, eventType: 'PLAYER_REGION_TRANSITIONED', payload: { ...payload, data: { ...payload.data, ...position, clientCommandId: 'at-building' } } })
  return { fixture, service: create(), create, source }
}
describe('single canonical catalog interior admission', () => {
  it('rejects caller poses, floors, other actors, and implicit navigation', () => {
    for (const payload of [{ buildingId: building.id, floor: 2 }, { buildingId: building.id, x: 4 }, { buildingId: building.id, returnPose: near }, { buildingId: building.id, accountId: 2 }]) expect(() => parsePlayerWorldIntent(body('bad', 'enter-building', payload))).toThrow()
    expect(() => parsePlayerWorldIntent(body('bad', 'exit-building', { buildingId: building.id }))).toThrow()
  })
  it('has a reachable real walkable entry pose under the existing <=1.5 area UI policy for every visible enterable catalog building', () => {
    const checked: string[] = []
    for (const b of listAllBuildings().filter(b => b.enterable)) {
      const geometry = getRegionGeometry(b.tileId)
      if (!geometry) continue
      const entry = reachableCells(geometry).find(p => {
        const pose = canonicalWorldPointToGrid(p, geometry)
        return pose && Math.max(Math.abs(pose.subCol - b.placement.col), Math.abs(pose.subRow - b.placement.row)) <= 1.5
      })
      expect(entry, b.id).toBeDefined(); expect(canStand(entry!, geometry), b.id).toBe(true); checked.push(b.id)
    }
    expect(checked.length).toBeGreaterThan(10)
  })
  it('requires admitted live connection for both entry and exit and reauthorizes inside queued commit', async () => {
    const { service, fixture } = setup()
    expect(() => service.execute(id, body('no-live'))).toThrow('admitted world connection')
    const disconnect = service.connect(id)
    const pending = service.submit(id, body('revoked'), () => { throw new Error('synthetic cookie revoked') }).catch(e => e)
    service.advanceMovementStep(); expect(await pending).toBeInstanceOf(Error); expect(fixture.events).toHaveLength(2)
    service.execute(id, body('enter')); disconnect()
    expect(() => service.execute(id, body('exit', 'exit-building', {}))).toThrow('admitted world connection')
  })
  it('preserves exact exterior return pose, retries idempotently, and resumes from latest-only replay', () => {
    const { service, create, fixture } = setup(); service.connect(id)
    const entered = service.execute(id, body('enter'))
    expect(service.getPosition(id)).toMatchObject({ tileId: position.tileId, ...near, interior: { buildingId: building.id, returnPose: near } })
    expect(service.getGridPose(id)).toBeNull()
    const defensive = service.getPosition(id)!; (defensive.interior!.returnPose as { x: number }).x = 999
    expect(service.getPosition(id)!.interior!.returnPose).toEqual(near)
    expect(service.execute(id, body('enter'))).toEqual({ ...entered, duplicate: true })
    const reopened = create(); reopened.connect(id); expect(reopened.getPosition(id)).toEqual(service.getPosition(id))
    reopened.advanceMovementStep(); reopened.execute(id, body('exit', 'exit-building', {})); expect(reopened.getPosition(id)).toMatchObject(near); expect(reopened.getPosition(id)!.interior).toBeUndefined()
    expect(fixture.events.slice(-2).map(e => e.eventType)).toEqual(['PLAYER_BUILDING_ENTERED', 'PLAYER_BUILDING_EXITED'])
  })
  it('rejects remote, locked, missing, or non-enterable buildings and blocks exterior movement while inside', () => {
    for (const target of ['missing', 'b_forest_house', 'b_salt_marsh_field_station']) {
      const input = { accountId: id, intent: parsePlayerWorldIntent(body('bad', 'enter-building', { buildingId: target })), position, map: map(), movementStep: 5, worldTick: 1, submittedAt: 1, getBuilding: (name: string, tileId: string) => listBuildingsForTile(tileId).find(b => b.id === name) ?? null }
      expect(() => evaluatePlayerWorldIntent(input)).toThrow('visible operational')
    }
    const { service } = setup(); service.connect(id); service.execute(id, body('enter')); service.advanceMovementStep()
    expect(() => service.execute(id, body('move', 'move', { dx: 1, dz: 0 }))).toThrow('Exit the admitted')
    expect(() => service.execute(id, body('nested'))).toThrow('Exit the admitted')
  })
  it('rolls back failed entry with no false receipt and fails closed on a changed blocked return pose', () => {
    const { service, fixture, source } = setup(); service.connect(id); fixture.failCommit = true
    expect(() => service.execute(id, body('enter'))).toThrow('synthetic transaction failure'); expect(service.getPosition(id)!.interior).toBeUndefined()
    fixture.failCommit = false; expect(service.execute(id, body('enter')).duplicate).toBeUndefined(); service.advanceMovementStep()
    const blocked = new PlayerWorldService(fixture as unknown as SqliteEventStore, { ...source, getGeometry: tileId => { const g = getRegionGeometry(tileId)!; return { ...g, obstacles: [...g.obstacles, { ...near, width: 1, depth: 1 }] } } })
    blocked.connect(id); expect(() => blocked.execute(id, body('exit', 'exit-building', {}))).toThrow('saved exterior return pose is blocked')
    expect(blocked.getPosition(id)!.interior?.buildingId).toBe(building.id)
  })
})

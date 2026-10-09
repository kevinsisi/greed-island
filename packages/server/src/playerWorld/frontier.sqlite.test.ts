import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountId } from '../identity/principal.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { DynamicTileProjection } from '../projections/dynamicTile.js'
import { FRONTIER_ZONES, getKnownMapEdges, getKnownMapRegions, getMapAdjacency, nextStepTowards } from '../sim/mapGraph.js'
import { canStand, computeMove, getRegionGeometry } from './geometry.js'
import { PlayerWorldService } from './service.js'
import { EventFixture } from './service.testSupport.js'

const alice = accountId(1)
function setup(db: Database.Database) {
  const store = new SqliteEventStore(db), generated = new DynamicTileProjection()
  generated.rebuildFromEvents(store.readEventsByTypes(['TILE_GENERATED']))
  const source = { getMap: () => ({ regions: getKnownMapRegions([], generated.listTileIds()), adjacency: getMapAdjacency([], generated.listTileIds()), edges: getKnownMapEdges([], generated.listTileIds()) }),
    getTick: () => 30, getRevision: () => store.readLatestFactSnapshot().lastSequence, getNpcs: () => [] }
  return { store, generated, service: new PlayerWorldService(store, source) }
}
function walk(service: PlayerWorldService, destination: { x: number; z: number }, sequence: { value: number }) {
  const start = service.getPosition(alice)!, world = getRegionGeometry(start.tileId)!
  const key = (p: { x: number; z: number }) => `${p.x},${p.z}`
  const queue = [{ point: { x: start.x, z: start.z }, path: [] as { x: number; z: number }[] }], seen = new Set([key(start)])
  let route: { x: number; z: number }[] | undefined
  for (let index = 0; index < queue.length; index++) {
    const { point, path } = queue[index]!
    if (key(point) === key(destination)) { route = path; break }
    for (const next of [{ x: point.x - 1, z: point.z }, { x: point.x + 1, z: point.z }, { x: point.x, z: point.z - 1 }, { x: point.x, z: point.z + 1 }]) {
      if (seen.has(key(next)) || !canStand(next, world)) continue
      // Use canonical swept movement to reject a blocked segment between free endpoints.
      let p = point
      for (let j = 0; j < 10 && key(p) !== key(next); j++) p = computeMove(p, (next.x - p.x) / world.movePerStep, (next.z - p.z) / world.movePerStep, world)
      if (key(p) !== key(next)) continue
      seen.add(key(next)); queue.push({ point: next, path: [...path, next] })
    }
  }
  expect(route).toBeDefined()
  for (const target of route!) {
    for (let j = 0; j < 10; j++) {
      const current = service.getPosition(alice)!
      if (key(current) === key(target)) break
      service.advanceMovementStep()
      service.execute(alice, { commandId: `walk-${sequence.value++}`, type: 'move', payload: {
        dx: Math.max(-1, Math.min(1, (target.x - current.x) / world.movePerStep)), dz: Math.max(-1, Math.min(1, (target.z - current.z) / world.movePerStep)) } })
    }
    expect(service.getPosition(alice)).toMatchObject(target)
  }
}
describe('frontier file-backed event durability', () => {
  it.each(FRONTIER_ZONES.map(t => t.id))('reopens generated %s, preserves the player there and permits the reciprocal return', tileId => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-frontier-')), path = join(directory, 'world.sqlite')
    let db = new Database(path)
    try {
      const { service, store, generated } = setup(db), sequence = { value: 0 }
      for (const zone of FRONTIER_ZONES) {
        const result = new LivingWorldRuleEngine().evaluate(makeLivingWorldCommand('TILE_GENERATED', 'world', 'system', 30, 1, {
          tileId: zone.id, name: zone.name, biome: zone.biome, x: zone.x, y: zone.y, adjacentTileIds: zone.adjacentTo, generatedAtTick: 30, narration: 'Frontier generated for durability test' }))
        if (!result.accepted) throw new Error(result.rejection.reason)
        store.appendEvents(result.events).forEach(event => generated.project(event))
      }
      service.execute(alice, { commandId: 'join', type: 'enter', payload: {} })
      let returnTile = ''
      for (let step = 0; step < 12 && service.getPosition(alice)!.tileId !== tileId; step++) {
        const current = service.getPosition(alice)!, next = nextStepTowards(current.tileId, tileId, [], generated.listTileIds())!
        const portal = getRegionGeometry(current.tileId)!.portals.find(p => p.toTileId === next)!
        walk(service, portal, sequence); returnTile = current.tileId
        service.advanceMovementStep(); service.execute(alice, { commandId: `cross-${sequence.value++}`, type: 'transition', payload: { toTileId: next } })
      }
      const expected = service.getPosition(alice); expect(expected?.tileId).toBe(tileId)
      db.close(); db = new Database(path)
      const restored = setup(db)
      expect(restored.generated.has(tileId)).toBe(true)
      expect(restored.service.getPosition(alice)).toEqual(expected)
      restored.service.advanceMovementStep()
      restored.service.execute(alice, { commandId: 'return', type: 'transition', payload: { toTileId: returnTile } })
      expect(restored.service.getPosition(alice)?.tileId).toBe(returnTile)
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
})

// Also exercise the exact movement route without a native driver so a missing addon
// cannot hide errors in the file-backed scenario's navigation helper.
describe('frontier route through accepted movement commands', () => {
  it.each(FRONTIER_ZONES.map(t => t.id))('walks to %s using authoritative movement and crossings', tileId => {
    const ids = FRONTIER_ZONES.map(t => t.id), fixture = new EventFixture()
    const service = new PlayerWorldService(fixture as unknown as SqliteEventStore, { getMap: () => ({ regions: getKnownMapRegions([], ids), adjacency: getMapAdjacency([], ids), edges: getKnownMapEdges([], ids) }), getTick: () => 30, getRevision: () => fixture.events.length, getNpcs: () => [] })
    const sequence = { value: 0 }
    service.execute(alice, { commandId: 'join', type: 'enter', payload: {} })
    for (let step = 0; step < 12 && service.getPosition(alice)!.tileId !== tileId; step++) {
      const current = service.getPosition(alice)!, next = nextStepTowards(current.tileId, tileId, [], ids)!
      const portal = getRegionGeometry(current.tileId)!.portals.find(p => p.toTileId === next)!
      walk(service, portal, sequence)
      service.advanceMovementStep(); service.execute(alice, { commandId: `cross-${sequence.value++}`, type: 'transition', payload: { toTileId: next } })
    }
    expect(service.getPosition(alice)?.tileId).toBe(tileId)
  })
})

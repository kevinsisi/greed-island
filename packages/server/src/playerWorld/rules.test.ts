import { describe, expect, it } from 'vitest'
import { accountId } from '../identity/principal.js'
import { LivingWorldRuleEngine } from '../kernel/livingWorldCommands.js'
import { PlayerWorldProjection } from '../projections/playerWorld.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency, MAP_TILES, EXPANSION_TILES, FRONTIER_ZONES } from '../sim/mapGraph.js'
import { getAreaTerrainMask } from '../sim/npcEngine.js'
import { listBuildingsForTile } from '../buildings/catalog.js'
import { canStand, computeMove, getRegionGeometry, reachableCells } from './geometry.js'
import { evaluatePlayerWorldIntent, parsePlayerWorldIntent } from './ruleEngine.js'
import { createPlayerWorldSnapshot } from './snapshot.js'
import type { PlayerWorldIntent, PlayerWorldMap, PlayerWorldNpc, PlayerWorldPosition } from './types.js'

const alice = accountId(1), bob = accountId(2)
const map = (unlocked: string[] = [], generated: string[] = []): PlayerWorldMap => ({
  regions: getKnownMapRegions(unlocked, generated), adjacency: getMapAdjacency(unlocked, generated), edges: getKnownMapEdges(unlocked, generated),
})
const intent = (type: PlayerWorldIntent['type'], payload: object = {}, commandId = 'command-1') => parsePlayerWorldIntent({ commandId, type, payload })
const position = (changes: Partial<PlayerWorldPosition> = {}): PlayerWorldPosition => ({ accountId: alice,
  tileId: 't_dock', x: 0, z: -6, movementStep: -1, sequence: 1, ...changes })
const evaluate = (command: PlayerWorldIntent, pos: PlayerWorldPosition | null = position(), worldMap = map()) => evaluatePlayerWorldIntent({
  accountId: alice, intent: command, position: pos, map: worldMap, movementStep: 2, worldTick: 3, submittedAt: 100,
})
function commit(command: ReturnType<typeof evaluate>, sequence: number) {
  const compiled = new LivingWorldRuleEngine().evaluate(command)
  if (!compiled.accepted) throw new Error(compiled.rejection.reason)
  return { ...compiled.events[0]!, sequence }
}

describe('canonical player-world pure rules and projection', () => {
  it.each([
    { commandId: 'c', type: 'move', payload: { dx: 1, dz: 0, accountId: 2 } },
    { commandId: 'c', type: 'move', payload: { dx: 1, dz: 0, x: 99 } },
    { commandId: 'c', type: 'move', payload: { dx: Infinity, dz: 0 } },
    { commandId: 'c', type: 'move', payload: { dx: 2, dz: 0 } },
    { commandId: 'c', type: 'transition', payload: { toTileId: 't_central', crossingType: 'land' } },
    { commandId: 'c', type: 'enter', payload: { tileId: 't_central' } },
    { commandId: 'c', type: 'enter', payload: {}, actorId: '2' },
    { commandId: 'c', type: 'enter', payload: {}, tick: 100 },
    { commandId: 'c', type: 'contribute', payload: { supplies: 999 } },
  ])('rejects untrusted authority in %j', command => expect(() => parsePlayerWorldIntent(command)).toThrow())
  it('uses numeric canonical accounts and refuses to replace an existing position with a spawn', () => {
    const command = evaluate(intent('enter'), null)
    expect(command.actorId).toBe('1'); expect(command.payload).toMatchObject({ accountId: 1, tileId: 't_dock', x: 0, z: -6 })
    expect(() => evaluate(intent('enter'))).toThrow('must be resumed')
  })
  it('normalizes diagonal movement, bounds it, and prevents tunneling through thin obstacles', () => {
    const world = getRegionGeometry('t_dock')!, diagonal = computeMove({ x: 0, z: 0 }, 1, 1, world)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(world.movePerStep, 5)
    expect(computeMove({ x: world.maxX - world.playerRadius, z: 0 }, 1, 0, world).x).toBe(world.maxX - world.playerRadius)
    const thin = { ...world, playerRadius: 0.01, obstacles: [{ x: 0.2, z: 0, width: 0.01, depth: 1 }] }
    expect(computeMove({ x: 0, z: 0 }, 1, 0, thin)).toEqual({ x: 0, z: 0 })
  })
  it('slides along harbor obstacles while remaining walkable', () => {
    const world = getRegionGeometry('t_dock')!, start = { x: -4.65, z: 5 }, next = computeMove(start, -1, 1, world)
    expect(next.x).toBe(start.x); expect(next.z).toBeGreaterThan(start.z); expect(canStand(next, world)).toBe(true)
  })
  it('derives central geometry from existing terrain and building cells', () => {
    const world = getRegionGeometry('t_central')!, mask = getAreaTerrainMask('t_central')
    mask.forEach((row, z) => [...row].forEach((cell, x) => { if (cell === 'X') expect(canStand({ x, z }, world)).toBe(false) }))
    listBuildingsForTile('t_central').forEach(building => expect(canStand({ x: building.placement.col, z: building.placement.row }, world)).toBe(false))
    expect(canStand(world.spawn, world)).toBe(true)
    expect(Object.isFrozen(mask)).toBe(true)
    expect(() => (mask as string[]).push('fake')).toThrow()
  })
  it('rejects two movement actions in one server sub-step', () => {
    expect(() => evaluate(intent('move', { dx: 1, dz: 0 }), position({ movementStep: 2 }))).toThrow('one movement action')
  })
  it('requires the actual water-crossing portal, refusing unsupported or locked regions', () => {
    expect(() => evaluate(intent('transition', { toTileId: 't_central' }))).toThrow('Walk to')
    const crossing = evaluate(intent('transition', { toTileId: 't_central' }), position({ z: 16 }))
    expect(crossing.payload).toMatchObject({ fromTileId: 't_dock', tileId: 't_central', crossingType: 'water-crossing', x: 7, z: 9 })
    expect(() => evaluate(intent('transition', { toTileId: 't_salt_marsh' }))).toThrow('available adjacent')
    expect(() => evaluate(intent('transition', { toTileId: 't_salt_marsh' }), position(), map(['t_salt_marsh']))).toThrow('Walk to')
  })
  it('exposes locked/generated topology without granting unavailable crossings', () => {
    expect(map().regions.find(region => region.id === 't_salt_marsh')?.available).toBe(false)
    expect(map().edges.find(edge => edge.toTileId === 't_salt_marsh')?.available).toBe(false)
    expect(map(['t_salt_marsh']).edges.find(edge => edge.toTileId === 't_salt_marsh')?.available).toBe(true)
    const generated = map([], ['t_frontier_badlands'])
    expect(generated.regions.find(region => region.id === 't_frontier_badlands')).toMatchObject({ available: true, generated: true })
    expect(generated.edges.find(edge => edge.fromTileId === 't_salt_marsh' && edge.toTileId === 't_frontier_badlands')?.available).toBe(false)
  })
  it('replays complete position events, gates duplicate delivery, and returns defensive copies', () => {
    const events = [commit(evaluate(intent('enter'), null), 1), commit(evaluate(intent('move', { dx: 1, dz: 0 })), 7)]
    const projection = new PlayerWorldProjection(); projection.rebuildFromEvents(events)
    const expected = projection.get(alice); projection.project(events[0]!); projection.project(events[1]!)
    expect(projection.get(alice)).toEqual(expected)
    const copy = projection.list(); copy[0] = position({ x: 99 }); expect(projection.get(alice)?.x).toBe(0.4)
    const latest = new PlayerWorldProjection(); latest.rebuildFromEvents(events.slice(-1)); expect(latest.get(alice)).toEqual(expected)
  })
  it('snapshots only same-region online peers and living outdoor canonical NPCs', () => {
    const projection = new PlayerWorldProjection(), enter = commit(evaluate(intent('enter'), null), 1); projection.project(enter)
    const second = { ...enter, sequence: 2, actorId: '2', payload: { ...enter.payload, data: { ...enter.payload.data, accountId: bob } } }; projection.project(second)
    const npc: PlayerWorldNpc = { id: 'dock-existing', name: { zh: '碼頭原居民', en: 'Dock resident' }, color: 1, location: 't_dock', activity: 'idle', buildingId: null,
      travelRoute: null, deceased: false, subCol: 7, subRow: 5, subZ: 0 }
    const source = { getMap: map, getTick: () => 3, getRevision: () => 9, getNpcs: () => [npc,
      { ...npc, id: 'dead', deceased: true }, { ...npc, id: 'indoor', buildingId: 'b' },
      { ...npc, id: 'travel', activity: 'move', travelRoute: {} }, { ...npc, id: 'elsewhere', location: 't_central' }] }
    expect(createPlayerWorldSnapshot(alice, projection, source, new Set([alice, bob]), 4).npcs.map(npc => npc.id)).toEqual(['dock-existing'])
    expect(createPlayerWorldSnapshot(alice, projection, source, new Set([alice]), 4).players.map(player => player.accountId)).toEqual([alice])
    projection.project({ ...second, sequence: 3, payload: { ...second.payload, data: { ...second.payload.data, tileId: 't_central' } } })
    const snapshot = createPlayerWorldSnapshot(alice, projection, source, new Set([alice, bob]), 4)
    expect(snapshot.players.map(player => player.accountId)).toEqual([alice]); expect(snapshot.map.regionOnlineCounts).toEqual({ t_dock: 1, t_central: 1 })
  })
  it('event identity excludes audit wall time but distinguishes client commands', () => {
    const input = { accountId: alice, intent: intent('move', { dx: 1, dz: 0 }), position: position(), map: map(), movementStep: 2, worldTick: 3 }
    expect(commit(evaluatePlayerWorldIntent({ ...input, submittedAt: 1 }), 1).eventId)
      .toBe(commit(evaluatePlayerWorldIntent({ ...input, submittedAt: 1000 }), 1).eventId)
    expect(commit(evaluatePlayerWorldIntent({ ...input, intent: intent('move', { dx: 1, dz: 0 }, 'different'), submittedAt: 1 }), 1).eventId)
      .not.toBe(commit(evaluatePlayerWorldIntent({ ...input, submittedAt: 1 }), 1).eventId)
  })
})


describe('all existing canonical authored-region geometry', () => {
  it.each([...MAP_TILES, ...EXPANSION_TILES, ...FRONTIER_ZONES].map(tile => [tile.id]))('has a walkable spawn and reachable reciprocal crossings for %s', tileId => {
    const world = getRegionGeometry(tileId!)!, component = reachableCells(world)
    expect(world).not.toBeNull(); expect(canStand(world.spawn, world)).toBe(true)
    expect(Object.isFrozen(world)).toBe(true)
    expect(world.portals.length).toBeGreaterThan(0)
    for (const portal of world.portals) {
      expect(canStand(portal, world)).toBe(true)
      expect(component.some(point => point.x === portal.x && point.z === portal.z)).toBe(true)
      const destination = getRegionGeometry(portal.toTileId)!, reciprocal = destination.portals.find(marker => marker.toTileId === tileId)
      expect(reciprocal).toBeDefined(); expect(canStand(portal.arrival, destination)).toBe(true)
      expect(portal.arrival).toEqual({ x: reciprocal!.x, z: reciprocal!.z })
    }
  })
  it('provides 8 base, 1 locked and 3 authored frontier geometries', () => {
    expect(MAP_TILES.filter(tile => getRegionGeometry(tile.id))).toHaveLength(8)
    expect(EXPANSION_TILES.filter(tile => getRegionGeometry(tile.id))).toHaveLength(1)
    for (const frontier of FRONTIER_ZONES) expect(getRegionGeometry(frontier.id)).not.toBeNull()
  })
  it('keeps unopened expansion buildings out of collision facts and adds only explicitly unlocked catalog definitions', () => {
    expect(getRegionGeometry('t_salt_marsh')!.obstacles.some(obstacle => obstacle.id === 'b_salt_marsh_field_station')).toBe(false)
    const world = getRegionGeometry('t_salt_marsh', ['b_salt_marsh_field_station'])!
    expect(world.obstacles.some(obstacle => obstacle.id === 'b_salt_marsh_field_station')).toBe(true)
    expect(world.obstacles.some(obstacle => obstacle.id === 'b_salt_marsh_ranch')).toBe(false)
  })
  it('allows every authored available graph crossing only at its canonical marker', () => {
    for (const tile of [...MAP_TILES, ...EXPANSION_TILES, ...FRONTIER_ZONES]) for (const portal of getRegionGeometry(tile.id)!.portals) {
      const at = position({ tileId: tile.id, x: portal.x, z: portal.z })
      const command = evaluate(intent('transition', { toTileId: portal.toTileId }), at, map(['t_salt_marsh'], FRONTIER_ZONES.map(tile => tile.id)))
      expect(command.payload).toMatchObject({ tileId: portal.toTileId, ...portal.arrival })
    }
  })
  it('rejects ungenerated frontiers even at a valid portal and admits generated round trips', () => {
    for (const tile of FRONTIER_ZONES) {
      const world = getRegionGeometry(tile.id)!, back = world.portals[0]!, origin = getRegionGeometry(back.toTileId)!
      const portal = origin.portals.find(p => p.toTileId === tile.id)!
      const at = position({ tileId: origin.tileId, x: portal.x, z: portal.z })
      expect(() => evaluate(intent('transition', { toTileId: tile.id }), at, map(['t_salt_marsh']))).toThrow('available adjacent')
      const generated = map(['t_salt_marsh'], FRONTIER_ZONES.map(t => t.id))
      const enter = evaluate(intent('transition', { toTileId: tile.id }), at, generated)
      expect(enter.payload).toMatchObject({ tileId: tile.id, ...portal.arrival })
      const leave = evaluate(intent('transition', { toTileId: origin.tileId }), position({ tileId: tile.id, ...portal.arrival }), generated)
      expect(leave.payload).toMatchObject({ tileId: origin.tileId, x: portal.x, z: portal.z })
      const events = [commit(enter, 1), commit(leave, 2)], restored = new PlayerWorldProjection()
      restored.rebuildFromEvents(events)
      expect(restored.get(alice)).toMatchObject({ tileId: origin.tileId, x: portal.x, z: portal.z })
    }
  })
})

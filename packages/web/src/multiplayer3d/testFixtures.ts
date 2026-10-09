import type { AccountProfile, PlayerWorldSnapshot } from './types'

/** Synthetic exact-protocol fixture. No actual accounts or game progress. */
export const profileFixture = (): AccountProfile => ({ accountId: 1, username: 'traveler', email: null, nickname: null, avatar: 'tide', displayName: '旅人甲', role: 'player', createdAt: 1 })
export const snapshotFixture = (revision = 1, movementStep = 1): PlayerWorldSnapshot => ({
  version: 1, worldId: 'canonical-world', selfId: 1, tileId: 't_dock', revision, presenceRevision: 1, movementStep, worldTick: 3,
  players: [{ accountId: 1, tileId: 't_dock', x: 0, z: -6, movementStep: -1, sequence: 1, online: true, harborProgress: { status: 'ready', supplies: 1, rewards: 0 } },
    { accountId: 2, tileId: 't_dock', x: 2, z: -6, movementStep: 0, sequence: 2, online: true, harborProgress: { status: 'ready', supplies: 1, rewards: 0 } }],
  harborProgress: { status: 'ready', supplies: 1, rewards: 0 },
  beacon: { id: 'harbor-beacon-1', tileId: 't_dock', x: 0, z: 6, radius: 2.5, required: 2, participationWindowTicks: 300, tick: 0, tickMs: 100, closesAtTick: null, contributors: [], awardedAccountIds: [], completed: false, phase: 'gathering' },
  messages: [],
  npcs: [{ id: 'npc-a', name: { zh: '港口旅人', en: 'Harbor traveler' }, color: 0x3c8c87, location: 't_dock', activity: 'idle', subCol: 7, subRow: 3, subZ: 0, presentationPosition: { x: 0, z: 0 } }],
  geometry: { tileId: 't_dock', presentation: 'harbor-3d', minX: -12, maxX: 12, minZ: -10, maxZ: 18, playerRadius: .35, movePerStep: .4, spawn: { x: 0, z: -6 }, obstacles: [], portals: [{ x: 0, z: 16, radius: .8, toTileId: 't_central', arrival: { x: 7, z: 9 } }] },
  map: {
    regions: [
      { id: 't_dock', name: '碼頭區', x: 3, y: 5, biome: 'water', available: true, generated: false, geometrySupported: true },
      { id: 't_central', name: '夜潮區', x: 4, y: 3, biome: 'grass', available: true, generated: false, geometrySupported: true },
      { id: 't_forest', name: '潮見丘', x: 1, y: 1, biome: 'forest', available: true, generated: false, geometrySupported: false },
      { id: 't_salt_marsh', name: '鹽沼外環', x: 8, y: 5, biome: 'water', available: false, generated: false, geometrySupported: false },
    ],
    adjacency: { t_dock: ['t_central'], t_central: ['t_dock', 't_forest'], t_forest: ['t_central'] },
    edges: [{ fromTileId: 't_dock', toTileId: 't_central', crossingType: 'water-crossing', available: true }],
    regionOnlineCounts: { t_dock: 2 }
  }
})

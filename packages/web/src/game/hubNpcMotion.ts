import type { MapNpc } from './MapScene'

export type HubNpcMotionMode = 'route-loop' | 'local-stroll' | 'still'

export function hubNpcMotionMode(npc: Pick<MapNpc, 'activity' | 'travelRoute'>): HubNpcMotionMode {
  if (npc.travelRoute || npc.activity === 'move') return 'route-loop'
  if (npc.activity === 'sleep') return 'still'
  return 'local-stroll'
}

export function deterministicHubNpcMotionSeed(npcId: string): number {
  let hash = 2166136261
  for (const ch of npcId) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

import type { SimulationRuntime, NarrativeEvent } from '../sim/runtime.js'
export const privateValue = 'PRIVATE-CREDENTIAL-DIALOGUE-PLAN'
export function publicReadTestRuntime() {
  const events: NarrativeEvent[] = [
    { sequence: 1, tick: 1, eventType: 'WEATHER_CHANGE', actorId: 'system', occurredAt: '2026-01-01T00:00:00Z', payload: { data: { from: '晴', to: '驟雨', token: privateValue }, motivation: privateValue }, narration: '天空從晴轉為驟雨。' },
    { sequence: 2, tick: 2, eventType: 'NPC_PLAYER_DIALOGUE', actorId: '42', occurredAt: '2026-01-01T00:00:00Z', payload: { playerMessage: privateValue }, narration: privateValue },
    { sequence: 3, tick: 3, eventType: 'WORLD_EVENT_AI_NARRATION', actorId: 'system', occurredAt: '2026-01-01T00:00:00Z', payload: {}, narration: privateValue },
  ]
  const npc = { id: 'npc-one', name: { zh: '旅人', en: 'Traveler' }, role: { zh: '街坊', en: 'Neighbor' }, location: 't_dock', relationshipScore: 45, lastActedTick: 1,
    internalState: { agent: privateValue }, activity: 'idle', mood: 80, health: 100, faction: 'civilian', targetTile: 't_forest', subCol: 7, subRow: 5, subZ: 0, buildingId: null,
    travelRoute: null, color: 123, greetLine: { zh: '你好', en: 'Hello' }, intentLine: { zh: privateValue, en: privateValue }, life: { narration: privateValue },
    cognitiveLine: { zh: privateValue, en: privateValue }, cognitiveEvolution: { reflection: privateValue }, civic: { plan: privateValue }, deceased: false, recentUtterance: { text: privateValue }, relationshipAction: { accountId: 42, text: privateValue } }
  const eventListeners = new Set<(event: NarrativeEvent) => void>(), tickListeners = new Set<() => void>()
  const runtime = {
    getSnapshot: () => ({ tick: 10, lastSequence: 3, eventCount: 3, npcCount: 1, facts: { weather: '晴', season: '春', rareWindowOpen: false, rareWindowClosesAtTick: null,
      npcAgent: privateValue, npcRumors: [{ content: privateValue }], goodsInventory: [{ holderType: 'player', holderId: '42', token: privateValue }], lifeExpansion: { unlockedTileIds: ['t_dock'], unlockedBuildingIds: [], households: privateValue,
        constructionProjects: { one: { projectId: 'one', targetTileId: 't_dock', progress: 2, secret: privateValue } } } },
      worldCivilization: { goals: [{ goalId: 'world-goal', domain: 'ecology', title: 'Public goal', rationale: privateValue, targetProgress: 10, progress: 2, declaredAtTick: 1, completed: false, completedAtTick: null }], technologies: [] },
      worldConfig: { tickDurationMs: 5000, ticksPerDay: 17280, timezone: 'Asia/Taipei', timezoneOffsetMinutes: 480, secret: privateValue }, tickCommandStats: { lastTick: 2, peak: 3, softCap: 4, softCapHitCount: 0, secret: privateValue }, npcPartition: { activeCount: 1, totalCount: 1, period: 2 }, generatedAt: '2026-01-01T00:00:00Z' }),
    getActiveWorldEvents: () => [{ id: 'public-weather', templateId: 'weather.storm', type: 'weather', scope: { kind: 'world' }, startedAtTick: 1, endsAtTick: 10, text: { zh: '暴風雨', en: 'Storm' }, payload: { effect: 'storm', surfaceMovementPenalty: 0.2, apiKey: privateValue } }],
    getAreaStates: () => [{ tileId: 't_dock', factionControl: { guild: 10, civilian: 90, secret: privateValue }, dominantFaction: 'civilian', resources: { food: 50, safety: 60, economy: 70, secret: privateValue }, lastUpdatedTick: 10, pressureCooldowns: privateValue }],
    getNpcs: () => [npc], getInProgressConstructionProjects: () => [{ projectId: 'one', builderNpcIds: ['npc-one'] }], getRecentEvents: () => events.slice().reverse(), getCurrentTick: () => 10, isRareWindowOpen: () => false,
    getMap: () => ({ width: 9, height: 6, secret: privateValue, tiles: [{ id: 't_dock', name: '碼頭', x: 3, y: 5, biome: 'water', npcIds: ['npc-one'], secret: privateValue }], regions: [{ id: 't_dock', name: '碼頭', x: 3, y: 5, biome: 'water', available: true, generated: false, secret: privateValue }], adjacency: { t_dock: [] }, edges: [] }),
    getCardCatalog: () => ({ version: 'test', secret: privateValue, entries: [{ id: 1, rank: 'D', category: '潮源系', nameZh: '潮', nameEn: 'Tide', description: 'Public card', story: 'Public lore', maxCopies: 10, acquisitionMethod: 'random_drop', acquisitionDetail: 'Discovery', effectDescription: 'Effect', discoveryRuleId: 'discovery', restrictionRuleId: 'restriction', secret: privateValue }] }),
    subscribe: (listener: (event: NarrativeEvent) => void) => { eventListeners.add(listener); return () => eventListeners.delete(listener) },
    subscribeTick: (listener: () => void) => { tickListeners.add(listener); return () => tickListeners.delete(listener) },
  } as unknown as SimulationRuntime
  return { runtime, npc, events, eventListeners, tickListeners }
}

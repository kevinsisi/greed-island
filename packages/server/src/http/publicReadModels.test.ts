import { describe, expect, it } from 'vitest'
import { publicWorldSnapshot, publicNpc, publicMap, publicCatalog, publicNarrativeEvent, publicActiveEvent } from './publicReadModels.js'
import { publicReadTestRuntime, privateValue } from './publicReadModels.testSupport.js'
describe('public projection field allowlists', () => {
  it('keeps real world/map/catalog values and excludes unknown/private nested facts', () => {
    const { runtime } = publicReadTestRuntime()
    const world = publicWorldSnapshot(runtime)
    expect(world.facts).toMatchObject({ weather: '晴' }); expect(world.facts.areaStates[0]!.resources.food).toBe(50)
    expect(world.worldConfig.tickDurationMs).toBe(5000)
    expect(publicMap(runtime).tiles[0]!.npcIds).toEqual(['npc-one'])
    expect(publicCatalog(runtime).entries[0]!.id).toBe(1)
    expect(JSON.stringify([world, publicMap(runtime), publicCatalog(runtime)])).not.toContain(privateValue)
  })
  it('exposes display/physical NPC state but no agent thoughts, plans, private utterances or account relationship actions', () => {
    const { npc } = publicReadTestRuntime(), dto = publicNpc(npc as never)
    expect(dto.relationshipScore).toBe(45); expect(dto.internalState).toEqual({})
    expect(dto.greetLine.zh).toBe('你好'); expect(dto.subCol).toBe(7)
    expect(JSON.stringify(dto)).not.toContain(privateValue)
    for (const key of ['life','cognitiveLine','cognitiveEvolution','recentUtterance','relationshipAction','intentLine','targetTile']) expect(dto).not.toHaveProperty(key)
  })
  it('filters whole private/unknown/AI events and strips payload identity/credentials from reviewed world types', () => {
    const { runtime, events } = publicReadTestRuntime()
    expect(publicNarrativeEvent(events[0]!, runtime)?.payload).toEqual({ from: '晴', to: '驟雨' })
    expect(publicNarrativeEvent(events[1]!, runtime)).toBeNull(); expect(publicNarrativeEvent(events[2]!, runtime)).toBeNull()
    expect(publicNarrativeEvent({ ...events[0]!, actorId: '42' }, runtime)).toBeNull()
    expect(publicNarrativeEvent({ ...events[0]!, eventType: 'FUTURE_WORLD_PRIVATE_TYPE' }, runtime)).toBeNull()
    expect(publicActiveEvent({ ...runtime.getActiveWorldEvents()[0]!, templateId: 'unknown-private-template' })).toBeNull()
  })
})

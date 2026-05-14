import { describe, expect, it } from 'vitest'
import { planFestivalSeed, planRitualSeed, planNormSeed } from './culturalSeeders.js'
import { CulturalElementProjection } from '../projections/culturalElement.js'
import { SkillXpProjection } from '../projections/skillXp.js'
import { CULTURAL_FESTIVAL_THRESHOLD, CULTURAL_NORM_NPC_THRESHOLD, SKILL_XP_LEVEL_THRESHOLD } from '../config/world.js'
import type { NpcProfile } from '../npcs/types.js'
import type { BuildingDef } from '../buildings/types.js'
import type { Event } from '../kernel/types.js'

// ---- helpers ----

let seq = 0
function makeEvent(eventType: string, data: Record<string, unknown>): Event {
  const s = ++seq
  return {
    sequence: s, eventId: `ev-${s}`, eventType, actorId: 'system',
    occurredAt: 0, tick: s,
    payload: { actorType: 'system', data, narration: null },
    deterministicKey: `k-${s}`, version: 1,
  }
}

function observedSkillEvent(npcId: string, skillId: string, xpDelta = SKILL_XP_LEVEL_THRESHOLD): Event {
  return makeEvent('NPC_OBSERVED_SKILL', { npcId, skillId, sourceEventType: 'ANIMAL_HUNT_RESOLVED', tick: seq, xpDelta })
}

function projWithCounters(count: number): CulturalElementProjection {
  const proj = new CulturalElementProjection()
  for (let i = 0; i < count; i++) {
    proj.project(makeEvent('RARE_WINDOW_OPEN', { windowId: 'tide_festival', closesAtTick: 100 }))
  }
  return proj
}

function npcProfile(factionLean: string): NpcProfile {
  return {
    id: 'npc_test',
    name: { zh: '測試', en: 'Test' },
    homeAreaId: 't_temple',
    spawnTileId: 't_temple',
    role: 'cleric',
    personality: { factionLean, archetype: 'cleric' },
    backstory: '',
    dialogue: {},
    routineSlots: [],
  } as unknown as NpcProfile
}

function building(tags?: string[]): BuildingDef {
  return {
    id: 'b_temple_shrine',
    tileId: 't_temple',
    nameZh: '霓港神社',
    nameEn: 'Niport Shrine',
    descriptionZh: '',
    type: 'temple',
    placement: { col: 0, row: 0, glyph: '⛩', size: 24 },
    interior: { cols: 10, rows: 6, props: [] },
    ownerNpcId: null,
    hiring: [],
    enterable: true,
    restorative: false,
    ...(tags !== undefined ? { tags } : {}),
  } as BuildingDef
}

// ---- planFestivalSeed ----

describe('planFestivalSeed', () => {
  it('returns null when counter is below threshold', () => {
    const proj = projWithCounters(CULTURAL_FESTIVAL_THRESHOLD - 1)
    expect(planFestivalSeed(proj, { windowId: 'tide_festival' }, 100)).toBeNull()
  })

  it('emits CULTURAL_FESTIVAL_FORMED when counter reaches threshold', () => {
    const proj = projWithCounters(CULTURAL_FESTIVAL_THRESHOLD)
    const cmd = planFestivalSeed(proj, { windowId: 'tide_festival' }, 100)
    expect(cmd).not.toBeNull()
    expect(cmd?.commandType).toBe('CULTURAL_FESTIVAL_FORMED')
    const p = cmd?.payload as { windowId: string; tileId: string; occurrenceCount: number }
    expect(p.windowId).toBe('tide_festival')
    expect(p.tileId).toBe('t_temple')
    expect(p.occurrenceCount).toBe(CULTURAL_FESTIVAL_THRESHOLD)
  })

  it('returns null when festival already exists (no re-emit)', () => {
    const proj = projWithCounters(CULTURAL_FESTIVAL_THRESHOLD)
    // simulate festival already formed
    proj.project(makeEvent('CULTURAL_FESTIVAL_FORMED', {
      windowId: 'tide_festival', tileId: 't_temple',
      occurrenceCount: CULTURAL_FESTIVAL_THRESHOLD, formedAtTick: 50, narration: '',
    }))
    expect(planFestivalSeed(proj, { windowId: 'tide_festival' }, 100)).toBeNull()
  })

  it('returns null for unknown windowId', () => {
    const proj = projWithCounters(CULTURAL_FESTIVAL_THRESHOLD + 5)
    expect(planFestivalSeed(proj, { windowId: 'unknown_window' }, 100)).toBeNull()
  })
})

// ---- planRitualSeed ----

describe('planRitualSeed', () => {
  const event = { npcId: 'npc_cleric', buildingId: 'b_temple_shrine', tileId: 't_temple' }

  it('emits CULTURAL_RITUAL_PERFORMED for qualifying entry', () => {
    const cmd = planRitualSeed(event, npcProfile('temple'), building(['ritual_site']), true, 50)
    expect(cmd).not.toBeNull()
    expect(cmd?.commandType).toBe('CULTURAL_RITUAL_PERFORMED')
    const p = cmd?.payload as { npcId: string; factionLean: string }
    expect(p.npcId).toBe('npc_cleric')
    expect(p.factionLean).toBe('temple')
  })

  it('emits for monastic faction too', () => {
    const cmd = planRitualSeed(event, npcProfile('monastic'), building(['ritual_site']), true, 50)
    expect(cmd?.commandType).toBe('CULTURAL_RITUAL_PERFORMED')
  })

  it('returns null when rare window is closed', () => {
    expect(planRitualSeed(event, npcProfile('temple'), building(['ritual_site']), false, 50)).toBeNull()
  })

  it('returns null when building has no ritual_site tag', () => {
    expect(planRitualSeed(event, npcProfile('temple'), building([]), true, 50)).toBeNull()
    expect(planRitualSeed(event, npcProfile('temple'), building(), true, 50)).toBeNull()
  })

  it('returns null when NPC faction does not qualify', () => {
    expect(planRitualSeed(event, npcProfile('guild'), building(['ritual_site']), true, 50)).toBeNull()
    expect(planRitualSeed(event, npcProfile('civilian'), building(['ritual_site']), true, 50)).toBeNull()
  })

  it('returns null when npcProfile is null', () => {
    expect(planRitualSeed(event, null, building(['ritual_site']), true, 50)).toBeNull()
  })
})

// ---- planNormSeed ----

describe('planNormSeed', () => {
  function buildSkillProj(npcIds: string[], skillId: string): SkillXpProjection {
    const proj = new SkillXpProjection()
    for (const npcId of npcIds) {
      // Give each NPC exactly enough XP to reach level 1
      proj.project(observedSkillEvent(npcId, skillId))
    }
    return proj
  }

  it('emits CULTURAL_NORM_ESTABLISHED when threshold met', () => {
    const npcIds = Array.from({ length: CULTURAL_NORM_NPC_THRESHOLD }, (_, i) => `npc_${i}`)
    const skillProj = buildSkillProj(npcIds, 'fishing')
    const culturalProj = new CulturalElementProjection()
    const locations = npcIds.map((id) => ({ npcId: id, tileId: 't_salt_marsh' }))

    const cmd = planNormSeed(culturalProj, skillProj, 't_salt_marsh', 'fishing', locations, 100)
    expect(cmd).not.toBeNull()
    expect(cmd?.commandType).toBe('CULTURAL_NORM_ESTABLISHED')
    const p = cmd?.payload as { tileId: string; skillId: string; npcCount: number }
    expect(p.tileId).toBe('t_salt_marsh')
    expect(p.skillId).toBe('fishing')
    expect(p.npcCount).toBeGreaterThanOrEqual(CULTURAL_NORM_NPC_THRESHOLD)
  })

  it('returns null when fewer than threshold NPCs have level >= 1', () => {
    const npcIds = Array.from({ length: CULTURAL_NORM_NPC_THRESHOLD - 1 }, (_, i) => `npc_${i}`)
    const skillProj = buildSkillProj(npcIds, 'fishing')
    const culturalProj = new CulturalElementProjection()
    const locations = npcIds.map((id) => ({ npcId: id, tileId: 't_salt_marsh' }))

    expect(planNormSeed(culturalProj, skillProj, 't_salt_marsh', 'fishing', locations, 100)).toBeNull()
  })

  it('returns null when norm already exists (no re-emit)', () => {
    const npcIds = Array.from({ length: CULTURAL_NORM_NPC_THRESHOLD }, (_, i) => `npc_${i}`)
    const skillProj = buildSkillProj(npcIds, 'fishing')
    const culturalProj = new CulturalElementProjection()
    culturalProj.project(makeEvent('CULTURAL_NORM_ESTABLISHED', {
      tileId: 't_salt_marsh', skillId: 'fishing', npcCount: CULTURAL_NORM_NPC_THRESHOLD, formedAtTick: 50, narration: '',
    }))
    const locations = npcIds.map((id) => ({ npcId: id, tileId: 't_salt_marsh' }))

    expect(planNormSeed(culturalProj, skillProj, 't_salt_marsh', 'fishing', locations, 100)).toBeNull()
  })

  it('does not count NPCs on a different tile', () => {
    const npcIds = Array.from({ length: CULTURAL_NORM_NPC_THRESHOLD }, (_, i) => `npc_${i}`)
    const skillProj = buildSkillProj(npcIds, 'fishing')
    const culturalProj = new CulturalElementProjection()
    // All NPCs are on a different tile
    const locations = npcIds.map((id) => ({ npcId: id, tileId: 't_dock' }))

    expect(planNormSeed(culturalProj, skillProj, 't_salt_marsh', 'fishing', locations, 100)).toBeNull()
  })
})

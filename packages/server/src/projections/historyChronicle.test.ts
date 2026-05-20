import { describe, expect, it } from 'vitest'
import { HistoryChronicleProjection } from './historyChronicle.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence = 1,
): Event {
  return {
    id: `ev-${sequence}`,
    eventType,
    actorId: 'system',
    sequence,
    tick: 1,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

describe('HistoryChronicleProjection', () => {
  it('records settlement_formation arc from SETTLEMENT_FORMED', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('SETTLEMENT_FORMED', {
      settlementId: 'settlement.t_central',
      tileId: 't_central',
      formedAtTick: 10,
      founderNpcIds: ['npc.A', 'npc.B'],
    }))
    const arcs = proj.list()
    expect(arcs).toHaveLength(1)
    expect(arcs[0]).toMatchObject({
      arcId: 'arc.settlement_formation.settlement.t_central',
      arcType: 'settlement_formation',
      status: 'concluded',
      startTick: 10,
      endTick: 10,
      tileId: 't_central',
    })
    expect(arcs[0]?.involvedEntityIds).toContain('npc.A')
  })

  it('records settlement_decline arc from SETTLEMENT_DECLINED', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('SETTLEMENT_DECLINED', {
      settlementId: 'settlement.t_north',
      tileId: 't_north',
      declinedAtTick: 50,
    }))
    const arcs = proj.list()
    expect(arcs[0]).toMatchObject({
      arcType: 'settlement_decline',
      status: 'concluded',
      startTick: 50,
    })
  })

  it('records faction_seizure arc from FACTION_TILE_SEIZED', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_east',
      factionId: 'guild',
      previousFactionId: 'militia',
      seizedAtTick: 30,
    }))
    const arc = proj.list()[0]!
    expect(arc.arcType).toBe('faction_seizure')
    expect(arc.involvedEntityIds).toContain('guild')
    expect(arc.involvedEntityIds).toContain('militia')
    expect(arc.narrationZh).toContain('前任')
  })

  it('tracks npc_mortality_lineage: deceased then heir assigned concludes arc', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('NPC_DECEASED', { npcId: 'npc.elder', deceasedAtTick: 100, tileId: 't_central' }, 1))
    const active = proj.list()[0]!
    expect(active.status).toBe('active')
    expect(active.arcType).toBe('npc_mortality_lineage')

    proj.project(makeEvent('NPC_HEIR_ASSIGNED', { deceasedNpcId: 'npc.elder', heirNpcId: 'npc.youth', assignedAtTick: 102 }, 2))
    const concluded = proj.list()[0]!
    expect(concluded.status).toBe('concluded')
    expect(concluded.involvedEntityIds).toContain('npc.youth')
    expect(concluded.narrationZh).toContain('繼承')
  })

  it('tracks npc_mortality_lineage: no heir concludes arc with no-heir narration', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('NPC_DECEASED', { npcId: 'npc.loner', deceasedAtTick: 200 }, 1))
    proj.project(makeEvent('NPC_HEIR_ASSIGNED', { deceasedNpcId: 'npc.loner', heirNpcId: null, assignedAtTick: 201 }, 2))
    const arc = proj.list()[0]!
    expect(arc.status).toBe('concluded')
    expect(arc.narrationZh).toContain('無人繼承')
  })

  it('tracks ecological_collapse: warning opens, recovered concludes', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('SPECIES_EXTINCTION_WARNING', { speciesId: 'deer', tileId: 't_forest', tick: 60 }, 1))
    expect(proj.list()[0]?.status).toBe('active')

    proj.project(makeEvent('SPECIES_RECOVERED', { speciesId: 'deer' }, 2))
    expect(proj.list()[0]?.status).toBe('concluded')
  })

  it('tracks species_extinction: SPECIES_EXTINCT concludes collapse + opens extinction arc', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('SPECIES_EXTINCTION_WARNING', { speciesId: 'wolf', tick: 80 }, 1))
    proj.project(makeEvent('SPECIES_EXTINCT', { speciesId: 'wolf', lastSeenTick: 90 }, 2))
    const arcs = proj.list()
    const collapseArc = arcs.find((a) => a.arcType === 'ecological_collapse')!
    const extArc = arcs.find((a) => a.arcType === 'species_extinction')!
    expect(collapseArc.status).toBe('concluded')
    expect(extArc.status).toBe('concluded')
    expect(extArc.startTick).toBe(90)
  })

  it('tracks fishery ecological_collapse', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('FISHERY_COLLAPSED', { tileId: 't_coast', collapsedAtTick: 120 }, 1))
    expect(proj.list()[0]?.status).toBe('active')

    proj.project(makeEvent('FISHERY_RECOVERED', { tileId: 't_coast', recoveredAtTick: 150 }, 2))
    const arc = proj.list()[0]!
    expect(arc.status).toBe('concluded')
    expect(arc.endTick).toBe(150)
  })

  it('records great_migration arc from MIGRATION_WAVE_STARTED', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('MIGRATION_WAVE_STARTED', {
      waveId: 'wave.1',
      speciesId: 'deer',
      fromTileId: 't_north',
      toTileId: 't_south',
      startedAtTick: 40,
    }))
    const arc = proj.list()[0]!
    expect(arc.arcType).toBe('great_migration')
    expect(arc.involvedEntityIds).toContain('deer')
    expect(arc.involvedEntityIds).toContain('t_south')
  })

  it('tracks legendary_hunt: started then concluded', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('LEGENDARY_HUNT_STARTED', {
      worldEventId: 'we.hunt.1',
      linkedAnimalId: 'animal.boss',
      tileId: 't_mountains',
      hunterNpcIds: ['npc.hunter1'],
      startedAtTick: 200,
    }, 1))
    expect(proj.list()[0]?.status).toBe('active')

    proj.project(makeEvent('LEGENDARY_HUNT_CONCLUDED', {
      worldEventId: 'we.hunt.1',
      concludedAtTick: 250,
      outcome: 'killed',
    }, 2))
    const arc = proj.list()[0]!
    expect(arc.status).toBe('concluded')
    expect(arc.endTick).toBe(250)
    expect(arc.narrationZh).toContain('獵人取得勝利')
  })

  it('getByType filters by arc type', () => {
    const proj = new HistoryChronicleProjection()
    proj.project(makeEvent('SETTLEMENT_FORMED', { settlementId: 's1', tileId: 't1', formedAtTick: 1 }, 1))
    proj.project(makeEvent('FACTION_TILE_SEIZED', { tileId: 't2', factionId: 'guild', seizedAtTick: 2 }, 2))
    expect(proj.getByType('settlement_formation')).toHaveLength(1)
    expect(proj.getByType('faction_seizure')).toHaveLength(1)
    expect(proj.getByType('legendary_hunt')).toHaveLength(0)
  })

  it('rebuildFromEvents produces same state as incremental projection', () => {
    const events: Event[] = [
      makeEvent('SETTLEMENT_FORMED', { settlementId: 's1', tileId: 't1', formedAtTick: 1 }, 1),
      makeEvent('NPC_DECEASED', { npcId: 'npc.x', deceasedAtTick: 5 }, 2),
      makeEvent('NPC_HEIR_ASSIGNED', { deceasedNpcId: 'npc.x', heirNpcId: null, assignedAtTick: 6 }, 3),
    ]
    const incremental = new HistoryChronicleProjection()
    for (const ev of events) incremental.project(ev)

    const rebuilt = new HistoryChronicleProjection()
    rebuilt.rebuildFromEvents(events)

    expect(rebuilt.canonicalHash()).toBe(incremental.canonicalHash())
  })
})

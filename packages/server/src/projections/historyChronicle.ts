// Phase 5 §40.4 — History Chronicle Projection (Layer 5 Perception Runtime).
// Detects narrative arcs from event sequences in the EventLog.
// Arcs are deterministic — no AI generation here. AI phrases them at render time.

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type HistoryArcType =
  | 'settlement_formation'
  | 'settlement_decline'
  | 'faction_seizure'
  | 'npc_mortality_lineage'
  | 'ecological_collapse'
  | 'species_extinction'
  | 'great_migration'
  | 'legendary_hunt'

export type HistoryArcStatus = 'active' | 'concluded'

export type HistoryArc = Readonly<{
  arcId: string
  arcType: HistoryArcType
  status: HistoryArcStatus
  startTick: number
  endTick: number | null
  tileId: string | null
  involvedEntityIds: readonly string[]
  narrationZh: string
  lastSequence: number
}>

export const HISTORY_CHRONICLE_BOOT_EVENT_TYPES = [
  'SETTLEMENT_FORMED',
  'SETTLEMENT_DECLINED',
  'FACTION_TILE_SEIZED',
  'FACTION_DOMINANCE_SHIFTED',
  'NPC_DECEASED',
  'NPC_HEIR_ASSIGNED',
  'SPECIES_EXTINCTION_WARNING',
  'SPECIES_EXTINCT',
  'SPECIES_RECOVERED',
  'FISHERY_COLLAPSED',
  'FISHERY_RECOVERED',
  'FOREST_DEPLETED',
  'BIOME_RECOVERED',
  'MIGRATION_WAVE_STARTED',
  'LEGENDARY_HUNT_STARTED',
  'LEGENDARY_HUNT_CONCLUDED',
] as const

export class HistoryChronicleProjection {
  private arcs = new Map<string, HistoryArc>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.arcs = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    const p = readData(event)
    if (!p) return

    switch (event.eventType) {
      case 'SETTLEMENT_FORMED': {
        const { settlementId, tileId, formedAtTick, founderNpcIds } = p as {
          settlementId?: string; tileId?: string; formedAtTick?: number; founderNpcIds?: string[]
        }
        if (!str(settlementId) || !str(tileId) || !int(formedAtTick)) return
        const arcId = `arc.settlement_formation.${settlementId}`
        this.arcs.set(arcId, {
          arcId,
          arcType: 'settlement_formation',
          status: 'concluded',
          startTick: formedAtTick!,
          endTick: formedAtTick!,
          tileId: tileId!,
          involvedEntityIds: [settlementId!, ...(Array.isArray(founderNpcIds) ? founderNpcIds : [])],
          narrationZh: `${tileId} 的聚落「${settlementId}」在第 ${formedAtTick} 刻正式成立。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'SETTLEMENT_DECLINED': {
        const { settlementId, tileId, declinedAtTick } = p as {
          settlementId?: string; tileId?: string; stability?: number; declinedAtTick?: number
        }
        if (!str(settlementId) || !str(tileId) || !int(declinedAtTick)) return
        const arcId = `arc.settlement_decline.${settlementId}.${declinedAtTick}`
        this.arcs.set(arcId, {
          arcId,
          arcType: 'settlement_decline',
          status: 'concluded',
          startTick: declinedAtTick!,
          endTick: declinedAtTick!,
          tileId: tileId!,
          involvedEntityIds: [settlementId!],
          narrationZh: `${tileId} 的聚落「${settlementId}」在第 ${declinedAtTick} 刻陷入衰退。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'FACTION_TILE_SEIZED': {
        const { tileId, factionId, previousFactionId, seizedAtTick } = p as {
          tileId?: string; factionId?: string; previousFactionId?: string | null; seizedAtTick?: number
        }
        if (!str(tileId) || !str(factionId) || !int(seizedAtTick)) return
        const arcId = `arc.faction_seizure.${tileId}.${seizedAtTick}`
        const entities = [factionId!, ...(previousFactionId ? [previousFactionId] : [])]
        this.arcs.set(arcId, {
          arcId,
          arcType: 'faction_seizure',
          status: 'concluded',
          startTick: seizedAtTick!,
          endTick: seizedAtTick!,
          tileId: tileId!,
          involvedEntityIds: entities,
          narrationZh: previousFactionId
            ? `${factionId} 在第 ${seizedAtTick} 刻奪取了 ${tileId} 的主導權（前任：${previousFactionId}）。`
            : `${factionId} 在第 ${seizedAtTick} 刻確立了 ${tileId} 的初始主導權。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'NPC_DECEASED': {
        const { npcId, deceasedAtTick, tileId } = p as {
          npcId?: string; deceasedAtTick?: number; tileId?: string
        }
        if (!str(npcId) || !int(deceasedAtTick)) return
        const arcId = `arc.npc_mortality.${npcId}`
        this.arcs.set(arcId, {
          arcId,
          arcType: 'npc_mortality_lineage',
          status: 'active',
          startTick: deceasedAtTick!,
          endTick: null,
          tileId: tileId ?? null,
          involvedEntityIds: [npcId!],
          narrationZh: `${npcId} 在第 ${deceasedAtTick} 刻離世。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'NPC_HEIR_ASSIGNED': {
        const { deceasedNpcId, heirNpcId, assignedAtTick } = p as {
          deceasedNpcId?: string; heirNpcId?: string | null; assignedAtTick?: number
        }
        if (!str(deceasedNpcId) || !int(assignedAtTick)) return
        const arcId = `arc.npc_mortality.${deceasedNpcId}`
        const existing = this.arcs.get(arcId)
        const baseEntities = existing?.involvedEntityIds ?? [deceasedNpcId!]
        const entities = heirNpcId
          ? [...baseEntities, heirNpcId].filter((v, i, a) => a.indexOf(v) === i)
          : [...baseEntities]
        const narrationZh = heirNpcId
          ? `${heirNpcId} 繼承了 ${deceasedNpcId} 的衣缽，血脈延續。`
          : `${deceasedNpcId} 孤身離世，無人繼承。`
        this.arcs.set(arcId, {
          arcId,
          arcType: 'npc_mortality_lineage',
          status: 'concluded',
          startTick: existing?.startTick ?? assignedAtTick!,
          endTick: assignedAtTick!,
          tileId: existing?.tileId ?? null,
          involvedEntityIds: entities,
          narrationZh,
          lastSequence: event.sequence,
        })
        break
      }

      case 'SPECIES_EXTINCTION_WARNING': {
        const { speciesId, tileId, tick } = p as { speciesId?: string; tileId?: string; tick?: number }
        if (!str(speciesId) || !int(tick)) return
        const arcId = `arc.ecological_collapse.${speciesId}`
        const existing = this.arcs.get(arcId)
        if (existing?.status === 'concluded') return
        this.arcs.set(arcId, {
          arcId,
          arcType: 'ecological_collapse',
          status: 'active',
          startTick: existing?.startTick ?? tick!,
          endTick: null,
          tileId: tileId ?? null,
          involvedEntityIds: [speciesId!],
          narrationZh: `物種「${speciesId}」在第 ${tick} 刻發出滅絕警報。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'SPECIES_EXTINCT': {
        const { speciesId, lastSeenTick } = p as { speciesId?: string; lastSeenTick?: number }
        if (!str(speciesId) || !int(lastSeenTick)) return
        // conclude the collapse arc
        const collapseId = `arc.ecological_collapse.${speciesId}`
        const collapse = this.arcs.get(collapseId)
        if (collapse) {
          this.arcs.set(collapseId, {
            ...collapse,
            status: 'concluded',
            endTick: lastSeenTick!,
            lastSequence: event.sequence,
          })
        }
        // open extinction arc
        const extArcId = `arc.species_extinction.${speciesId}`
        this.arcs.set(extArcId, {
          arcId: extArcId,
          arcType: 'species_extinction',
          status: 'concluded',
          startTick: lastSeenTick!,
          endTick: lastSeenTick!,
          tileId: null,
          involvedEntityIds: [speciesId!],
          narrationZh: `物種「${speciesId}」在第 ${lastSeenTick} 刻從世界消失。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'SPECIES_RECOVERED': {
        const { speciesId } = p as { speciesId?: string }
        if (!str(speciesId)) return
        const collapseId = `arc.ecological_collapse.${speciesId}`
        const collapse = this.arcs.get(collapseId)
        if (collapse?.status === 'active') {
          this.arcs.set(collapseId, {
            ...collapse,
            status: 'concluded',
            narrationZh: `物種「${speciesId}」的數量在崩潰後逐漸恢復。`,
            lastSequence: event.sequence,
          })
        }
        break
      }

      case 'FISHERY_COLLAPSED': {
        const { tileId, collapsedAtTick } = p as { tileId?: string; collapsedAtTick?: number }
        if (!str(tileId) || !int(collapsedAtTick)) return
        const arcId = `arc.ecological_collapse.fishery.${tileId}`
        const existing = this.arcs.get(arcId)
        if (existing?.status === 'concluded') return
        this.arcs.set(arcId, {
          arcId,
          arcType: 'ecological_collapse',
          status: 'active',
          startTick: collapsedAtTick!,
          endTick: null,
          tileId: tileId!,
          involvedEntityIds: [`fishery:${tileId}`],
          narrationZh: `${tileId} 的漁場在第 ${collapsedAtTick} 刻崩潰。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'FISHERY_RECOVERED': {
        const { tileId, recoveredAtTick } = p as { tileId?: string; recoveredAtTick?: number }
        if (!str(tileId) || !int(recoveredAtTick)) return
        const arcId = `arc.ecological_collapse.fishery.${tileId}`
        const arc = this.arcs.get(arcId)
        if (arc?.status === 'active') {
          this.arcs.set(arcId, {
            ...arc,
            status: 'concluded',
            endTick: recoveredAtTick!,
            narrationZh: `${tileId} 的漁場在第 ${recoveredAtTick} 刻逐漸恢復生機。`,
            lastSequence: event.sequence,
          })
        }
        break
      }

      case 'FOREST_DEPLETED': {
        const { tileId, depletedAtTick } = p as { tileId?: string; depletedAtTick?: number }
        if (!str(tileId) || !int(depletedAtTick)) return
        const arcId = `arc.ecological_collapse.forest.${tileId}`
        const existing = this.arcs.get(arcId)
        if (existing?.status === 'concluded') return
        this.arcs.set(arcId, {
          arcId,
          arcType: 'ecological_collapse',
          status: 'active',
          startTick: existing?.startTick ?? depletedAtTick!,
          endTick: null,
          tileId: tileId!,
          involvedEntityIds: [`forest:${tileId}`],
          narrationZh: `${tileId} 的森林於第 ${depletedAtTick} 刻因過度開發走向衰竭。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'BIOME_RECOVERED': {
        const { tileId, tick } = p as { tileId?: string; tick?: number }
        if (!str(tileId) || !int(tick)) return
        const arcId = `arc.ecological_collapse.forest.${tileId}`
        const arc = this.arcs.get(arcId)
        if (arc?.status === 'active') {
          this.arcs.set(arcId, {
            ...arc,
            status: 'concluded',
            endTick: tick!,
            narrationZh: `${tileId} 的生態系統於第 ${tick} 刻恢復穩定。`,
            lastSequence: event.sequence,
          })
        }
        break
      }

      case 'FACTION_DOMINANCE_SHIFTED': {
        const { losingFactionId, dominantFactionId, tick } = p as {
          losingFactionId?: string; dominantFactionId?: string | null; tick?: number
        }
        if (!str(losingFactionId) || !int(tick)) return
        const arcId = `arc.faction_seizure.dominance.${losingFactionId}.${tick}`
        const entities = [losingFactionId!, ...(dominantFactionId ? [dominantFactionId] : [])]
        this.arcs.set(arcId, {
          arcId,
          arcType: 'faction_seizure',
          status: 'concluded',
          startTick: tick!,
          endTick: tick!,
          tileId: null,
          involvedEntityIds: entities,
          narrationZh: dominantFactionId
            ? `${losingFactionId} 在第 ${tick} 刻失去所有領地，${dominantFactionId} 取得主導地位。`
            : `${losingFactionId} 在第 ${tick} 刻失去所有領地，退出歷史舞台。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'MIGRATION_WAVE_STARTED': {
        const { waveId, speciesId, fromTileId, toTileId, startedAtTick } = p as {
          waveId?: string; speciesId?: string; fromTileId?: string; toTileId?: string; startedAtTick?: number
        }
        if (!str(speciesId) || !int(startedAtTick)) return
        const arcId = `arc.great_migration.${waveId ?? speciesId}.${startedAtTick}`
        this.arcs.set(arcId, {
          arcId,
          arcType: 'great_migration',
          status: 'concluded',
          startTick: startedAtTick!,
          endTick: startedAtTick!,
          tileId: fromTileId ?? null,
          involvedEntityIds: [speciesId!, ...(toTileId ? [toTileId] : [])],
          narrationZh: `物種「${speciesId}」在第 ${startedAtTick} 刻從 ${fromTileId ?? '？'} 向 ${toTileId ?? '？'} 遷移。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'LEGENDARY_HUNT_STARTED': {
        const { worldEventId, linkedAnimalId, tileId, hunterNpcIds, startedAtTick } = p as {
          worldEventId?: string; linkedAnimalId?: string; tileId?: string
          hunterNpcIds?: string[]; startedAtTick?: number
        }
        if (!str(worldEventId) || !int(startedAtTick)) return
        const arcId = `arc.legendary_hunt.${worldEventId}`
        this.arcs.set(arcId, {
          arcId,
          arcType: 'legendary_hunt',
          status: 'active',
          startTick: startedAtTick!,
          endTick: null,
          tileId: tileId ?? null,
          involvedEntityIds: [
            ...(linkedAnimalId ? [linkedAnimalId] : []),
            ...(Array.isArray(hunterNpcIds) ? hunterNpcIds : []),
          ],
          narrationZh: `傳奇獵殺在第 ${startedAtTick} 刻於 ${tileId ?? '？'} 展開。`,
          lastSequence: event.sequence,
        })
        break
      }

      case 'LEGENDARY_HUNT_CONCLUDED': {
        const { worldEventId, concludedAtTick, outcome } = p as {
          worldEventId?: string; concludedAtTick?: number; outcome?: string
        }
        if (!str(worldEventId) || !int(concludedAtTick)) return
        const arcId = `arc.legendary_hunt.${worldEventId}`
        const arc = this.arcs.get(arcId)
        const outcomeZh = outcome === 'killed' ? '獵人取得勝利' : outcome === 'migrated' ? '生物遷離戰場' : '生物力竭而亡'
        this.arcs.set(arcId, {
          ...(arc ?? {
            arcId,
            arcType: 'legendary_hunt' as const,
            tileId: null,
            involvedEntityIds: [],
            startTick: concludedAtTick!,
            narrationZh: '',
          }),
          status: 'concluded',
          endTick: concludedAtTick!,
          narrationZh: `傳奇獵殺在第 ${concludedAtTick} 刻落幕：${outcomeZh}。`,
          lastSequence: event.sequence,
        })
        break
      }
    }
  }

  list(): readonly HistoryArc[] {
    return [...this.arcs.values()].sort((a, b) => b.startTick - a.startTick)
  }

  getByType(arcType: HistoryArcType): readonly HistoryArc[] {
    return this.list().filter((a) => a.arcType === arcType)
  }

  canonicalHash(): string {
    return hashCanonicalJson([...this.arcs.values()].sort((a, b) => a.arcId.localeCompare(b.arcId)))
  }
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = event.payload as { data?: unknown } | null
  const d = payload?.data
  if (!d || typeof d !== 'object') return null
  return d as Record<string, unknown>
}

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function int(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

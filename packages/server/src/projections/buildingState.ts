export type BuildingState = 'under_construction' | 'operational' | 'damaged' | 'abandoned'

export type BuildingStateRow = {
  buildingId: string
  tileId: string
  state: BuildingState
  health: number
  lastActivityTick: number
}

export const BUILDING_STATE_BOOT_EVENT_TYPES = [
  'BUILDING_CONSTRUCTED',
  'BUILDING_DAMAGED',
  'BUILDING_REPAIRED',
  'BUILDING_ABANDONED',
] as const

function readString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function readNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

export class BuildingStateProjection {
  private rows = new Map<string, BuildingStateRow>()

  project(event: { eventType: string; data: unknown; tick?: number }): void {
    const data = event.data as Record<string, unknown>
    if (!data) return
    const buildingId = readString(data.buildingId)
    if (!buildingId) return
    const tileId = readString(data.tileId)

    switch (event.eventType) {
      case 'BUILDING_CONSTRUCTED':
        this.rows.set(buildingId, { buildingId, tileId, state: 'operational', health: 100, lastActivityTick: event.tick ?? 0 })
        break
      case 'BUILDING_DAMAGED': {
        const existing = this.rows.get(buildingId)
        this.rows.set(buildingId, {
          buildingId,
          tileId: tileId || existing?.tileId || '',
          state: 'damaged',
          health: Math.max(0, Math.min(100, readNumber(data.health, 50))),
          lastActivityTick: existing?.lastActivityTick ?? 0,
        })
        break
      }
      case 'BUILDING_REPAIRED': {
        const existing = this.rows.get(buildingId)
        this.rows.set(buildingId, {
          buildingId,
          tileId: tileId || existing?.tileId || '',
          state: 'operational',
          health: Math.max(0, Math.min(100, readNumber(data.health, 100))),
          lastActivityTick: event.tick ?? existing?.lastActivityTick ?? 0,
        })
        break
      }
      case 'BUILDING_ABANDONED': {
        const existing = this.rows.get(buildingId)
        this.rows.set(buildingId, {
          buildingId,
          tileId: tileId || existing?.tileId || '',
          state: 'abandoned',
          health: existing?.health ?? 50,
          lastActivityTick: readNumber(data.lastActivityTick, 0),
        })
        break
      }
    }
  }

  getState(buildingId: string): BuildingStateRow {
    return this.rows.get(buildingId) ?? {
      buildingId,
      tileId: '',
      state: 'operational',
      health: 100,
      lastActivityTick: 0,
    }
  }

  getByTile(tileId: string): readonly BuildingStateRow[] {
    return [...this.rows.values()].filter(r => r.tileId === tileId)
  }

  list(): readonly BuildingStateRow[] {
    return [...this.rows.values()]
  }

  rebuildFromEvents(events: readonly { eventType: string; data: unknown; tick?: number }[]): void {
    this.rows.clear()
    for (const ev of events) this.project(ev)
  }
}

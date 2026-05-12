import type { ConstructionProjectRow } from '../projections/constructionProjects.js'
import type { BuildingDef, BuildingRuntimeView } from './types.js'

export function completedConstructionBuildingView(project: ConstructionProjectRow): BuildingRuntimeView | null {
  if (project.completedAtTick === null) return null
  if (!project.initiatedByNpcId) return null
  return { def: completedConstructionBuildingDef(project), occupants: [] }
}

export function completedConstructionBuildingDef(project: ConstructionProjectRow): BuildingDef {
  const seed = hashString(project.projectId)
  const suffix = project.projectId.split('.').at(-1)?.slice(0, 8) ?? seed.toString(16)
  return {
    id: `${project.buildingId}.${suffix}`,
    tileId: project.targetTileId,
    nameZh: '自主設施',
    nameEn: 'Autonomous Facility',
    descriptionZh: `由 ${project.initiatedByNpcId} 發起的 NPC 自主建案，已於 tick ${project.completedAtTick} 完工。原始專案 ${project.projectId}。`,
    type: 'landmark',
    placement: {
      col: 2 + (seed % 11),
      row: 2 + ((seed >>> 4) % 6),
      glyph: '🏠',
      size: 24
    },
    interior: {
      cols: 9,
      rows: 7,
      backgroundColor: 0x1d2630,
      props: [
        { col: 2, row: 2, glyph: '📦', size: 22, label: '落成物資' },
        { col: 5, row: 3, glyph: '🪑', size: 22, label: '公共座位' },
        { col: 6, row: 5, glyph: '📋', size: 22, label: '工作名冊' }
      ]
    },
    ownerNpcId: project.initiatedByNpcId,
    hiring: [
      { shift: 'morning', capacity: 1, wage: 12, taskZh: '整理自主設施' },
      { shift: 'afternoon', capacity: 1, wage: 14, taskZh: '維護公共服務' }
    ],
    enterable: true,
    restorative: false
  }
}

function hashString(value: string): number {
  let h = 5381
  for (const ch of value) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return h
}

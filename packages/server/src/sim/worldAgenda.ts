import type { ActiveWorldEvent } from '../events/types.js'
import { TILE_NAME_BY_ID } from './mapGraph.js'
import type { AreaState, FactionId } from './areaStateEngine.js'
import { FACTION_LABEL_ZH } from './areaStateEngine.js'

export type WorldAgendaSponsorKind = 'city_council' | 'hidden_overseer' | 'faction_bloc'
export type WorldAgendaPressureKind = 'food' | 'safety' | 'economy' | 'faction' | 'world_event'

export type WorldAgendaDirective = Readonly<{
  id: string
  sponsorKind: WorldAgendaSponsorKind
  sponsorZh: string
  scopeTileId: string
  scopeNameZh: string
  pressureKind: WorldAgendaPressureKind
  pressureScore: number
  directiveZh: string
  rationaleZh: string
}>

export function deriveWorldAgendaDirective(input: {
  areas: readonly AreaState[]
  activeEvents: readonly ActiveWorldEvent[]
  tick: number
  preferredTileId?: string
}): WorldAgendaDirective {
  const candidates = input.areas.flatMap((area) => directivesForArea(area, input.activeEvents, input.tick))
  const sameTile = input.preferredTileId
    ? candidates.filter((directive) => directive.scopeTileId === input.preferredTileId)
    : []
  const pool = sameTile.length > 0 ? sameTile : candidates
  return [...pool].sort((a, b) => b.pressureScore - a.pressureScore || a.id.localeCompare(b.id))[0]
    ?? fallbackDirective(input.preferredTileId ?? input.areas[0]?.tileId ?? 't_central', input.tick)
}

export function roleInterpretationZh(roleText: string, agenda: WorldAgendaDirective): string {
  const role = roleText.toLowerCase()
  if (/(守衛|巡|guard|patrol|hunter|獵)/i.test(role)) {
    return `把「${agenda.directiveZh}」解讀成巡邏、分流與壓制衝突的命令`
  }
  if (/(商|交易|market|shop|broker|vendor|cafe|tavern|exchange)/i.test(role)) {
    return `把「${agenda.directiveZh}」解讀成調度貨源、穩住價格與收攏交易的機會`
  }
  if (/(匠|工|修|smith|craft|foreman|mender|miner)/i.test(role)) {
    return `把「${agenda.directiveZh}」解讀成可投標、可修補、可落地的工程`
  }
  if (/(學|研究|書|scribe|reader|library|herbal)/i.test(role)) {
    return `把「${agenda.directiveZh}」解讀成整理情報、建立知識秩序與教導他人的任務`
  }
  return `把「${agenda.directiveZh}」解讀成自己必須配合或承受的街區安排`
}

function directivesForArea(area: AreaState, activeEvents: readonly ActiveWorldEvent[], tick: number): WorldAgendaDirective[] {
  const tileName = TILE_NAME_BY_ID[area.tileId] ?? area.tileId
  const resourceDirectives: WorldAgendaDirective[] = [
    resourceDirective(area, tick, 'food', 100 - area.resources.food, '民生配給會', '維持食物與補給線', `${tileName} 的食物存量降到 ${Math.round(area.resources.food)}，民生配給會要求先穩住吃飯與基本補給。`),
    resourceDirective(area, tick, 'safety', 100 - area.resources.safety, '潮鳴市治安局', '壓低街區衝突與通行風險', `${tileName} 的安全值是 ${Math.round(area.resources.safety)}，治安局要求把衝突、人流與巡查路線先整理起來。`),
    resourceDirective(area, tick, 'economy', 100 - area.resources.economy, '公會議事廳', '穩住價格、交易與工坊流量', `${tileName} 的經濟值是 ${Math.round(area.resources.economy)}，公會議事廳要求維持攤位、工坊與訂單流動。`)
  ]
  const factionDirective = dominantFactionDirective(area, tick)
  const eventDirective = worldEventDirective(area, activeEvents, tick)
  return [...resourceDirectives, ...(factionDirective ? [factionDirective] : []), ...(eventDirective ? [eventDirective] : [])]
}

function resourceDirective(
  area: AreaState,
  tick: number,
  pressureKind: 'food' | 'safety' | 'economy',
  pressureScore: number,
  sponsorZh: string,
  directiveZh: string,
  rationaleZh: string
): WorldAgendaDirective {
  return {
    id: `agenda.${area.tileId}.${pressureKind}.${Math.floor(tick / 30)}`,
    sponsorKind: 'city_council',
    sponsorZh,
    scopeTileId: area.tileId,
    scopeNameZh: TILE_NAME_BY_ID[area.tileId] ?? area.tileId,
    pressureKind,
    pressureScore: Math.max(1, Math.round(pressureScore)),
    directiveZh,
    rationaleZh
  }
}

function dominantFactionDirective(area: AreaState, tick: number): WorldAgendaDirective | null {
  const entries = Object.entries(area.factionControl) as Array<[FactionId, number]>
  const [faction, value] = [...entries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [null, 0]
  if (!faction || value < 60) return null
  const label = FACTION_LABEL_ZH[faction]
  const tileName = TILE_NAME_BY_ID[area.tileId] ?? area.tileId
  return {
    id: `agenda.${area.tileId}.faction.${faction}.${Math.floor(tick / 30)}`,
    sponsorKind: 'faction_bloc',
    sponsorZh: `${label}地方支部`,
    scopeTileId: area.tileId,
    scopeNameZh: tileName,
    pressureKind: 'faction',
    pressureScore: Math.round(value),
    directiveZh: `把${tileName}的街區秩序拉向${label}能控制的方向`,
    rationaleZh: `${label}在${tileName}的影響力達到 ${Math.round(value)}，地方支部開始把日常工作包裝成勢力秩序。`
  }
}

function worldEventDirective(area: AreaState, activeEvents: readonly ActiveWorldEvent[], tick: number): WorldAgendaDirective | null {
  const event = activeEvents.find((item) => item.scope.kind === 'world' || item.scope.tileIds.includes(area.tileId))
  if (!event) return null
  const tileName = TILE_NAME_BY_ID[area.tileId] ?? area.tileId
  return {
    id: `agenda.${area.tileId}.event.${event.id}.${Math.floor(tick / 30)}`,
    sponsorKind: 'hidden_overseer',
    sponsorZh: '島嶼主宰的暗流',
    scopeTileId: area.tileId,
    scopeNameZh: tileName,
    pressureKind: 'world_event',
    pressureScore: 75,
    directiveZh: `利用「${event.text.zh}」重排${tileName}的人流與資源`,
    rationaleZh: `世界事件「${event.text.zh}」仍在作用，島嶼背後的暗流把它當成推動局勢偏移的槓桿。`
  }
}

function fallbackDirective(tileId: string, tick: number): WorldAgendaDirective {
  const tileName = TILE_NAME_BY_ID[tileId] ?? tileId
  return {
    id: `agenda.${tileId}.stability.${Math.floor(tick / 30)}`,
    sponsorKind: 'city_council',
    sponsorZh: '潮鳴市議會',
    scopeTileId: tileId,
    scopeNameZh: tileName,
    pressureKind: 'economy',
    pressureScore: 1,
    directiveZh: `維持${tileName}的日常秩序`,
    rationaleZh: `${tileName}沒有明顯危機，市議會仍要求各職能維持基本流動。`
  }
}

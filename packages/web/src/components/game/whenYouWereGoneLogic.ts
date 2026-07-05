import type { ServerCatchUpSummary, PlayerNeedsState } from '../../api/client'

const TILE_NAME_ZH: Readonly<Record<string, string>> = {
  t_forest: '潮見丘',
  t_mountain: '煙嵐山',
  t_temple: '霓港區',
  t_dimai: '地脈層',
  t_desert: '潮聲區',
  t_central: '夜潮區',
  t_ruin: '鏽灣區',
  t_dock: '碼頭區',
  t_salt_marsh: '鹽沼外環',
}

export type NarrativeItem = {
  sentence: string
  tileId: string | null
  areaName: string | null
}

export type ActionButton = {
  label: string
  tileId: string | null
  kind: 'navigate' | 'eat' | 'dismiss'
}

/** Select up to 3 narrative items from catch-up data.
 * Priority: NPC productive actions > pressure moments > world events.
 * Skips empty narrations.
 */
export function selectNarrativeItems(
  world: ServerCatchUpSummary | null,
): NarrativeItem[] {
  if (!world) return []

  const items: Array<NarrativeItem & { priority: number }> = []

  for (const action of world.productiveActions.slice(0, 5)) {
    if (action.narration) {
      items.push({
        sentence: action.narration,
        tileId: action.tile,
        areaName: TILE_NAME_ZH[action.tile] ?? null,
        priority: 1,
      })
    }
  }

  for (const moment of world.pressureMoments.slice(0, 4)) {
    if (moment.narration) {
      items.push({
        sentence: moment.narration,
        tileId: moment.tileId,
        areaName: TILE_NAME_ZH[moment.tileId] ?? null,
        priority: 2,
      })
    }
  }

  for (const ev of world.worldEvents.slice(0, 3)) {
    if (ev.narration) {
      const tileId = parseTileFromScope(ev.scope)
      items.push({
        sentence: ev.narration,
        tileId,
        areaName: tileId ? (TILE_NAME_ZH[tileId] ?? null) : null,
        priority: 3,
      })
    }
  }

  return items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(({ sentence, tileId, areaName }) => ({ sentence, tileId, areaName }))
}

/**
 * Format offline decay into a player-centric summary sentence.
 * Returns null when there is nothing notable to report.
 * Format mirrors spec: "你的溫飽掉到 48%，體況尚可。"
 */
export function formatDecaySummary(needs: PlayerNeedsState | null): string | null {
  if (!needs) return null
  const n = Math.round(needs.nourishment)
  const v = Math.round(needs.vigor)

  if (needs.collapsed) {
    return `你的溫飽掉到 ${n}%，體況降至 ${v}%，你已倒下。`
  }
  if (n >= 75 && v >= 75) return null

  const nourishPart = n < 75 ? `溫飽掉到 ${n}%` : `溫飽 ${n}%`
  const vigorPart = v < 60
    ? `體況降至 ${v}%`
    : v >= 75
      ? '體況尚可'
      : `體況 ${v}%`
  return `你的${nourishPart}，${vigorPart}。`
}

/**
 * Convert tick difference to a human-readable label.
 * Assumes ~12 ticks per game-hour (1 tick ≈ 5 game-minutes).
 */
export function ticksToHoursLabel(sinceTick: number, untilTick: number): string {
  const diff = untilTick - sinceTick
  if (diff <= 0) return '片刻之間'
  const hours = Math.round(diff / 12)
  if (hours < 1) return `${diff} 個時段`
  if (hours === 1) return '1 小時'
  return `${hours} 小時`
}

/**
 * Build action buttons: up to 2 area-navigate buttons (deduplicated),
 * an eat button if nourishment is low, and always a dismiss button.
 */
export function buildActionButtons(
  items: NarrativeItem[],
  needs: PlayerNeedsState | null,
): ActionButton[] {
  const buttons: ActionButton[] = []

  const seenTiles = new Set<string>()
  for (const item of items) {
    if (item.tileId && !seenTiles.has(item.tileId) && buttons.length < 2) {
      seenTiles.add(item.tileId)
      buttons.push({
        label: `去${item.areaName ?? item.tileId}看看`,
        tileId: item.tileId,
        kind: 'navigate',
      })
    }
  }

  if (needs && needs.nourishment < 60) {
    buttons.push({ label: '先進食', tileId: null, kind: 'eat' })
  }

  buttons.push({ label: '知道了', tileId: null, kind: 'dismiss' })

  return buttons
}

/**
 * Pure guard: returns true when WhenYouWereGone has something meaningful
 * to show (events or notable decay).
 */
export function wygHasContent(
  world: ServerCatchUpSummary | null,
  needs: PlayerNeedsState | null,
): boolean {
  const hasEvents =
    !!world &&
    (world.productiveActions.length > 0 ||
      world.pressureMoments.length > 0 ||
      world.worldEvents.length > 0 ||
      world.totalEvents > 0)
  const hasDecay = !!needs && (needs.nourishment < 60 || needs.collapsed)
  return hasEvents || hasDecay
}

function parseTileFromScope(scope: string): string | null {
  if (scope === 'world') return null
  if (scope.startsWith('region:')) {
    const list = scope.slice('region:'.length).split(',')
    return list[0] ?? null
  }
  return null
}

import { useEffect, useMemo, useState } from 'react'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n, type TranslationKey, type Translator } from '../i18n'
import type { EventSummary } from '../state/types'
import { api, type ServerChronicleResponse } from '../api/client'
import { isChronicleSurfaceEvent, isPublicNarrativeEvent } from '../state/eventVisibility'

interface EventFilter {
  id: 'all' | 'cards' | 'npc' | 'world'
  labelKey: TranslationKey
  match: (eventType: string) => boolean
}

const FILTERS: EventFilter[] = [
  { id: 'all', labelKey: 'timeline.filter.all', match: () => true },
  { id: 'cards', labelKey: 'timeline.filter.cards', match: (t) => t.startsWith('CARD_') },
  { id: 'npc', labelKey: 'timeline.filter.npc', match: (t) => t.startsWith('NPC_') },
  { id: 'world', labelKey: 'timeline.filter.world', match: (t) => t.startsWith('WORLD_') }
]

export function TimelinePage() {
  const { events, liveConnected } = useWorldState()
  const { t, locale } = useI18n()
  const [filterId, setFilterId] = useState<EventFilter['id']>('all')
  const [chronicle, setChronicle] = useState<ServerChronicleResponse | null>(null)
  const [chronicleError, setChronicleError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .worldChronicle(40, true)
      .then((res) => {
        if (cancelled) return
        setChronicle(res)
        setChronicleError(null)
      })
      .catch((err) => {
        if (!cancelled) setChronicleError(err instanceof Error ? err.message : 'failed to load chronicle')
      })
    return () => {
      cancelled = true
    }
  }, [events.length])

  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0]!
  const visible = useMemo(
    () => events.filter((e) => {
      if (!isPublicNarrativeEvent(e) || !filter.match(e.eventType)) return false
      return filterId === 'all' ? isChronicleSurfaceEvent(e) : true
    }),
    [events, filter, filterId]
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            {t('timeline.eyebrow')}
          </div>
          <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
            {t('timeline.title')}
          </h1>
          <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">{t('timeline.description')}</p>
        </div>
        <span className={`gi-tag ${liveConnected ? 'gi-tag-moss' : ''}`}>
          ● {liveConnected ? t('timeline.live') : t('timeline.offline')}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterId(f.id)}
            className={[
              'gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
              f.id === filterId
                ? 'border-ember-600 text-ember-400 bg-ember-500/5'
                : 'border-ground-700 text-ground-300 hover:border-ground-500'
            ].join(' ')}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <section className="gi-panel border-ember-700/50 p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            編年摘要
          </div>
          {chronicle && (
            <span className="gi-tag">{chronicle.chronicle.source} · tick {chronicle.latestTick}</span>
          )}
        </div>
        {chronicle ? (
          <p className="text-sm text-ground-100 leading-relaxed whitespace-pre-line">
            {locale === 'zh' ? chronicle.chronicle.textZh : chronicle.chronicle.textEn}
          </p>
        ) : chronicleError ? (
          <p className="text-sm text-rust-300 leading-relaxed">{chronicleError}</p>
        ) : (
          <p className="text-sm text-ground-500 italic">載入編年摘要…</p>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {visible.map((event) => (
          <TimelineRow key={event.sequence} event={event} t={t} />
        ))}
        {visible.length === 0 && (
          <div className="gi-panel p-6 text-center text-ground-500 text-sm">
            {t('timeline.empty')}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineRow({ event, t }: { event: EventSummary; t: Translator }) {
  const occurredAt = new Date(event.occurredAt)
  const tag = event.eventType.replace(/_/g, ' ')
  const motivation = eventMotivationFor(event)
  return (
    <article className="gi-panel p-4 lg:p-5 flex flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2 text-[11px] font-display uppercase tracking-tightest text-ground-500">
        <span className="gi-tag">{tag}</span>
        <span className="text-ember-500">#{event.sequence}</span>
        <span className="text-ground-600">·</span>
        <span>tick {event.tick}</span>
        <span className="text-ground-600">·</span>
        <span>{event.actorId}</span>
        <span className="ml-auto text-ground-500" title={occurredAt.toISOString()}>
          {formatRelative(occurredAt, t)}
        </span>
      </header>
      <p className="text-sm text-ground-200 leading-relaxed">{event.narration}</p>
      {motivation && (
        <div className="rounded-sharp border border-moss-800/70 bg-moss-950/20 px-3 py-2 text-[12px] leading-relaxed text-moss-200">
          <div className="font-display text-[10px] uppercase tracking-tightest text-moss-500 mb-1">
            {t('timeline.eventMotivation')}
          </div>
          <div>{motivation.explanation}</div>
          {motivation.projectPurpose && (
            <div className="mt-1 text-ground-400">
              {t('timeline.eventPurpose')}：{motivation.projectPurpose}
            </div>
          )}
        </div>
      )}
      <details className="text-[11px] font-display text-ground-500">
        <summary className="cursor-pointer hover:text-ground-300 transition-colors">
          {t('timeline.payload')}
        </summary>
        <pre className="mt-2 p-2 bg-ground-900 border border-ground-700 rounded-sharp overflow-x-auto text-[11px] text-ground-300">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </details>
    </article>
  )
}

type TimelineEventMotivation = Readonly<{
  projectPurpose?: string
  explanation: string
}>

export function eventMotivationFor(event: EventSummary): TimelineEventMotivation | null {
  const publicFallback = publicFallbackMotivation(event)
  if (publicFallback) return publicFallback

  const motivation = event.payload.motivation
  if (isRecord(motivation) && typeof motivation.explanation === 'string' && isPublicMotivationText(motivation.explanation)) {
    const projectPurpose = typeof motivation.projectPurpose === 'string' && isPublicMotivationText(motivation.projectPurpose)
      ? motivation.projectPurpose
      : undefined
    return projectPurpose ? { explanation: motivation.explanation, projectPurpose } : { explanation: motivation.explanation }
  }
  return null
}

function publicFallbackMotivation(event: EventSummary): TimelineEventMotivation | null {
  if (isConstructionEvent(event.eventType)) return saltMarshConstructionFallback(event)
  if (event.eventType === 'NPC_PRODUCTIVE_ACTION') return productiveMotivation(event)
  if (event.eventType === 'NPC_INTERACT') return interactionMotivation(event)
  if (event.eventType === 'NPC_LIFE_GOAL_SET') return lifeGoalMotivation(event)
  if (event.eventType === 'NPC_HOUSEHOLD_FORMED') {
    return { explanation: '兩位 NPC 的生活條件、關係與安定需求達到門檻，世界把短期互動推進成可回放的家庭事實。' }
  }
  if (event.eventType === 'NPC_CHILD_BORN') {
    return { explanation: '既有家庭經過足夠時間後新增被照顧者，讓人口壓力與家庭責任進入世界狀態。' }
  }
  if (event.eventType === 'AREA_PRESSURE') return areaPressureMotivation(event)
  if (event.eventType === 'NPC_MOVE') return { explanation: 'NPC 依照排程、職責、目標或地區吸引力移動；位置改變是 server-authoritative presence 的結果。' }
  if (event.eventType === 'NPC_ACTIVITY_CHANGE') return { explanation: 'NPC 的日程、工作、休息或生理需求改變了當前活動。' }
  if (event.eventType === 'BUILDING_ENTER') return { explanation: 'NPC 因工作、休息、交易或路線目的進入建築；室內 presence 會從同一份 server 狀態投影。' }
  if (event.eventType === 'BUILDING_LEAVE') return { explanation: 'NPC 的室內任務結束或下一段行程開始，因此離開建築回到區域流動。' }
  if (event.eventType === 'WEATHER_CHANGE' || event.eventType === 'SEASON_CHANGE') return { explanation: '世界時間循環推進到新的天氣或季節階段，影響後續 NPC 與區域狀態。' }
  if (event.eventType === 'WORLD_EVENT_SPAWN') return { explanation: '世界事件引擎依照時間、地區與模板條件觸發事件，讓城市有非 NPC 個體行為的外部壓力。' }
  if (event.eventType === 'WORLD_EVENT_END') return { explanation: '世界事件達到結束 tick，暫時性壓力或窗口從 active projection 中移除。' }
  if (event.eventType === 'RARE_WINDOW_OPEN') return { explanation: '稀有窗口依世界週期開啟，短時間改變卡牌與事件機會。' }
  if (event.eventType === 'RARE_WINDOW_CLOSE') return { explanation: '稀有窗口時間耗盡，世界回到日常生成規則。' }
  if (event.eventType === 'PLAYER_INTERVENE') return { explanation: '玩家主動介入 NPC 關係或衝突，因此事件由玩家意圖與規則引擎共同定稿。' }
  if (event.eventType.startsWith('CARD_')) return { explanation: '紋卡事件由地區、天氣、稀有窗口、玩家動作或持有期限觸發，代表資源機會在世界中流動。' }
  return null
}

function isPublicMotivationText(value: string): boolean {
  if (value.length > 220) return false
  return !/(?:agenda\.|\bt_[a-z0-9_]+\b|cap_zero|event\.[a-z0-9_.-]+)/i.test(value)
}

function saltMarshConstructionFallback(event: EventSummary): TimelineEventMotivation | null {
  if (event.payload.projectId === 'project.salt_marsh_settlement') {
    return {
      explanation: '舊街區的住房、安全與補給壓力正在上升；鹽沼外環被選為新的住處、巡衛落腳點與公共補給節點。',
      projectPurpose: '把鹽沼外環變成可抵達、可休息、可工作、可補給的外環據點，分散碼頭區與鏽灣區壓力。'
    }
  }
  return null
}

function productiveMotivation(event: EventSummary): TimelineEventMotivation {
  const domain = String(event.payload.domain ?? '')
  const metric = String(event.payload.metric ?? '')
  if (domain === 'build') return withPurpose('NPC 正在修補或擴充基礎設施，目的通常是降低通行、住房或安全壓力。', metricLabel(metric))
  if (domain === 'service') return withPurpose('NPC 用巡查、照護或公共服務維持街區秩序，避免區域壓力失控。', metricLabel(metric))
  if (domain === 'trade') return withPurpose('NPC 透過交易與供應調節物資流向，讓收入、補給與價格壓力保持可控。', metricLabel(metric))
  if (domain === 'learn') return withPurpose('NPC 累積知識或技能，讓未來的工作、建設與解決問題能力提升。', metricLabel(metric))
  return { explanation: 'NPC 的 productive action 代表角色職責或生活目標被轉化成可回放的世界進展。' }
}

function withPurpose(explanation: string, projectPurpose: string | undefined): TimelineEventMotivation {
  return projectPurpose ? { explanation, projectPurpose } : { explanation }
}

function interactionMotivation(event: EventSummary): TimelineEventMotivation {
  const mode = event.payload.mode
  if (mode === 'argue') return { explanation: '兩位 NPC 同處一地且立場、資源或情緒壓力浮上檯面，因此互動變成爭執。' }
  return { explanation: '兩位 NPC 同處一地，透過交談交換情報、協調關係或維持日常社交網絡。' }
}

function lifeGoalMotivation(event: EventSummary): TimelineEventMotivation {
  const goal = event.payload.goal
  if (isRecord(goal) && typeof goal.narration === 'string') {
    const pressure = typeof goal.pressure === 'number' ? `壓力 ${goal.pressure}` : '壓力更新'
    return { explanation: `NPC 的需求投影重新計算後，當前生活目標變成「${goal.narration}」（${pressure}）。` }
  }
  return { explanation: 'NPC 的食物、休息、收入、住房或安全需求改變，因此生活目標被 deterministic policy 重新投影。' }
}

function areaPressureMotivation(event: EventSummary): TimelineEventMotivation {
  const kind = String(event.payload.kind ?? '')
  if (kind.includes('faction')) return { explanation: '派系影響力跨過門檻，代表街區權力平衡改變並可能影響 NPC 行為。' }
  if (kind.includes('resource')) return { explanation: '區域資源指標跨過壓力門檻，世界把它記成後續行動會回應的公共壓力。' }
  return { explanation: '區域狀態達到壓力或回穩門檻，因此被寫入公共編年史。' }
}

function metricLabel(metric: string): string | undefined {
  switch (metric) {
    case 'infrastructure': return '基礎建設'
    case 'knowledge': return '知識 / 技能'
    case 'economy': return '經濟 / 收入'
    case 'safety': return '安全 / 秩序'
    case 'supply': return '補給 / 物資'
    default: return undefined
  }
}

function isConstructionEvent(eventType: string): boolean {
  return eventType === 'CONSTRUCTION_PROJECT_PROGRESS' || eventType === 'MAP_TILE_UNLOCKED' || eventType === 'BUILDING_CONSTRUCTED'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatRelative(at: Date, t: Translator): string {
  const diffMs = Date.now() - at.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { n: hours })
  const days = Math.round(hours / 24)
  return t('time.daysAgo', { n: days })
}

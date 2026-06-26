import type { WorldCivilizationSnapshot } from '../../state/types'
import { summarizeWorldCivilizationPanel } from './worldCivilizationPanelData'

export function WorldCivilizationPanel({ snapshot }: { snapshot: WorldCivilizationSnapshot | null | undefined }) {
  const summary = summarizeWorldCivilizationPanel(snapshot)
  const hasContent = summary.activeGoalCount + summary.completedGoalCount + summary.technologyCount > 0

  return (
    <section className="mt-3 mx-2 gi-panel border-ember-800/70 bg-ground-950/90 p-3 text-ground-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[9px] uppercase tracking-tightest text-ember-500 leading-tight">
            Living World
          </p>
          <h2 className="font-display text-sm font-extrabold tracking-tightest text-ground-100 leading-tight">
            世界目標與科技
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center font-display text-[10px] uppercase tracking-tightest">
          <Metric label="目標" value={summary.activeGoalCount} />
          <Metric label="完成" value={summary.completedGoalCount} />
          <Metric label="科技" value={summary.technologyCount} />
        </div>
      </div>

      {!hasContent ? (
        <p className="mt-2 text-[12px] text-ground-500 leading-relaxed">
          世界還在累積足夠的學習、建造與生產證據；形成共識後會在這裡出現目標與技術。
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <h3 className="font-display text-[10px] uppercase tracking-tightest text-ground-400">目前世界目標</h3>
            <ul className="mt-1 space-y-2">
              {summary.topGoals.map((goal) => (
                <li key={goal.goalId} className="rounded-sharp border border-ground-800 bg-ground-900/70 p-2">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-semibold text-ground-100">{goal.title}</span>
                    <span className="text-[10px] text-ember-400">{goal.progressPct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ground-800">
                    <div className="h-full bg-ember-500" style={{ width: `${goal.progressPct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-ground-500">{domainLabel(goal.domain)} · {goal.completed ? '已完成' : '推進中'}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-[10px] uppercase tracking-tightest text-ground-400">最近形成科技</h3>
            <ul className="mt-1 space-y-2">
              {summary.recentTechnologies.map((tech) => (
                <li key={tech.techId} className="rounded-sharp border border-ground-800 bg-ground-900/70 p-2">
                  <div className="text-[12px] font-semibold text-ground-100">{tech.title}</div>
                  <p className="mt-1 text-[10px] text-ground-500">
                    {domainLabel(tech.domain)} · 來自 {tech.evidenceCount} 個世界事件證據
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[44px] rounded-sharp border border-ground-800 bg-ground-900 px-2 py-1">
      <div className="text-ground-100">{value}</div>
      <div className="text-[8px] text-ground-500">{label}</div>
    </div>
  )
}

function domainLabel(domain: string): string {
  switch (domain) {
    case 'construction': return '建造'
    case 'infrastructure': return '基礎設施'
    case 'learning': return '學習'
    case 'economy': return '經濟'
    case 'ecology': return '生態'
    case 'cards': return '卡片'
    default: return domain
  }
}

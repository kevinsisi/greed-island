import { PageHeader } from '../components/common/PageHeader'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n } from '../i18n'
import type { Translator } from '../i18n'
import type { NpcSummary } from '../state/types'

export function NpcsPage() {
  const { npcs, world } = useWorldState()
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('npcs.eyebrow')}
        title={t('npcs.title')}
        description={t('npcs.description')}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {npcs.map((npc) => (
          <NpcCard key={npc.id} npc={npc} currentTick={world.tick} t={t} />
        ))}
      </div>
    </div>
  )
}

function NpcCard({ npc, currentTick, t }: { npc: NpcSummary; currentTick: number; t: Translator }) {
  const idleTicks = Math.max(0, currentTick - npc.lastActedTick)
  const score = npc.relationshipScore
  const tone = score > 30 ? 'moss' : score < 0 ? 'rust' : 'neutral'
  const toneClass = tone === 'moss' ? 'text-moss-400' : tone === 'rust' ? 'text-rust-500' : 'text-ground-200'

  return (
    <article className="gi-panel p-5 flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
            {npc.role}
          </div>
          <h3 className="font-display font-extrabold text-lg tracking-tightest text-ground-100">
            {npc.name}
          </h3>
        </div>
        <span className="gi-tag">{npc.location}</span>
      </header>

      <div className="gi-divider" />

      <dl className="grid grid-cols-3 gap-3 text-[11px] font-display uppercase tracking-tightest">
        <div>
          <dt className="text-ground-500">{t('npcs.relationship')}</dt>
          <dd className={`mt-1 text-base font-extrabold ${toneClass}`}>{score}</dd>
        </div>
        <div>
          <dt className="text-ground-500">{t('npcs.lastActed')}</dt>
          <dd className="mt-1 text-base font-extrabold text-ground-200">tick {npc.lastActedTick}</dd>
        </div>
        <div>
          <dt className="text-ground-500">{t('npcs.silence')}</dt>
          <dd className="mt-1 text-base font-extrabold text-ground-200">{t('time.tickUnit', { n: idleTicks })}</dd>
        </div>
      </dl>

      <div className="gi-divider" />

      <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500 leading-relaxed">
        <div>
          <span className="text-ground-400">{t('npcs.mood')} </span>
          <span className="text-ground-200">{String(npc.internalState['mood'] ?? '—')}</span>
        </div>
        <div>
          <span className="text-ground-400">{t('npcs.intent')} </span>
          <span className="text-ground-200">{String(npc.internalState['pendingDesire'] ?? '—')}</span>
        </div>
        <div>
          <span className="text-ground-400">{t('npcs.knownActions')} </span>
          <span className="text-ember-400">{String(npc.internalState['knownPlayerActions'] ?? 0)}</span>
        </div>
      </div>
    </article>
  )
}

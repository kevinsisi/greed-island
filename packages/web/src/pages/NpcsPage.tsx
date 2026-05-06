import { PageHeader } from '../components/common/PageHeader'
import { useWorldState } from '../state/WorldStateContext'
import type { NpcSummary } from '../state/types'

export function NpcsPage() {
  const { npcs, world } = useWorldState()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="ISLAND DENIZENS"
        title="NPC 名冊"
        description="自主的島民。他們在你不在時也持續行動，並且記得你。"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {npcs.map((npc) => (
          <NpcCard key={npc.id} npc={npc} currentTick={world.tick} />
        ))}
      </div>
    </div>
  )
}

function NpcCard({ npc, currentTick }: { npc: NpcSummary; currentTick: number }) {
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
          <dt className="text-ground-500">關係</dt>
          <dd className={`mt-1 text-base font-extrabold ${toneClass}`}>{score}</dd>
        </div>
        <div>
          <dt className="text-ground-500">最後行動</dt>
          <dd className="mt-1 text-base font-extrabold text-ground-200">tick {npc.lastActedTick}</dd>
        </div>
        <div>
          <dt className="text-ground-500">沉默</dt>
          <dd className="mt-1 text-base font-extrabold text-ground-200">{idleTicks} 刻</dd>
        </div>
      </dl>

      <div className="gi-divider" />

      <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500 leading-relaxed">
        <div>
          <span className="text-ground-400">心情</span>
          <span className="text-ground-200">{String(npc.internalState['mood'] ?? '—')}</span>
        </div>
        <div>
          <span className="text-ground-400">意圖</span>
          <span className="text-ground-200">{String(npc.internalState['pendingDesire'] ?? '—')}</span>
        </div>
        <div>
          <span className="text-ground-400">記得你的事</span>
          <span className="text-ember-400">{String(npc.internalState['knownPlayerActions'] ?? 0)}</span>
        </div>
      </div>
    </article>
  )
}

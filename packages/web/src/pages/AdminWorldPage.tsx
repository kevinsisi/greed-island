import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { useI18n, type TranslationKey } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { useWorldState } from '../state/WorldStateContext'

type FisheryDensityRow = Readonly<{
  tileId: string
  density: number
  harvestedTotal: number
  collapsed: boolean
  lastUpdatedTick: number
  lastSequence: number
}>

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string

export function AdminWorldPage() {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const { world, map, source, liveConnected, refreshWorld } = useWorldState()

  if (!token || !account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('admin.world.eyebrow')}
          title={t('admin.world.title')}
          description={t('admin.world.description')}
        />
        <section className="gi-panel p-5 text-sm text-ground-300">{t('admin.loginGate')}</section>
      </div>
    )
  }

  if (account.role !== 'admin' && account.role !== 'gm') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('admin.world.eyebrow')}
          title={t('admin.world.title')}
          description={t('admin.world.description')}
        />
        <section className="gi-panel p-5 text-sm text-rust-300">{t('admin.errorForbidden')}</section>
      </div>
    )
  }

  const fisheryRows = readFisheryRows(world.facts)
  const tileNameById = new Map(map.tiles.map((tile) => [tile.id, tile.name]))
  const collapsedCount = fisheryRows.filter((row) => row.collapsed).length
  const totalHarvested = fisheryRows.reduce((sum, row) => sum + row.harvestedTotal, 0)
  const lowestDensity = fisheryRows.reduce<number | null>(
    (lowest, row) => (lowest === null ? row.density : Math.min(lowest, row.density)),
    null
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('admin.world.eyebrow')}
        title={t('admin.world.title')}
        description={t('admin.world.description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshWorld()}
              className="gi-panel px-3 py-1.5 text-xs font-display uppercase tracking-tightest text-ground-300 hover:text-ground-100"
            >
              {t('admin.world.refresh')}
            </button>
            <Link
              to="/admin/npcs"
              className="gi-panel px-3 py-1.5 text-xs font-display uppercase tracking-tightest text-ground-300 hover:text-ground-100"
            >
              {t('admin.npcs.link')}
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label={t('admin.world.summary')}>
        <StatCard label={t('admin.world.statTick')} value={world.tick} />
        <StatCard label={t('admin.world.statSource')} value={source === 'server' ? t('admin.world.sourceServer') : t('admin.world.sourceFixture')} />
        <StatCard label={t('admin.world.statConnection')} value={liveConnected ? t('admin.world.live') : t('admin.world.polling')} />
        <StatCard label={t('admin.world.statFisheryRows')} value={fisheryRows.length} />
      </section>

      <section className="gi-panel p-5 flex flex-col gap-4 border-cyan-700/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-sm uppercase tracking-tightest text-cyan-300">
              {t('admin.world.fisheryHeading')}
            </h2>
            <p className="text-[12px] text-ground-400 leading-relaxed">
              {t('admin.world.fisheryDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-display uppercase tracking-tightest">
            <Badge label={t('admin.world.totalHarvested')} value={totalHarvested} />
            <Badge label={t('admin.world.lowestDensity')} value={lowestDensity ?? t('admin.world.none')} />
            <Badge label={t('admin.world.collapsedCount')} value={collapsedCount} danger={collapsedCount > 0} />
          </div>
        </div>

        {fisheryRows.length === 0 ? (
          <div className="rounded-sharp border border-ground-800 bg-ground-950/40 p-4 text-sm text-ground-400 leading-relaxed">
            {t('admin.world.fisheryEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-4">{t('admin.world.colTile')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colDensity')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colHarvested')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colStatus')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {fisheryRows.map((row) => (
                  <FisheryRow key={row.tileId} row={row} tileName={tileNameById.get(row.tileId) ?? row.tileId} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function FisheryRow({ row, tileName, t }: { row: FisheryDensityRow; tileName: string; t: Translator }) {
  const density = Math.max(0, Math.min(100, row.density))
  const danger = row.collapsed || density <= 20
  const warn = !danger && density <= 50
  return (
    <tr className="border-t border-ground-800/50">
      <td className="py-3 pr-4 text-ground-100">
        <div>{tileName}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.tileId}</div>
      </td>
      <td className="py-3 pr-4 min-w-[12rem]">
        <div className="flex items-center gap-3">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-ground-800">
            <div
              className={[
                'h-full rounded-full',
                danger ? 'bg-rust-500' : warn ? 'bg-amber-500' : 'bg-cyan-400'
              ].join(' ')}
              style={{ width: `${density}%` }}
            />
          </div>
          <span className="font-mono text-xs text-ground-200">{row.density}</span>
        </div>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-300">{row.harvestedTotal}</td>
      <td className="py-3 pr-4">
        <span className={danger ? 'text-rust-300' : warn ? 'text-amber-300' : 'text-cyan-300'}>
          {row.collapsed ? t('admin.world.statusCollapsed') : warn ? t('admin.world.statusStressed') : t('admin.world.statusStable')}
        </span>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-400">{row.lastUpdatedTick}</td>
    </tr>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="gi-panel p-3 flex flex-col gap-1">
      <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">{label}</div>
      <div className="text-2xl font-display font-extrabold text-ground-100">{value}</div>
    </div>
  )
}

function Badge({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <span className={`px-2 py-1 border rounded-sharp ${danger ? 'border-rust-700 text-rust-300' : 'border-ground-700 text-ground-300'}`}>
      {label}: <span className="text-ground-100">{value}</span>
    </span>
  )
}

function readFisheryRows(facts: Record<string, unknown>): FisheryDensityRow[] {
  const raw = facts.fisheryDensity
  if (!Array.isArray(raw)) return []
  return raw.filter(isFisheryDensityRow).sort((a, b) => a.tileId.localeCompare(b.tileId))
}

function isFisheryDensityRow(value: unknown): value is FisheryDensityRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<FisheryDensityRow>
  return (
    typeof row.tileId === 'string' &&
    typeof row.density === 'number' &&
    typeof row.harvestedTotal === 'number' &&
    typeof row.collapsed === 'boolean' &&
    typeof row.lastUpdatedTick === 'number' &&
    typeof row.lastSequence === 'number'
  )
}

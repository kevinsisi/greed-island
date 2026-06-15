import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { api, type AreaEcologyView } from '../api/client'

const TILES: readonly { id: string; nameZh: string; nameEn: string }[] = [
  { id: 't_central', nameZh: '夜潮區', nameEn: 'Central' },
  { id: 't_forest', nameZh: '潮見丘', nameEn: 'Forest Hill' },
  { id: 't_mountain', nameZh: '煙嵐山', nameEn: 'Mountain' },
  { id: 't_temple', nameZh: '霓港區', nameEn: 'Temple Port' },
  { id: 't_ruin', nameZh: '鏽灣區', nameEn: 'Ruin Bay' },
  { id: 't_dock', nameZh: '碼頭區', nameEn: 'Dock' },
  { id: 't_desert', nameZh: '潮聲區', nameEn: 'Desert' },
  { id: 't_dimai', nameZh: '地脈層', nameEn: 'Ley Layer' },
  { id: 't_salt_marsh', nameZh: '鹽沼外環', nameEn: 'Salt Marsh' },
]

export function EcologyPage() {
  const { t, locale } = useI18n()
  const [selectedTileId, setSelectedTileId] = useState<string>(TILES[0]!.id)
  const [ecology, setEcology] = useState<AreaEcologyView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .areaEcology(selectedTileId)
      .then((data) => {
        if (cancelled) return
        setEcology(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'failed')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedTileId])

  const selectedTile = TILES.find((t) => t.id === selectedTileId)
  const tileName = locale === 'zh' ? selectedTile?.nameZh : selectedTile?.nameEn

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            {t('ecology.eyebrow')}
          </div>
          <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
            {t('ecology.title')}
          </h1>
          <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">
            {t('ecology.description')}
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <label className="text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('ecology.selectTile')}
        </label>
        <select
          value={selectedTileId}
          onChange={(e) => setSelectedTileId(e.target.value)}
          className="bg-ground-800 border border-ground-700 text-ground-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-ember-500"
        >
          {TILES.map((tile) => (
            <option key={tile.id} value={tile.id}>
              {locale === 'zh' ? tile.nameZh : tile.nameEn}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="text-sm text-ground-500">{t('ecology.loading')}</p>
      )}

      {error && (
        <p className="text-sm text-ember-400">{error}</p>
      )}

      {!loading && !error && ecology && (
        <div className="flex flex-col gap-6">
          <h2 className="font-display font-bold text-lg text-ground-100">{tileName}</h2>

          {/* Animals */}
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
              {t('ecology.animals')}
            </h3>
            {ecology.animals.length === 0 ? (
              <p className="text-sm text-ground-600">{t('ecology.noData')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ecology.animals.map((a) => (
                  <div
                    key={`${a.speciesId}-${a.biomeRegion}`}
                    className="bg-ground-800 rounded-sharp border border-ground-700 px-3 py-2"
                  >
                    <div className="text-xs font-display uppercase text-ground-400 truncate">
                      {a.speciesId}
                    </div>
                    <div className="text-ground-100 font-bold text-lg">{a.count}</div>
                    <div className="text-[10px] text-ground-600">{a.biomeRegion}</div>
                    <div className="mt-1 inline-flex w-fit rounded-sharp border border-moss-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-tightest text-moss-300">
                      {a.intent}
                    </div>
                    <div className="mt-1 text-[10px] leading-snug text-ground-400">
                      {a.thoughtZh}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Fishery */}
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
              {t('ecology.fishery')}
            </h3>
            {ecology.fishery ? (
              <div className="bg-ground-800 rounded-sharp border border-ground-700 px-4 py-3 flex gap-6 flex-wrap">
                <div>
                  <div className="text-[10px] text-ground-500 uppercase tracking-tightest">
                    {t('ecology.fishery.density')}
                  </div>
                  <div className={`text-lg font-bold ${ecology.fishery.collapsed ? 'text-ember-400' : 'text-moss-400'}`}>
                    {(ecology.fishery.density * 100).toFixed(0)}%
                  </div>
                </div>
                {ecology.fishery.collapsed && (
                  <div className="flex items-center">
                    <span className="gi-tag gi-tag-ember text-[10px]">{t('ecology.fishery.collapsed')}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ground-600">{t('ecology.fishery.none')}</p>
            )}
          </section>

          {/* Plant nodes */}
          {ecology.plants.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
                {t('ecology.plants')}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ecology.plants.map((p) => (
                  <div
                    key={p.speciesId}
                    className="bg-ground-800 rounded-sharp border border-ground-700 px-3 py-2"
                  >
                    <div className="text-xs font-display uppercase text-ground-400 truncate">
                      {p.speciesId}
                    </div>
                    <div className="text-ground-100 font-bold text-lg">
                      {p.saturationPct.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-ground-600">
                      {p.density} / {p.capacity}
                    </div>
                    <div className="mt-1 inline-flex w-fit rounded-sharp border border-moss-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-tightest text-moss-300">
                      {p.state}
                    </div>
                    <div className="mt-1 text-[10px] leading-snug text-ground-400">
                      {p.thoughtZh}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Migrations */}
          {(ecology.migrationsArriving.length > 0 || ecology.migrationsDeparting.length > 0) && (
            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
                {t('ecology.migrations')}
              </h3>
              <div className="flex flex-col gap-1">
                {ecology.migrationsArriving.map((m) => (
                  <div key={m.waveId} className="text-sm text-ground-300">
                    ↓ {m.speciesId} ×{m.count} ← {m.fromTileId}
                  </div>
                ))}
                {ecology.migrationsDeparting.map((m) => (
                  <div key={m.waveId} className="text-sm text-ground-500">
                    ↑ {m.speciesId} ×{m.count} → {m.toTileId}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Predator warnings */}
          {ecology.predatorWarnings.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
                {t('ecology.predators')}
              </h3>
              <div className="flex flex-col gap-1">
                {ecology.predatorWarnings.map((w) => (
                  <div key={w.predatorSpeciesId} className="text-sm text-ember-300">
                    ⚠ {w.predatorSpeciesId}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && !error && !ecology && (
        <p className="text-sm text-ground-600">{t('ecology.noData')}</p>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { api, type MarketPriceEntry } from '../api/client'

function supplyStatus(entry: MarketPriceEntry): 'surplus' | 'shortage' | 'balanced' {
  if (entry.supplyQuantity > entry.demandQuantity * 1.2) return 'surplus'
  if (entry.supplyQuantity < entry.demandQuantity * 0.8) return 'shortage'
  return 'balanced'
}

export function MarketPage() {
  const { t } = useI18n()
  const [prices, setPrices] = useState<readonly MarketPriceEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .marketPrices()
      .then((data) => {
        if (cancelled) return
        setPrices(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'failed')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const statusLabel = (entry: MarketPriceEntry) => {
    const s = supplyStatus(entry)
    if (s === 'surplus') return t('market.surplus')
    if (s === 'shortage') return t('market.shortage')
    return t('market.balanced')
  }

  const statusColor = (entry: MarketPriceEntry) => {
    const s = supplyStatus(entry)
    if (s === 'surplus') return 'text-moss-400'
    if (s === 'shortage') return 'text-ember-400'
    return 'text-ground-400'
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            {t('market.eyebrow')}
          </div>
          <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
            {t('market.title')}
          </h1>
          <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">
            {t('market.description')}
          </p>
        </div>
      </header>

      {loading && (
        <p className="text-sm text-ground-500">{t('market.loading')}</p>
      )}

      {error && (
        <p className="text-sm text-ember-400">{error}</p>
      )}

      {!loading && !error && prices && prices.length === 0 && (
        <p className="text-sm text-ground-600">{t('market.noData')}</p>
      )}

      {!loading && !error && prices && prices.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-ground-700">
                <th className="font-display text-[11px] uppercase tracking-tightest text-ground-400 py-2 pr-4">
                  {t('market.goods')}
                </th>
                <th className="font-display text-[11px] uppercase tracking-tightest text-ground-400 py-2 pr-4">
                  {t('market.settlement')}
                </th>
                <th className="font-display text-[11px] uppercase tracking-tightest text-ground-400 py-2 pr-4 text-right">
                  {t('market.supply')}
                </th>
                <th className="font-display text-[11px] uppercase tracking-tightest text-ground-400 py-2 pr-4 text-right">
                  {t('market.demand')}
                </th>
                <th className="font-display text-[11px] uppercase tracking-tightest text-ground-400 py-2 pr-4 text-right">
                  {t('market.price')}
                </th>
                <th className="font-display text-[11px] uppercase tracking-tightest text-ground-400 py-2">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {prices.map((entry) => (
                <tr
                  key={`${entry.marketId}-${entry.goodsId}`}
                  className="border-b border-ground-800 hover:bg-ground-800/40 transition-colors"
                >
                  <td className="py-2 pr-4 text-ground-100 font-medium">{entry.nameZh}</td>
                  <td className="py-2 pr-4 text-ground-400 font-mono text-xs">{entry.settlementId}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-ground-300">{entry.supplyQuantity}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-ground-300">{entry.demandQuantity}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-ember-300 font-bold">
                    {entry.priceGold.toFixed(1)}
                  </td>
                  <td className={`py-2 text-[10px] font-display uppercase tracking-tightest ${statusColor(entry)}`}>
                    {statusLabel(entry)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

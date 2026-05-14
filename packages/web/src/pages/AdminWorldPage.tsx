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

type GoodsInventoryRow = Readonly<{
  goodsId: string
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  quantity: number
  lastUpdatedTick: number
  lastSequence: number
}>

type GoodsHolderType = 'npc' | 'building' | 'settlement'

type TradeRouteRow = Readonly<{
  routeId: string
  fromTileId: string
  toTileId: string
  goodsId: string
  open: boolean
  openedAtTick: number
  closedAtTick: number | null
  lastSequence: number
}>

type GoodsTransportRow = Readonly<{
  transportId: string
  routeId: string
  goodsId: string
  quantity: number
  carrierNpcId: string
  fromHolderType: GoodsHolderType
  fromHolderId: string
  fromTileId: string
  toHolderType: GoodsHolderType
  toHolderId: string
  toTileId: string
  status: 'started' | 'arrived' | 'lost'
  startedAtTick: number
  resolvedAtTick: number | null
  lossReason: string | null
  lastSequence: number
}>

type LogisticsSnapshot = Readonly<{
  routes: readonly TradeRouteRow[]
  transports: readonly GoodsTransportRow[]
}>

type ProductionRecipeRow = Readonly<{
  recipeId: string
  inputGoodsId: string
  inputQuantity: number
  outputGoodsId: string
  outputQuantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
}>

type ProductionProcessRow = Readonly<{
  recipeId: string
  inputGoodsId: string
  inputQuantityTotal: number
  outputGoodsId: string
  outputQuantityTotal: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  lastProcessedTick: number
  lastSequence: number
}>

type ProductionChainsSnapshot = Readonly<{
  recipes: readonly ProductionRecipeRow[]
  processed: readonly ProductionProcessRow[]
}>

type MarketPriceRow = Readonly<{
  marketId: string
  settlementId: string
  goodsId: string
  supplyQuantity: number
  demandQuantity: number
  priceGold: number
  lastDiscoveredTick: number
  lastSequence: number
}>

type AnimalMigrationWaveRow = Readonly<{
  waveId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migrationType: 'pressure' | 'seasonal'
  startedAtTick: number
  count: number
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
  const goodsRows = readGoodsRows(world.facts)
  const logistics = readLogistics(world.facts)
  const productionChains = readProductionChains(world.facts)
  const marketPrices = readMarketPrices(world.facts)
  const migrationWaves = readMigrationWaves(world.facts)
  const tileNameById = new Map(map.tiles.map((tile) => [tile.id, tile.name]))
  const collapsedCount = fisheryRows.filter((row) => row.collapsed).length
  const totalHarvested = fisheryRows.reduce((sum, row) => sum + row.harvestedTotal, 0)
  const totalGoods = goodsRows.reduce((sum, row) => sum + row.quantity, 0)
  const openRouteCount = logistics.routes.filter((row) => row.open).length
  const lostTransportCount = logistics.transports.filter((row) => row.status === 'lost').length
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

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" aria-label={t('admin.world.summary')}>
        <StatCard label={t('admin.world.statTick')} value={world.tick} />
        <StatCard label={t('admin.world.statSource')} value={source === 'server' ? t('admin.world.sourceServer') : t('admin.world.sourceFixture')} />
        <StatCard label={t('admin.world.statConnection')} value={liveConnected ? t('admin.world.live') : t('admin.world.polling')} />
        <StatCard label={t('admin.world.statFisheryRows')} value={fisheryRows.length} />
        <StatCard label={t('admin.world.statGoodsRows')} value={goodsRows.length} />
        <StatCard label={t('admin.world.statLogisticsRows')} value={logistics.transports.length} />
        <StatCard label={t('admin.world.statProductionRows')} value={productionChains.processed.length} />
        <StatCard label={t('admin.world.statMarketRows')} value={marketPrices.length} />
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

      <section className="gi-panel p-5 flex flex-col gap-4 border-moss-700/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-sm uppercase tracking-tightest text-moss-300">
              {t('admin.world.goodsHeading')}
            </h2>
            <p className="text-[12px] text-ground-400 leading-relaxed">
              {t('admin.world.goodsDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-display uppercase tracking-tightest">
            <Badge label={t('admin.world.goodsRows')} value={goodsRows.length} />
            <Badge label={t('admin.world.totalGoods')} value={totalGoods} />
          </div>
        </div>

        {goodsRows.length === 0 ? (
          <div className="rounded-sharp border border-ground-800 bg-ground-950/40 p-4 text-sm text-ground-400 leading-relaxed">
            {t('admin.world.goodsEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-4">{t('admin.world.colGoods')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colQuantity')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colHolder')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colTile')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {goodsRows.map((row) => (
                  <GoodsRow
                    key={`${row.holderType}:${row.holderId}:${row.goodsId}`}
                    row={row}
                    tileName={tileNameById.get(row.tileId) ?? row.tileId}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gi-panel p-5 flex flex-col gap-5 border-amber-700/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-sm uppercase tracking-tightest text-amber-300">
              {t('admin.world.logisticsHeading')}
            </h2>
            <p className="text-[12px] text-ground-400 leading-relaxed">
              {t('admin.world.logisticsDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-display uppercase tracking-tightest">
            <Badge label={t('admin.world.openRoutes')} value={openRouteCount} />
            <Badge label={t('admin.world.transportRows')} value={logistics.transports.length} />
            <Badge label={t('admin.world.lostTransports')} value={lostTransportCount} danger={lostTransportCount > 0} />
          </div>
        </div>

        {logistics.routes.length === 0 && logistics.transports.length === 0 ? (
          <div className="rounded-sharp border border-ground-800 bg-ground-950/40 p-4 text-sm text-ground-400 leading-relaxed">
            {t('admin.world.logisticsEmpty')}
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <h3 className="mb-2 font-display text-[11px] uppercase tracking-tightest text-ground-400">
                {t('admin.world.routesHeading')}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                    <th className="text-left py-2 pr-4">{t('admin.world.colRoute')}</th>
                    <th className="text-left py-2 pr-4">{t('admin.world.colGoods')}</th>
                    <th className="text-left py-2 pr-4">{t('admin.world.colStatus')}</th>
                    <th className="text-left py-2 pr-4">{t('admin.world.colUpdated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logistics.routes.map((row) => (
                    <TradeRouteView key={row.routeId} row={row} tileNameById={tileNameById} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <h3 className="mb-2 font-display text-[11px] uppercase tracking-tightest text-ground-400">
                {t('admin.world.transportsHeading')}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                    <th className="text-left py-2 pr-4">{t('admin.world.colTransport')}</th>
                    <th className="text-left py-2 pr-4">{t('admin.world.colQuantity')}</th>
                    <th className="text-left py-2 pr-4">{t('admin.world.colStatus')}</th>
                    <th className="text-left py-2 pr-4">{t('admin.world.colUpdated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logistics.transports.map((row) => (
                    <GoodsTransportView key={row.transportId} row={row} tileNameById={tileNameById} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="gi-panel p-5 flex flex-col gap-4 border-violet-700/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-sm uppercase tracking-tightest text-violet-300">
              {t('admin.world.productionHeading')}
            </h2>
            <p className="text-[12px] text-ground-400 leading-relaxed">
              {t('admin.world.productionDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-display uppercase tracking-tightest">
            <Badge label={t('admin.world.productionRecipes')} value={productionChains.recipes.length} />
            <Badge label={t('admin.world.productionProcessed')} value={productionChains.processed.length} />
          </div>
        </div>

        {productionChains.recipes.length === 0 && productionChains.processed.length === 0 ? (
          <div className="rounded-sharp border border-ground-800 bg-ground-950/40 p-4 text-sm text-ground-400 leading-relaxed">
            {t('admin.world.productionEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-4">{t('admin.world.colRecipe')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colInput')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colOutput')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colHolder')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {productionChains.recipes.map((recipe) => (
                  <ProductionRecipeView
                    key={recipe.recipeId}
                    recipe={recipe}
                    processed={productionChains.processed.find((row) => row.recipeId === recipe.recipeId && row.holderId === recipe.holderId) ?? null}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gi-panel p-5 flex flex-col gap-4 border-rust-700/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-sm uppercase tracking-tightest text-rust-300">
              {t('admin.world.marketHeading')}
            </h2>
            <p className="text-[12px] text-ground-400 leading-relaxed">
              {t('admin.world.marketDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-display uppercase tracking-tightest">
            <Badge label={t('admin.world.marketRows')} value={marketPrices.length} />
          </div>
        </div>

        {marketPrices.length === 0 ? (
          <div className="rounded-sharp border border-ground-800 bg-ground-950/40 p-4 text-sm text-ground-400 leading-relaxed">
            {t('admin.world.marketEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-4">{t('admin.world.colGoods')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colSupply')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colDemand')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colPrice')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colMarket')}</th>
                  <th className="text-left py-2 pr-4">{t('admin.world.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {marketPrices.map((row) => (
                  <MarketPriceView key={`${row.settlementId}:${row.goodsId}`} row={row} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gi-panel p-5 flex flex-col gap-4 border-emerald-700/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-sm uppercase tracking-tightest text-emerald-300">
              Migration Routes
            </h2>
            <p className="text-[12px] text-ground-400 leading-relaxed">
              Phase E1.3 — abstract animal migration waves between adjacent ecosystem tiles. pressure = over carrying capacity; seasonal = periodic cadence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-display uppercase tracking-tightest">
            <Badge label="waves" value={migrationWaves.length} />
          </div>
        </div>

        {migrationWaves.length === 0 ? (
          <div className="rounded-sharp border border-ground-800 bg-ground-950/40 p-4 text-sm text-ground-400 leading-relaxed">
            No migration waves recorded yet. Migrations emit at cadence ticks when pressure or seasonal conditions are met.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-4">Species</th>
                  <th className="text-left py-2 pr-4">From</th>
                  <th className="text-left py-2 pr-4">To</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-right py-2 pr-4">Count</th>
                  <th className="text-right py-2 pr-4">Started @tick</th>
                </tr>
              </thead>
              <tbody>
                {migrationWaves.map((wave) => (
                  <tr key={wave.waveId} className="border-t border-ground-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-ground-200">{wave.speciesId}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ground-400">{wave.fromTileId}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ground-400">{wave.toTileId}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-[11px] font-display uppercase tracking-tightest ${wave.migrationType === 'pressure' ? 'text-amber-400' : 'text-cyan-400'}`}>
                        {wave.migrationType}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs text-ground-200">{wave.count}</td>
                    <td className="py-2 pr-4 text-right font-mono text-xs text-ground-500">{wave.startedAtTick}</td>
                  </tr>
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

function GoodsRow({ row, tileName, t }: { row: GoodsInventoryRow; tileName: string; t: Translator }) {
  return (
    <tr className="border-t border-ground-800/50">
      <td className="py-3 pr-4 text-ground-100">
        <div>{goodsLabel(row.goodsId, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.goodsId}</div>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-moss-300">{row.quantity}</td>
      <td className="py-3 pr-4 text-ground-300">
        <div>{holderTypeLabel(row.holderType, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.holderId}</div>
      </td>
      <td className="py-3 pr-4 text-ground-300">
        <div>{tileName}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.tileId}</div>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-400">{row.lastUpdatedTick}</td>
    </tr>
  )
}

function TradeRouteView({ row, tileNameById, t }: { row: TradeRouteRow; tileNameById: Map<string, string>; t: Translator }) {
  const fromName = tileNameById.get(row.fromTileId) ?? row.fromTileId
  const toName = tileNameById.get(row.toTileId) ?? row.toTileId
  return (
    <tr className="border-t border-ground-800/50">
      <td className="py-3 pr-4 text-ground-100">
        <div>{fromName} → {toName}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.routeId}</div>
      </td>
      <td className="py-3 pr-4 text-ground-300">
        <div>{goodsLabel(row.goodsId, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.goodsId}</div>
      </td>
      <td className="py-3 pr-4">
        <span className={row.open ? 'text-amber-300' : 'text-ground-500'}>
          {row.open ? t('admin.world.routeOpen') : t('admin.world.routeClosed')}
        </span>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-400">{row.closedAtTick ?? row.openedAtTick}</td>
    </tr>
  )
}

function GoodsTransportView({ row, tileNameById, t }: { row: GoodsTransportRow; tileNameById: Map<string, string>; t: Translator }) {
  const fromName = tileNameById.get(row.fromTileId) ?? row.fromTileId
  const toName = tileNameById.get(row.toTileId) ?? row.toTileId
  const statusClass = row.status === 'lost' ? 'text-rust-300' : row.status === 'arrived' ? 'text-moss-300' : 'text-amber-300'
  return (
    <tr className="border-t border-ground-800/50">
      <td className="py-3 pr-4 text-ground-100">
        <div>{fromName} → {toName}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.transportId}</div>
        <div className="font-mono text-[11px] text-ground-600">{row.carrierNpcId}</div>
      </td>
      <td className="py-3 pr-4 text-ground-300">
        <div className="font-mono text-xs text-amber-300">{row.quantity}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.goodsId}</div>
      </td>
      <td className="py-3 pr-4">
        <span className={statusClass}>{transportStatusLabel(row.status, t)}</span>
        {row.lossReason ? <div className="font-mono text-[11px] text-rust-400">{row.lossReason}</div> : null}
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-400">{row.resolvedAtTick ?? row.startedAtTick}</td>
    </tr>
  )
}

function ProductionRecipeView({ recipe, processed, t }: { recipe: ProductionRecipeRow; processed: ProductionProcessRow | null; t: Translator }) {
  return (
    <tr className="border-t border-ground-800/50">
      <td className="py-3 pr-4 text-ground-100">
        <div>{productionRecipeLabel(recipe.recipeId, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{recipe.recipeId}</div>
      </td>
      <td className="py-3 pr-4 text-ground-300">
        <div>{recipe.inputQuantity} × {goodsLabel(recipe.inputGoodsId, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{t('admin.world.totalProcessedQuantity', { value: processed ? processed.inputQuantityTotal : 0 })}</div>
      </td>
      <td className="py-3 pr-4 text-violet-300">
        <div>{recipe.outputQuantity} × {goodsLabel(recipe.outputGoodsId, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{t('admin.world.totalProcessedQuantity', { value: processed ? processed.outputQuantityTotal : 0 })}</div>
      </td>
      <td className="py-3 pr-4 text-ground-300">
        <div>{holderTypeLabel(recipe.holderType, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{recipe.holderId}</div>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-400">{processed?.lastProcessedTick ?? t('admin.world.none')}</td>
    </tr>
  )
}

function MarketPriceView({ row, t }: { row: MarketPriceRow; t: Translator }) {
  const scarce = row.supplyQuantity < row.demandQuantity
  return (
    <tr className="border-t border-ground-800/50">
      <td className="py-3 pr-4 text-ground-100">
        <div>{goodsLabel(row.goodsId, t)}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.goodsId}</div>
      </td>
      <td className={['py-3 pr-4 font-mono text-xs', scarce ? 'text-rust-300' : 'text-moss-300'].join(' ')}>{row.supplyQuantity}</td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-300">{row.demandQuantity}</td>
      <td className="py-3 pr-4 font-mono text-xs text-rust-300">{t('admin.world.priceGold', { value: row.priceGold })}</td>
      <td className="py-3 pr-4 text-ground-300">
        <div>{row.marketId}</div>
        <div className="font-mono text-[11px] text-ground-500">{row.settlementId}</div>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-ground-400">{row.lastDiscoveredTick}</td>
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

function readGoodsRows(facts: Record<string, unknown>): GoodsInventoryRow[] {
  const raw = facts.goodsInventory
  if (!Array.isArray(raw)) return []
  return raw.filter(isGoodsInventoryRow).sort(
    (a, b) =>
      a.holderType.localeCompare(b.holderType) ||
      a.holderId.localeCompare(b.holderId) ||
      a.goodsId.localeCompare(b.goodsId)
  )
}

function readLogistics(facts: Record<string, unknown>): LogisticsSnapshot {
  const raw = facts.logistics
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { routes: [], transports: [] }
  const snapshot = raw as { routes?: unknown; transports?: unknown }
  return {
    routes: Array.isArray(snapshot.routes) ? snapshot.routes.filter(isTradeRouteRow).sort((a, b) => a.routeId.localeCompare(b.routeId)) : [],
    transports: Array.isArray(snapshot.transports)
      ? snapshot.transports.filter(isGoodsTransportRow).sort((a, b) => b.startedAtTick - a.startedAtTick || a.transportId.localeCompare(b.transportId))
      : [],
  }
}

function readProductionChains(facts: Record<string, unknown>): ProductionChainsSnapshot {
  const raw = facts.productionChains
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { recipes: [], processed: [] }
  const snapshot = raw as { recipes?: unknown; processed?: unknown }
  return {
    recipes: Array.isArray(snapshot.recipes) ? snapshot.recipes.filter(isProductionRecipeRow).sort((a, b) => a.recipeId.localeCompare(b.recipeId)) : [],
    processed: Array.isArray(snapshot.processed) ? snapshot.processed.filter(isProductionProcessRow).sort((a, b) => a.recipeId.localeCompare(b.recipeId)) : [],
  }
}

function readMarketPrices(facts: Record<string, unknown>): MarketPriceRow[] {
  const raw = facts.marketPrices
  if (!Array.isArray(raw)) return []
  return raw.filter(isMarketPriceRow).sort((a, b) => a.settlementId.localeCompare(b.settlementId) || a.goodsId.localeCompare(b.goodsId))
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

function isGoodsInventoryRow(value: unknown): value is GoodsInventoryRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<GoodsInventoryRow>
  return (
    typeof row.goodsId === 'string' &&
    (row.holderType === 'npc' || row.holderType === 'building' || row.holderType === 'settlement') &&
    typeof row.holderId === 'string' &&
    typeof row.tileId === 'string' &&
    typeof row.quantity === 'number' &&
    typeof row.lastUpdatedTick === 'number' &&
    typeof row.lastSequence === 'number'
  )
}

function isTradeRouteRow(value: unknown): value is TradeRouteRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<TradeRouteRow>
  return (
    typeof row.routeId === 'string' &&
    typeof row.fromTileId === 'string' &&
    typeof row.toTileId === 'string' &&
    typeof row.goodsId === 'string' &&
    typeof row.open === 'boolean' &&
    typeof row.openedAtTick === 'number' &&
    (row.closedAtTick === null || typeof row.closedAtTick === 'number') &&
    typeof row.lastSequence === 'number'
  )
}

function isGoodsTransportRow(value: unknown): value is GoodsTransportRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<GoodsTransportRow>
  return (
    typeof row.transportId === 'string' &&
    typeof row.routeId === 'string' &&
    typeof row.goodsId === 'string' &&
    typeof row.quantity === 'number' &&
    typeof row.carrierNpcId === 'string' &&
    isGoodsHolderType(row.fromHolderType) &&
    typeof row.fromHolderId === 'string' &&
    typeof row.fromTileId === 'string' &&
    isGoodsHolderType(row.toHolderType) &&
    typeof row.toHolderId === 'string' &&
    typeof row.toTileId === 'string' &&
    (row.status === 'started' || row.status === 'arrived' || row.status === 'lost') &&
    typeof row.startedAtTick === 'number' &&
    (row.resolvedAtTick === null || typeof row.resolvedAtTick === 'number') &&
    (row.lossReason === null || typeof row.lossReason === 'string') &&
    typeof row.lastSequence === 'number'
  )
}

function isProductionRecipeRow(value: unknown): value is ProductionRecipeRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<ProductionRecipeRow>
  return (
    typeof row.recipeId === 'string' &&
    typeof row.inputGoodsId === 'string' &&
    typeof row.inputQuantity === 'number' &&
    typeof row.outputGoodsId === 'string' &&
    typeof row.outputQuantity === 'number' &&
    isGoodsHolderType(row.holderType) &&
    typeof row.holderId === 'string' &&
    typeof row.tileId === 'string'
  )
}

function isProductionProcessRow(value: unknown): value is ProductionProcessRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<ProductionProcessRow>
  return (
    typeof row.recipeId === 'string' &&
    typeof row.inputGoodsId === 'string' &&
    typeof row.inputQuantityTotal === 'number' &&
    typeof row.outputGoodsId === 'string' &&
    typeof row.outputQuantityTotal === 'number' &&
    isGoodsHolderType(row.holderType) &&
    typeof row.holderId === 'string' &&
    typeof row.tileId === 'string' &&
    typeof row.lastProcessedTick === 'number' &&
    typeof row.lastSequence === 'number'
  )
}

function isMarketPriceRow(value: unknown): value is MarketPriceRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<MarketPriceRow>
  return (
    typeof row.marketId === 'string' &&
    typeof row.settlementId === 'string' &&
    typeof row.goodsId === 'string' &&
    typeof row.supplyQuantity === 'number' &&
    typeof row.demandQuantity === 'number' &&
    typeof row.priceGold === 'number' &&
    typeof row.lastDiscoveredTick === 'number' &&
    typeof row.lastSequence === 'number'
  )
}

function goodsLabel(goodsId: string, t: Translator): string {
  if (goodsId === 'fish') return t('admin.world.goodsFish')
  if (goodsId === 'meat') return t('admin.world.goodsMeat')
  if (goodsId === 'salt_marsh_brine') return t('admin.world.goodsSaltMarshBrine')
  if (goodsId === 'refined_salt') return t('admin.world.goodsRefinedSalt')
  return goodsId
}

function productionRecipeLabel(recipeId: string, t: Translator): string {
  if (recipeId === 'recipe.salt_marsh_brine.refined_salt') return t('admin.world.recipeSaltRefining')
  return recipeId
}

function holderTypeLabel(holderType: GoodsHolderType, t: Translator): string {
  if (holderType === 'npc') return t('admin.world.holderNpc')
  if (holderType === 'building') return t('admin.world.holderBuilding')
  return t('admin.world.holderSettlement')
}

function transportStatusLabel(status: GoodsTransportRow['status'], t: Translator): string {
  if (status === 'arrived') return t('admin.world.transportArrived')
  if (status === 'lost') return t('admin.world.transportLost')
  return t('admin.world.transportStarted')
}

function isGoodsHolderType(value: unknown): value is GoodsHolderType {
  return value === 'npc' || value === 'building' || value === 'settlement'
}

function readMigrationWaves(facts: Record<string, unknown>): AnimalMigrationWaveRow[] {
  const raw = facts.migrationRoutes
  if (!Array.isArray(raw)) return []
  return raw.filter(isAnimalMigrationWaveRow).sort((a, b) => b.startedAtTick - a.startedAtTick || a.speciesId.localeCompare(b.speciesId))
}

function isAnimalMigrationWaveRow(value: unknown): value is AnimalMigrationWaveRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AnimalMigrationWaveRow>
  return (
    typeof row.waveId === 'string' &&
    typeof row.speciesId === 'string' &&
    typeof row.fromTileId === 'string' &&
    typeof row.toTileId === 'string' &&
    (row.migrationType === 'pressure' || row.migrationType === 'seasonal') &&
    typeof row.startedAtTick === 'number' &&
    typeof row.count === 'number'
  )
}

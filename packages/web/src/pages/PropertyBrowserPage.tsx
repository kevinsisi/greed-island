import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useI18n } from '../i18n'
import { api, type ServerPropertyListing, type ServerPropertyListResponse } from '../api/client'

import 'leaflet/dist/leaflet.css'

// Leaflet 預設 marker icon 在 Webpack/Vite 需手動修正路徑
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const TAIWAN_CENTER: L.LatLngTuple = [23.6978, 120.9605]
const DEFAULT_ZOOM = 8
const PAGE_SIZE = 20

type PropertyFilter = {
  region: string
  type: string
  rooms: string
  priceMin: string
  priceMax: string
  sizeMin: string
  sizeMax: string
  ageMax: string
}

const EMPTY_FILTER: PropertyFilter = {
  region: '',
  type: '',
  rooms: '',
  priceMin: '',
  priceMax: '',
  sizeMin: '',
  sizeMax: '',
  ageMax: '',
}

function buildQueryParams(filter: PropertyFilter, page: number): Record<string, string> {
  const params: Record<string, string> = {}
  if (filter.region) params.region = filter.region
  if (filter.type) params.type = filter.type
  if (filter.rooms) params.rooms = filter.rooms
  if (filter.priceMin) params.priceMin = filter.priceMin
  if (filter.priceMax) params.priceMax = filter.priceMax
  if (filter.sizeMin) params.sizeMin = filter.sizeMin
  if (filter.sizeMax) params.sizeMax = filter.sizeMax
  if (filter.ageMax) params.ageMax = filter.ageMax
  params.page = String(page)
  params.limit = String(PAGE_SIZE)
  return params
}

function MapFlyTo({ center, zoom }: { center: L.LatLngTuple; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 })
  }, [map, center, zoom])
  return null
}

export function PropertyBrowserPage() {
  const { t } = useI18n()
  const [listings, setListings] = useState<readonly ServerPropertyListing[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PropertyFilter>({ ...EMPTY_FILTER })
  const [draftFilter, setDraftFilter] = useState<PropertyFilter>({ ...EMPTY_FILTER })
  const [filterOpen, setFilterOpen] = useState(false)
  const [mapCenter, setMapCenter] = useState<L.LatLngTuple>(TAIWAN_CENTER)
  const abortRef = useRef<AbortController | null>(null)

  const fetchListings = useCallback(
    (f: PropertyFilter, p: number) => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      setError(null)

      const params = buildQueryParams(f, p)
      api
        .properties(params)
        .then((data: ServerPropertyListResponse) => {
          if (ac.signal.aborted) return
          setListings(data.listings)
          setTotal(data.total)
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return
          setError(err instanceof Error ? err.message : t('properties.error'))
          setLoading(false)
        })
    },
    [t]
  )

  useEffect(() => {
    fetchListings(filter, page)
    return () => abortRef.current?.abort()
  }, [filter, page, fetchListings])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleApplyFilter = useCallback(() => {
    setFilter({ ...draftFilter })
    setPage(1)
    setFilterOpen(false)
  }, [draftFilter])

  const handleResetFilter = useCallback(() => {
    const reset = { ...EMPTY_FILTER }
    setDraftFilter(reset)
    setFilter(reset)
    setPage(1)
    setFilterOpen(false)
  }, [])

  const handleRegionClick = useCallback(
    (regionName: string, center: L.LatLngTuple) => {
      setDraftFilter((prev) => ({ ...prev, region: regionName }))
      setFilter((prev) => ({ ...prev, region: regionName }))
      setPage(1)
      setMapCenter(center)
      setFilterOpen(false)
    },
    []
  )

  const regionShortcuts = useMemo(
    () => [
      { name: '台北市', center: [25.0330, 121.5654] as L.LatLngTuple },
      { name: '新北市', center: [25.0620, 121.4570] as L.LatLngTuple },
      { name: '台中市', center: [24.1477, 120.6736] as L.LatLngTuple },
      { name: '台南市', center: [22.9999, 120.2269] as L.LatLngTuple },
      { name: '高雄市', center: [22.6273, 120.3014] as L.LatLngTuple },
      { name: '桃園市', center: [24.9936, 121.3010] as L.LatLngTuple },
    ],
    []
  )

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: '480px' }}>
      <header className="flex items-end justify-between gap-3 flex-wrap shrink-0">
        <div className="flex flex-col gap-1">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            {t('properties.eyebrow')}
          </div>
          <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
            {t('properties.title')}
          </h1>
          <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">
            {t('properties.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="gi-touch px-4 py-2 border border-ground-600 rounded-sharp text-sm font-display uppercase tracking-tightest text-ground-300 hover:bg-ground-800 hover:text-ground-100 transition-colors"
        >
          {t('properties.filter.open')}
        </button>
      </header>

      <div className="flex flex-wrap gap-2 items-center shrink-0">
        {regionShortcuts.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => handleRegionClick(r.name, r.center)}
            className={`gi-touch px-3 py-1 text-xs rounded-sharp border transition-colors ${
              filter.region === r.name
                ? 'border-ember-600 bg-ember-500/10 text-ember-400'
                : 'border-ground-700 text-ground-400 hover:border-ground-500 hover:text-ground-200'
            }`}
          >
            {r.name}
          </button>
        ))}
        {filter.region && (
          <button
            type="button"
            onClick={() => {
              const reset = { ...filter, region: '' }
              setFilter(reset)
              setDraftFilter(reset)
              setPage(1)
              setMapCenter(TAIWAN_CENTER)
            }}
            className="gi-touch px-2 py-1 text-xs rounded-sharp border border-ground-700 text-ember-400 hover:bg-ember-500/10 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-ground-500">{t('properties.loading')}</p>
      )}

      {error && (
        <p className="text-sm text-ember-400">{error}</p>
      )}

      {!loading && !error && listings && listings.length === 0 && (
        <p className="text-sm text-ground-600">{t('properties.noData')}</p>
      )}

      <div className="flex-1 min-h-0 rounded-sharp overflow-hidden border border-ground-700">
        <MapContainer
          center={TAIWAN_CENTER}
          zoom={DEFAULT_ZOOM}
          className="w-full h-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFlyTo center={mapCenter} zoom={filter.region ? 12 : DEFAULT_ZOOM} />
          {listings?.map((item) => (
            <Marker key={item.id} position={[item.lat, item.lng]}>
              <Popup maxWidth={320} minWidth={260}>
                <div className="flex flex-col gap-2 text-sm text-ground-800 font-sans">
                  {item.photoUrls.length > 0 && (
                    <img
                      src={item.photoUrls[0]}
                      alt={item.title}
                      className="w-full h-36 object-cover rounded-sharp"
                      loading="lazy"
                    />
                  )}
                  <h3 className="font-bold text-base text-ground-950 leading-snug">{item.title}</h3>
                  <p className="text-xs text-ground-500">{item.address}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-amber-700 font-bold text-lg">
                      {item.price.toLocaleString()} 萬
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-ground-600">
                    <span>{item.rooms}{t('properties.rooms')}/{item.hall}{t('properties.hall')}/{item.bath}{t('properties.bath')}</span>
                    <span>{item.sizePing} {t('properties.sizeUnit')}</span>
                    <span>{item.buildingType}</span>
                  </div>
                  {item.floor && (
                    <p className="text-xs text-ground-500">
                      {item.floor}
                    </p>
                  )}
                  {item.age != null && (
                    <p className="text-xs text-ground-500">
                      {item.age === 0
                        ? t('properties.ageNew')
                        : t('properties.ageYears', { n: item.age })}
                    </p>
                  )}
                  <div className="border-t border-ground-200 pt-2 mt-1">
                    <p className="text-xs text-ground-600">
                      <span className="font-medium">{t('properties.agent')}：</span>{item.agentName}
                    </p>
                    <p className="text-xs text-ground-600">
                      <span className="font-medium">{t('properties.contact')}：</span>{item.agentContact}
                    </p>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="text-xs text-ground-500">
            {t('properties.total', { n: total })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gi-touch px-3 py-1 text-xs rounded-sharp border border-ground-700 text-ground-400 hover:bg-ground-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ◀
            </button>
            <span className="text-xs text-ground-400 tabular-nums">
              {t('properties.page', { current: page, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="gi-touch px-3 py-1 text-xs rounded-sharp border border-ground-700 text-ground-400 hover:bg-ground-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ▶
            </button>
          </div>
        </div>
      )}

      {filterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ground-950/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFilterOpen(false)
          }}
        >
          <div className="gi-panel w-full max-w-md mx-4 p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ground-100">
                {t('properties.filter.title')}
              </h2>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="gi-touch px-2 py-1 text-xs text-ground-400 hover:text-ground-100 transition-colors"
              >
                {t('properties.filter.close')}
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-ground-400">
                {t('properties.filter.region')}
                <input
                  type="text"
                  value={draftFilter.region}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, region: e.target.value }))}
                  placeholder={t('properties.filter.region.placeholder')}
                  className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ground-400">
                {t('properties.filter.type')}
                <input
                  type="text"
                  value={draftFilter.type}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, type: e.target.value }))}
                  placeholder={t('properties.filter.type.placeholder')}
                  className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ground-400">
                {t('properties.filter.rooms')}
                <input
                  type="number"
                  min="0"
                  value={draftFilter.rooms}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, rooms: e.target.value }))}
                  className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-ground-400">
                  {t('properties.filter.priceMin')}
                  <input
                    type="number"
                    min="0"
                    value={draftFilter.priceMin}
                    onChange={(e) => setDraftFilter((f) => ({ ...f, priceMin: e.target.value }))}
                    className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-ground-400">
                  {t('properties.filter.priceMax')}
                  <input
                    type="number"
                    min="0"
                    value={draftFilter.priceMax}
                    onChange={(e) => setDraftFilter((f) => ({ ...f, priceMax: e.target.value }))}
                    className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-ground-400">
                  {t('properties.filter.sizeMin')}
                  <input
                    type="number"
                    min="0"
                    value={draftFilter.sizeMin}
                    onChange={(e) => setDraftFilter((f) => ({ ...f, sizeMin: e.target.value }))}
                    className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-ground-400">
                  {t('properties.filter.sizeMax')}
                  <input
                    type="number"
                    min="0"
                    value={draftFilter.sizeMax}
                    onChange={(e) => setDraftFilter((f) => ({ ...f, sizeMax: e.target.value }))}
                    className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-ground-400">
                {t('properties.filter.ageMax')}
                <input
                  type="number"
                  min="0"
                  value={draftFilter.ageMax}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, ageMax: e.target.value }))}
                  className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 placeholder-ground-600 focus:outline-none focus:border-ember-600"
                />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleApplyFilter}
                className="gi-touch flex-1 px-4 py-2 bg-ember-600 text-ground-100 text-sm font-display uppercase tracking-tightest rounded-sharp hover:bg-ember-500 transition-colors"
              >
                {t('properties.filter.apply')}
              </button>
              <button
                type="button"
                onClick={handleResetFilter}
                className="gi-touch flex-1 px-4 py-2 border border-ground-600 text-ground-300 text-sm font-display uppercase tracking-tightest rounded-sharp hover:bg-ground-800 transition-colors"
              >
                {t('properties.filter.reset')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

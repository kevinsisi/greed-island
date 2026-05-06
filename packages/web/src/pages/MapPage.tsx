import { useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { useWorldState } from '../state/WorldStateContext'
import type { MapTile } from '../state/types'

const BIOME_FILL: Record<MapTile['biome'], string> = {
  grass: '#3f6212',
  forest: '#14532d',
  mountain: '#52525b',
  desert: '#a16207',
  water: '#0e7490',
  ruin: '#7c2d12',
}

const BIOME_LABEL: Record<MapTile['biome'], string> = {
  grass: '草原',
  forest: '森林',
  mountain: '山脈',
  desert: '荒地',
  water: '水域',
  ruin: '廢墟',
}

export function MapPage() {
  const { map, npcs } = useWorldState()
  const [selectedId, setSelectedId] = useState<string | null>(map.tiles[0]?.id ?? null)
  const selected = map.tiles.find((t) => t.id === selectedId) ?? null

  const cellSize = 64
  const padding = 32
  const widthPx = map.width * cellSize + padding * 2
  const heightPx = map.height * cellSize + padding * 2

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="ISLAND CARTOGRAPHY"
        title="世界地圖"
        description="這是世界目前的空間事實。點駐點看誰在那裡。"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="gi-panel p-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${widthPx} ${heightPx}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label="World map"
          >
            <defs>
              <pattern
                id="grid"
                width={cellSize}
                height={cellSize}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
                  fill="none"
                  stroke="#292524"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width={widthPx} height={heightPx} fill="#0c0a09" />
            <rect
              x={padding}
              y={padding}
              width={map.width * cellSize}
              height={map.height * cellSize}
              fill="url(#grid)"
            />
            {map.tiles.map((tile) => {
              const cx = padding + tile.x * cellSize + cellSize / 2
              const cy = padding + tile.y * cellSize + cellSize / 2
              const isSelected = tile.id === selectedId
              return (
                <g
                  key={tile.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(tile.id)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 22 : 18}
                    fill={BIOME_FILL[tile.biome]}
                    stroke={isSelected ? '#f59e0b' : '#292524'}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />
                  {tile.npcIds.length > 0 && (
                    <circle cx={cx + 14} cy={cy - 14} r={5} fill="#f59e0b" />
                  )}
                  <text
                    x={cx}
                    y={cy + 36}
                    textAnchor="middle"
                    fontFamily='"Noto Sans TC", sans-serif'
                    fontSize="11"
                    fontWeight="700"
                    fill={isSelected ? '#fbbf24' : '#d6d3d1'}
                  >
                    {tile.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <aside className="gi-panel p-5 flex flex-col gap-3 min-h-[260px]">
          {selected ? (
            <>
              <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
                駐點 · {BIOME_LABEL[selected.biome]}
              </div>
              <h2 className="font-display font-extrabold text-2xl tracking-tightest">
                {selected.name}
              </h2>
              <div className="gi-divider" />
              <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                座標 ({selected.x}, {selected.y})
              </div>
              <div>
                <div className="font-display text-[11px] uppercase tracking-tightest text-ground-500 mb-2">
                  在場 NPC ({selected.npcIds.length})
                </div>
                <ul className="flex flex-col gap-1">
                  {selected.npcIds.length === 0 && (
                    <li className="text-sm text-ground-500 italic">無人駐留。</li>
                  )}
                  {selected.npcIds.map((id) => {
                    const npc = npcs.find((n) => n.id === id)
                    return (
                      <li key={id} className="text-sm text-ground-200">
                        {npc?.name ?? id}{' '}
                        {npc && (
                          <span className="text-ground-500 text-[11px] font-display uppercase tracking-tightest">
                            {npc.role}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          ) : (
            <div className="text-sm text-ground-500">點選地圖上的駐點以查看細節。</div>
          )}
        </aside>
      </div>
    </div>
  )
}

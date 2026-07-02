// Hub world map — SVG vector implementation (Phase M1).
// Replaces PhaserGame/MapScene for HubPage.
// Area map replaced by AreaMapSvg (Phase M2). Building interior: Phase M3.
//
// Visual language: 18th-century nautical chart × salvage-lit treasure port.
// Ground #1a1510, ember #f39c20 warm glow, tide #4db8c8 cold water accents.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DISTRICTS,
  DISTRICT_IDS,
  TILE_SIZE,
  isDistrict,
  type DistrictId,
} from '../../game/districts'
import type {
  FactionLeanId,
  MapAreaOverlay,
  MapConstructionActivity,
  MapNpc,
  MapPlayer,
} from '../../game/MapScene'
import type { HubEcologySummary } from '../../pages/hubEcology'
import { activityGlyphFor, textColorForBg } from '../../game/npcVisuals'
import { visualForSpecies } from '../../game/speciesPalette'

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_W = 800
const VIEW_H = 600
const DEFAULT_NPC_COLOR = 0xf6c560 // NPC_BADGE_COLOR fallback

/**
 * District bounding boxes as [c0, r0, c1, r1] inclusive tile coordinates.
 * Derived from the districtAt() geometry in districts.ts.
 */
type DR = readonly [c0: number, r0: number, c1: number, r1: number]

export const DISTRICT_RECTS: Readonly<Partial<Record<DistrictId, DR>>> = {
  t_forest:     [0,   0,  4,  4],
  t_mountain:   [5,   0, 13,  3],
  t_temple:     [14,  0, 19,  4],
  t_dimai:      [7,   5, 11,  8],
  t_desert:     [0,   9,  4, 12],
  t_central:    [6,   9, 12, 12],
  t_ruin:       [14,  9, 19, 12],
  t_salt_marsh: [15, 13, 19, 14],
  t_dock:       [0,  13, 14, 14],
}

const FACTION_STYLE: Readonly<Record<FactionLeanId, {
  fill: string
  stroke: string
  strokeDasharray?: string
}>> = {
  tide_hunters: { fill: 'rgba(77,184,200,0.18)',  stroke: '#4db8c8', strokeDasharray: '4 2' },
  guild:        { fill: 'rgba(243,156,32,0.15)',  stroke: '#f39c20' },
  free_runners: { fill: 'rgba(110,200,100,0.15)', stroke: '#6ec864', strokeDasharray: '2 2' },
  civilian:     { fill: 'rgba(0,0,0,0)',          stroke: 'rgba(180,180,180,0.25)' },
}

// ── Pure utilities (exported for tests) ───────────────────────────────────────

/** Convert 24-bit RGB number to CSS hex string. */
export function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

/** Darken a 24-bit RGB number. factor=0.7 → 30% darker. */
export function darkenNum(n: number, factor = 0.7): string {
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.round(((n >> 8)  & 0xff) * factor))
  const b = Math.min(255, Math.round((n         & 0xff) * factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Compute SVG pixel position for an NPC token.
 * - Travelling NPC: mid-point between fromDistrict and toDistrict anchors.
 * - Static NPC: district anchor ± subCol/subRow spread offset.
 */
export function npcPixelPos(npc: MapNpc): [number, number] {
  if (npc.travelRoute) {
    const from = DISTRICTS[npc.travelRoute.fromDistrictId]
    const to   = DISTRICTS[npc.travelRoute.toDistrictId]
    const fx = from.anchor.col * TILE_SIZE + TILE_SIZE / 2
    const fy = from.anchor.row * TILE_SIZE + TILE_SIZE / 2
    const tx = to.anchor.col * TILE_SIZE + TILE_SIZE / 2
    const ty = to.anchor.row * TILE_SIZE + TILE_SIZE / 2
    return [(fx + tx) / 2, (fy + ty) / 2]
  }

  const def    = DISTRICTS[npc.districtId]
  const anchorX = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
  const anchorY = def.anchor.row * TILE_SIZE + TILE_SIZE / 2

  if (npc.subCol !== undefined && npc.subRow !== undefined) {
    // subCol: 0..14 (center≈7), subRow: 0..9 (center≈4.5)
    // Spread NPCs within ±1.8 tiles of district anchor.
    const SPREAD = TILE_SIZE * 1.8
    const ox = ((npc.subCol - 7)   / 7)   * SPREAD
    const oy = ((npc.subRow - 4.5) / 4.5) * SPREAD
    return [anchorX + ox, anchorY + oy]
  }

  return [anchorX, anchorY]
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorldMapSvgProps {
  npcs: MapNpc[]
  players?: MapPlayer[]
  locale: 'zh' | 'en'
  playerName?: string | null
  hudStrings: { interact: string; enterArea: string }
  onAreaEnter: (districtId: DistrictId) => void
  onNpcInteract: (npcId: string) => void
  onPositionChange?: (pos: { x: number; y: number; z: number }) => void
  areaOverlays?: MapAreaOverlay[]
  activeDistrictIds?: DistrictId[]
  constructionActivities?: MapConstructionActivity[]
  ecologyByTile?: readonly HubEcologySummary[]
  controlsEnabled?: boolean
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WorldMapSvg({
  npcs,
  players = [],
  locale,
  onAreaEnter,
  onNpcInteract,
  onPositionChange,
  areaOverlays = [],
  activeDistrictIds,
  constructionActivities = [],
  ecologyByTile = [],
  controlsEnabled = true,
}: WorldMapSvgProps) {
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictId | null>(null)

  // null activeSet = all districts are active (no restriction)
  const activeSet = useMemo(
    () => (activeDistrictIds ? new Set<DistrictId>(activeDistrictIds) : null),
    [activeDistrictIds],
  )

  const isActiveDistrict = useCallback(
    (id: DistrictId) => !isDistrict(id) || activeSet === null || activeSet.has(id),
    [activeSet],
  )

  // Group construction activities by district
  const constructionMap = useMemo(() => {
    const m = new Map<DistrictId, MapConstructionActivity[]>()
    for (const a of constructionActivities) {
      const arr = m.get(a.districtId) ?? []
      arr.push(a)
      m.set(a.districtId, arr)
    }
    return m
  }, [constructionActivities])

  // Filter ecology to known district IDs
  const districtSet = useMemo(() => new Set<string>(DISTRICT_IDS), [])
  const knownEcology = useMemo(
    () => ecologyByTile.filter(e => districtSet.has(e.tileId)),
    [ecologyByTile, districtSet],
  )

  // Signal initial position for social presence (once on mount)
  useEffect(() => {
    if (!onPositionChange) return
    const def = DISTRICTS['t_central']
    onPositionChange({
      x: def.anchor.col * TILE_SIZE + TILE_SIZE / 2,
      y: def.anchor.row * TILE_SIZE + TILE_SIZE / 2,
      z: 0,
    })
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDistrictClick = useCallback(
    (id: DistrictId) => {
      if (!isActiveDistrict(id)) return
      onAreaEnter(id)
      if (onPositionChange) {
        const def = DISTRICTS[id]
        onPositionChange({
          x: def.anchor.col * TILE_SIZE + TILE_SIZE / 2,
          y: def.anchor.row * TILE_SIZE + TILE_SIZE / 2,
          z: 0,
        })
      }
    },
    [isActiveDistrict, onAreaEnter, onPositionChange],
  )

  return (
    <div
      className="w-full max-w-[800px] mx-auto aspect-[4/3] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
      role="region"
      aria-label={locale === 'zh' ? '世界地圖' : 'World Map'}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <defs>
          <style>{`
            @keyframes wm-float {
              0%, 100% { transform: translateY(0px); }
              50%       { transform: translateY(-3px); }
            }
            .wm-float { animation: wm-float 3s ease-in-out infinite; }
          `}</style>
          <marker id="wm-arr-dep" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#c87920" opacity="0.75" />
          </marker>
          <marker id="wm-arr-arv" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#4ec860" opacity="0.75" />
          </marker>
        </defs>

        {/* ── Layer 0: Background (road / street fill) ──────────────────── */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#2a2e36" />

        {/* ── Layer 1: District fills ───────────────────────────────────── */}
        {DISTRICT_IDS.map(id => {
          const dr = DISTRICT_RECTS[id]
          if (!dr) return null
          const def    = DISTRICTS[id]
          const [c0, r0, c1, r1] = dr
          const active = isActiveDistrict(id)
          return (
            <rect
              key={id}
              x={c0 * TILE_SIZE}
              y={r0 * TILE_SIZE}
              width={(c1 - c0 + 1) * TILE_SIZE}
              height={(r1 - r0 + 1) * TILE_SIZE}
              fill={darkenNum(def.color, active ? 0.68 : 0.38)}
              stroke="#6b5e4a"
              strokeWidth="1.5"
              opacity={active ? 1 : 0.6}
              pointerEvents="none"
            />
          )
        })}

        {/* ── Layer 2: Faction / safety / economy overlays ──────────────── */}
        {areaOverlays.map(o => {
          const dr = DISTRICT_RECTS[o.districtId]
          if (!dr) return null
          const [c0, r0, c1, r1] = dr
          const x = c0 * TILE_SIZE
          const y = r0 * TILE_SIZE
          const w = (c1 - c0 + 1) * TILE_SIZE
          const h = (r1 - r0 + 1) * TILE_SIZE
          const fs = o.dominantFaction ? FACTION_STYLE[o.dominantFaction] : null
          return (
            <g key={`ov-${o.districtId}`} pointerEvents="none">
              {/* Safety warning: dim red haze */}
              {o.safety < 40 && (
                <rect x={x} y={y} width={w} height={h} fill="rgba(180,30,30,0.12)" />
              )}
              {/* Economy highlight: ember dot in corner */}
              {o.economy > 70 && (
                <circle cx={x + w - 10} cy={y + 10} r="8" fill="rgba(243,156,32,0.30)" />
              )}
              {/* Faction overlay: fill + faction-colour border */}
              {fs && (
                <rect
                  x={x} y={y} width={w} height={h}
                  fill={fs.fill}
                  stroke={fs.stroke}
                  strokeWidth="2"
                  strokeDasharray={fs.strokeDasharray}
                />
              )}
            </g>
          )
        })}

        {/* ── Layer 3: Migration arrows ─────────────────────────────────── */}
        {knownEcology.flatMap(eco =>
          eco.migrationsDeparting.map((m, i) => {
            if (!districtSet.has(m.toTileId)) return null
            const fromDef = DISTRICTS[eco.tileId as DistrictId]
            const toDef   = DISTRICTS[m.toTileId as DistrictId]
            const fx = fromDef.anchor.col * TILE_SIZE + TILE_SIZE / 2
            const fy = fromDef.anchor.row * TILE_SIZE + TILE_SIZE / 2
            const tx = toDef.anchor.col   * TILE_SIZE + TILE_SIZE / 2
            const ty = toDef.anchor.row   * TILE_SIZE + TILE_SIZE / 2
            return (
              <line
                key={`mig-${eco.tileId}-${i}`}
                x1={fx} y1={fy} x2={tx} y2={ty}
                stroke="#c87920" strokeWidth="1.5"
                opacity="0.75"
                markerEnd="url(#wm-arr-dep)"
                pointerEvents="none"
              />
            )
          })
        )}

        {/* ── Layer 4: District name labels ─────────────────────────────── */}
        {DISTRICT_IDS.map(id => {
          const dr = DISTRICT_RECTS[id]
          if (!dr) return null
          const def    = DISTRICTS[id]
          const [c0, r0, c1] = dr
          const cx     = ((c0 + c1 + 1) / 2) * TILE_SIZE
          const ty     = r0 * TILE_SIZE + 14
          const active = isActiveDistrict(id)
          return (
            <text
              key={`lbl-${id}`}
              x={cx} y={ty}
              textAnchor="middle"
              fill={active ? '#fff5b8' : '#6b5e4a'}
              fontSize="11"
              fontFamily="'Big Shoulders Display', system-ui, sans-serif"
              fontWeight="800"
              letterSpacing="0.04em"
              pointerEvents="none"
            >
              {locale === 'zh' ? def.nameZh : def.nameEn}
            </text>
          )
        })}

        {/* ── Layer 5: Ecology badges (top-right of district) ───────────── */}
        {knownEcology.map(eco => {
          if (eco.badges.length === 0 && eco.predatorWarningSpecies.length === 0) return null
          const dr = DISTRICT_RECTS[eco.tileId as DistrictId]
          if (!dr) return null
          const [, r0, c1] = dr
          // Anchor badges at top-right of district bounding box
          const bx = (c1 + 1) * TILE_SIZE - 4
          const by = r0 * TILE_SIZE + 26
          return (
            <g key={`eco-${eco.tileId}`} pointerEvents="none">
              {eco.badges.map((badge, i) => {
                const vis = visualForSpecies(badge.speciesId)
                return (
                  <text
                    key={badge.speciesId}
                    x={bx}
                    y={by + i * 14}
                    textAnchor="end"
                    fontSize="10"
                    fill="#d4c89a"
                    fontFamily="system-ui, sans-serif"
                  >
                    {vis.emoji}×{badge.count}
                  </text>
                )
              })}
              {eco.predatorWarningSpecies.length > 0 && (
                <text
                  x={bx}
                  y={by + eco.badges.length * 14}
                  fontSize="10"
                  fill="#c0532a"
                  textAnchor="end"
                >
                  ⚠
                </text>
              )}
            </g>
          )
        })}

        {/* ── Layer 6: Construction badges (float above district bottom) ── */}
        {Array.from(constructionMap.entries()).map(([id, acts]) => {
          const dr = DISTRICT_RECTS[id]
          if (!dr || acts.length === 0) return null
          const a     = acts[0]!
          const [c0, , c1, r1] = dr
          const cx    = ((c0 + c1 + 1) / 2) * TILE_SIZE
          const by    = (r1 + 1) * TILE_SIZE - 6
          const names = a.builderNames.slice(0, 2).join(', ')
          return (
            <g key={`ct-${id}`} pointerEvents="none">
              <g className="wm-float">
                <rect
                  x={cx - 44} y={by - 13}
                  width="88"  height="15"
                  rx="2" ry="2"
                  fill="#2d1f0a" stroke="#f39c20" strokeWidth="0.75"
                />
                <text
                  x={cx} y={by - 2}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#f39c20"
                  fontFamily="'JetBrains Mono', 'Courier New', monospace"
                >
                  {`🔨 ${a.progressAfter}/${a.targetProgress}${names ? ` ${names}` : ''}`}
                </text>
              </g>
            </g>
          )
        })}

        {/* ── Layer 7: District click zones ────────────────────────────── */}
        {DISTRICT_IDS.map(id => {
          const dr = DISTRICT_RECTS[id]
          if (!dr) return null
          const [c0, r0, c1, r1] = dr
          const active = isActiveDistrict(id)
          return (
            <rect
              key={`zone-${id}`}
              x={c0 * TILE_SIZE}
              y={r0 * TILE_SIZE}
              width={(c1 - c0 + 1) * TILE_SIZE}
              height={(r1 - r0 + 1) * TILE_SIZE}
              fill={hoveredDistrict === id && active ? 'rgba(243,156,32,0.1)' : 'transparent'}
              style={{ cursor: active && controlsEnabled ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredDistrict(id)}
              onMouseLeave={() => setHoveredDistrict(prev => (prev === id ? null : prev))}
              onClick={controlsEnabled ? () => handleDistrictClick(id) : undefined}
            />
          )
        })}

        {/* ── Layer 8: Peer player tokens ──────────────────────────────── */}
        {players
          .filter(p => p.x != null && p.y != null)
          .map(p => (
            <g
              key={`peer-${p.id}`}
              style={{
                transform: `translate(${p.x!}px, ${p.y!}px)`,
                transition: 'transform 1.8s ease-in-out',
              }}
              pointerEvents="none"
            >
              <circle r="7" fill="#4db8c8" stroke="#fff5b8" strokeWidth="1" opacity="0.85" />
              <text
                y="3"
                textAnchor="middle"
                fontSize="7"
                fill="#1a1407"
                fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                fontWeight="700"
              >
                {p.shortName}
              </text>
            </g>
          ))}

        {/* ── Layer 9: NPC tokens ───────────────────────────────────────── */}
        {npcs.map(npc => {
          const [x, y]  = npcPixelPos(npc)
          const npcColor = numToHex(npc.color ?? DEFAULT_NPC_COLOR)
          const tColor   = textColorForBg(npc.color ?? DEFAULT_NPC_COLOR)
          const actEmoji = activityGlyphFor(npc.activity)
          const raw      = npc.recentUtterance
          const truncated = raw
            ? raw.length > 20 ? raw.slice(0, 20) + '…' : raw
            : null
          const isTravelling = !!npc.travelRoute

          return (
            <g
              key={npc.id}
              style={{
                transform: `translate(${x}px, ${y}px)`,
                transition: 'transform 1.8s ease-in-out',
                cursor: 'pointer',
              }}
              onClick={() => onNpcInteract(npc.id)}
              role="button"
              aria-label={npc.name}
            >
              {/* Chat bubble — Phase M1 mount point (Phase M2 can style further) */}
              {truncated && (
                <>
                  <rect
                    x={-50} y={-44}
                    width="100" height="16"
                    rx="3" ry="3"
                    fill="#2d1f0a"
                    stroke="rgba(243,156,32,0.4)"
                    strokeWidth="0.75"
                  />
                  <text
                    y={-32}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#f39c20"
                    fontFamily="system-ui, sans-serif"
                    pointerEvents="none"
                  >
                    {truncated}
                  </text>
                </>
              )}

              {/* Transparent 14px hit area (≥44px touch satisfied by map bounds) */}
              <circle r="14" fill="transparent" />

              {/* Visual token circle */}
              <circle
                r="9"
                fill={npcColor}
                stroke="#fff5b8"
                strokeWidth={isTravelling ? 0.5 : 1}
                opacity={isTravelling ? 0.7 : 1}
              />

              {/* Initials — Big Shoulders Display */}
              <text
                y="3"
                textAnchor="middle"
                fontSize="8"
                fill={tColor}
                fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                fontWeight="800"
                pointerEvents="none"
              >
                {npc.shortName}
              </text>

              {/* Activity emoji (right shoulder) */}
              {actEmoji && (
                <text
                  x="9" y="-4"
                  fontSize="10"
                  pointerEvents="none"
                >
                  {actEmoji}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

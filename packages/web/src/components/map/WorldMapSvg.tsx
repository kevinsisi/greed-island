// Hub world map — SVG vector implementation (Phase M1).
// Replaces PhaserGame/MapScene for HubPage.
// Area map replaced by AreaMapSvg (Phase M2). Building interior: Phase M3.
//
// Visual language: 18th-century nautical chart × salvage-lit treasure port.
// Ground #1a1510, ember #f39c20 warm glow, tide #4db8c8 cold water accents.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { activityGlyphFor } from '../../game/npcVisuals'
import { visualForSpecies } from '../../game/speciesPalette'
import { NpcGlyph, CompassStar } from './tokenMedallion'
import { FigureBody } from './tokenFigure'

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

const SEA_ROUTES: Array<[DistrictId, DistrictId]> = [
  ['t_forest',   't_mountain'],
  ['t_mountain', 't_temple'],
  ['t_mountain', 't_dimai'],
  ['t_dimai',    't_central'],
  ['t_forest',   't_desert'],
  ['t_desert',   't_dock'],
  ['t_central',  't_dock'],
  ['t_ruin',     't_dock'],
  ['t_central',  't_ruin'],
  ['t_temple',   't_ruin'],
  ['t_ruin',     't_salt_marsh'],
]

/** Organic polygon point-strings per district. */
const ISLAND_PATHS: Readonly<Partial<Record<DistrictId, string>>> = {
  t_forest:     '12,15 65,5 115,3 175,16 197,58 198,120 192,175 165,197 102,200 40,196 7,162 4,92',
  t_mountain:   '204,8 295,3 390,2 490,4 552,8 558,52 556,118 548,158 458,162 375,160 290,162 208,158 202,112 200,52',
  t_temple:     '566,10 670,3 792,6 798,58 800,135 794,196 738,200 665,200 584,196 562,157 560,82',
  t_dimai:      '288,208 378,202 472,208 478,254 476,338 465,358 378,362 290,360 282,340 278,252',
  t_desert:     '7,368 82,362 196,368 198,415 200,482 194,518 120,522 38,520 6,512 3,465 0,412',
  t_central:    '248,368 378,362 516,368 520,415 518,484 512,518 378,522 244,518 240,482 238,415',
  t_ruin:       '565,368 680,362 795,368 800,412 800,484 796,518 708,522 618,520 563,516 558,482 560,412',
  t_salt_marsh: '608,525 720,520 798,525 800,562 798,598 726,600 640,598 606,592',
  t_dock:       '6,525 185,520 388,520 554,525 558,565 555,598 378,600 193,598 58,600 6,595',
}

/** Dark, low-saturation ground fill per district. */
const ISLAND_FILL: Readonly<Partial<Record<DistrictId, string>>> = {
  t_forest:     '#1c2e1e',
  t_mountain:   '#182418',
  t_temple:     '#142236',
  t_dimai:      '#221438',
  t_desert:     '#262228',
  t_central:    '#281520',
  t_ruin:       '#281c10',
  t_dock:       '#12222e',
  t_salt_marsh: '#182428',
}

/** Slightly lighter stroke per district. */
const ISLAND_STROKE: Readonly<Partial<Record<DistrictId, string>>> = {
  t_forest:     '#3a5838',
  t_mountain:   '#2a4028',
  t_temple:     '#263858',
  t_dimai:      '#3c2858',
  t_desert:     '#404040',
  t_central:    '#482035',
  t_ruin:       '#4a3020',
  t_dock:       '#204050',
  t_salt_marsh: '#2e4848',
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

// ── NPC idle drift (module-level, deterministic) ──────────────────────────────

function npcIdleDrift(npcId: string, tick: number): { dx: number; dy: number } {
  let h = 5381
  for (let i = 0; i < npcId.length; i++) h = ((h * 33) ^ npcId.charCodeAt(i)) >>> 0
  const phase = tick * 0.35 + (h % 628) / 100
  const amp   = 1.6 + (h % 10) * 0.08
  return {
    dx: Math.cos(phase + (h % 20) * 0.31) * amp,
    dy: Math.sin(phase * 1.25 + (h % 15) * 0.44) * amp,
  }
}

// ── Player position persistence ──────────────────────────────────────────────

const HUB_POS_KEY = 'gi:hubPos:v2'

function loadHubPlayerDistrict(): DistrictId | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(HUB_POS_KEY)
    if (raw && isDistrict(raw as DistrictId)) return raw as DistrictId
  } catch { /* storage unavailable */ }
  return null
}

function saveHubPlayerDistrict(id: DistrictId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HUB_POS_KEY, id)
  } catch { /* quota */ }
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
  playerName,
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
  const [playerDistrictId, setPlayerDistrictId] = useState<DistrictId | null>(loadHubPlayerDistrict)

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

  // NPC idle drift tick
  const driftTickRef = useRef(0)
  const [driftTick, setDriftTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      driftTickRef.current += 1
      setDriftTick(driftTickRef.current)
    }, 3500)
    return () => clearInterval(id)
  }, [])

  const idleDrift = useMemo(() => {
    const m = new Map<string, { dx: number; dy: number }>()
    for (const npc of npcs) m.set(npc.id, npcIdleDrift(npc.id, driftTick))
    return m
  }, [npcs, driftTick])

  const playerPixelPos = useMemo(() => {
    if (!playerDistrictId) return null
    const def = DISTRICTS[playerDistrictId]
    return {
      x: def.anchor.col * TILE_SIZE + TILE_SIZE / 2,
      y: def.anchor.row * TILE_SIZE + TILE_SIZE / 2,
    }
  }, [playerDistrictId])

  const handleDistrictClick = useCallback(
    (id: DistrictId) => {
      if (!isActiveDistrict(id)) return
      if (controlsEnabled) {
        setPlayerDistrictId(id)
        saveHubPlayerDistrict(id)
      }
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
    [isActiveDistrict, controlsEnabled, onAreaEnter, onPositionChange],
  )

  return (
    <div
      className="w-full mx-auto aspect-[4/3] sm:aspect-[16/9] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
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
            @keyframes wm-npc-pulse { 0%,100% { opacity:1 } 50% { opacity:0.2 } }
            @keyframes wm-player-breathe { 0%,100% { opacity:0.3 } 50% { opacity:0.85 } }
            .wm-npc-pulse { animation: wm-npc-pulse 1.8s ease-in-out infinite; }
            @keyframes wm-ember-pulse { 0%,100% { opacity:0.4 } 50% { opacity:0.88 } }
            .wm-ember-pulse { animation: wm-ember-pulse 2.8s ease-in-out infinite; }
            .wm-npc:hover > g { filter: drop-shadow(0 0 5px rgba(243,156,32,0.65)); }
          `}</style>
          <radialGradient id="wm-npc-base" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#2d2418" />
            <stop offset="100%" stopColor="#120d06" />
          </radialGradient>
          <radialGradient id="wm-player-base" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#14232a" />
            <stop offset="100%" stopColor="#08101a" />
          </radialGradient>
          <radialGradient id="wm-sea-center" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#0f1e30" stopOpacity="1"/>
            <stop offset="100%" stopColor="#07111e" stopOpacity="0"/>
          </radialGradient>
          <marker id="wm-arr-dep" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#c87920" opacity="0.75" />
          </marker>
          <marker id="wm-arr-arv" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#4ec860" opacity="0.75" />
          </marker>
        </defs>

        {/* ── Layer 0: Background (dark sea) ────────────────────────────── */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#07111e"/>
        {/* subtle center highlight */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-sea-center)" opacity="0.6"/>

        {/* ── Sea routes (dashed lines between adjacent district anchors) ── */}
        {SEA_ROUTES.map(([a, b]) => {
          const defA = DISTRICTS[a], defB = DISTRICTS[b]
          const x1 = defA.anchor.col * TILE_SIZE + TILE_SIZE / 2
          const y1 = defA.anchor.row * TILE_SIZE + TILE_SIZE / 2
          const x2 = defB.anchor.col * TILE_SIZE + TILE_SIZE / 2
          const y2 = defB.anchor.row * TILE_SIZE + TILE_SIZE / 2
          return (
            <line key={`route-${a}-${b}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#4db8c8" strokeWidth="0.8"
              strokeOpacity="0.18"
              strokeDasharray="9 14"
              pointerEvents="none"
            />
          )
        })}

        {/* ── Layer 1: Island fills ────────────────────────────────────────── */}
        {DISTRICT_IDS.map(id => {
          const path = ISLAND_PATHS[id]
          if (!path) return null
          const active = isActiveDistrict(id)
          const fill   = ISLAND_FILL[id]   ?? '#1a1a1a'
          const stroke = active ? (ISLAND_STROKE[id] ?? '#3a3a3a') : '#1e1e1e'
          return (
            <polygon
              key={id}
              points={path}
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity={active ? 1 : 0.45}
              pointerEvents="none"
            />
          )
        })}

        {/* ── Layer 1b: Hover highlight ────────────────────────────────────── */}
        {hoveredDistrict && isActiveDistrict(hoveredDistrict) && (() => {
          const path = ISLAND_PATHS[hoveredDistrict]
          if (!path) return null
          return (
            <polygon
              points={path}
              fill="rgba(243,156,32,0.07)"
              stroke="#f39c20"
              strokeWidth="1.5"
              strokeOpacity="0.35"
              pointerEvents="none"
            />
          )
        })()}

        {/* ── Layer 2: Faction / safety / economy overlays ──────────────── */}
        {areaOverlays.map(o => {
          const path = ISLAND_PATHS[o.districtId]
          if (!path) return null
          const fs = o.dominantFaction ? FACTION_STYLE[o.dominantFaction] : null
          return (
            <g key={`ov-${o.districtId}`} pointerEvents="none">
              {o.safety < 40 && (
                <polygon points={path} fill="rgba(180,30,30,0.12)"/>
              )}
              {o.economy > 70 && (
                <polygon points={path} fill="rgba(243,156,32,0.08)"/>
              )}
              {fs && (
                <polygon
                  points={path}
                  fill={fs.fill}
                  stroke={fs.stroke}
                  strokeWidth="1.5"
                  strokeDasharray={fs.strokeDasharray}
                />
              )}
            </g>
          )
        })}

        {/* ── Layer 2b: Ember light dots at district anchors ──────────────── */}
        {DISTRICT_IDS.map(id => {
          if (!isActiveDistrict(id)) return null
          const def = DISTRICTS[id]
          const cx = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
          const cy = def.anchor.row * TILE_SIZE + TILE_SIZE / 2
          return (
            <g key={`ember-${id}`} pointerEvents="none">
              <circle cx={cx} cy={cy} r="6" fill="#f39c20" opacity="0.12" className="wm-ember-pulse"/>
              <circle cx={cx} cy={cy} r="2.8" fill="#f6c560" opacity="0.80" className="wm-ember-pulse"/>
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

        {/* ── Layer 4: District name labels (parchment pill) ──────────────── */}
        {DISTRICT_IDS.map(id => {
          const dr = DISTRICT_RECTS[id]
          if (!dr) return null
          const def    = DISTRICTS[id]
          const [c0, r0, c1] = dr
          const cx     = ((c0 + c1 + 1) / 2) * TILE_SIZE
          const pillY  = r0 * TILE_SIZE + 20
          const active = isActiveDistrict(id)
          const label  = locale === 'zh' ? def.nameZh : def.nameEn
          const pillW  = Math.max(label.length * 7 + 18, 44)
          return (
            <g key={`lbl-${id}`} pointerEvents="none">
              <rect
                x={cx - pillW / 2} y={pillY - 12}
                width={pillW} height={15}
                rx="4" ry="4"
                fill={active ? 'rgba(22,14,6,0.82)' : 'rgba(15,12,10,0.55)'}
                stroke={active ? '#6a5030' : '#2e2820'}
                strokeWidth="0.75"
              />
              <text
                x={cx} y={pillY}
                textAnchor="middle"
                fill={active ? '#e8d090' : '#4a4040'}
                fontSize="10.5"
                fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                fontWeight="800"
                letterSpacing="0.06em"
              >
                {label}
              </text>
            </g>
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
              {/* Peer player 人形剪影(tide 披風;腳底貼 token 中心下緣) */}
              <g opacity={0.88} transform="translate(0, 12)">
                <FigureBody cloak="#3a7a8a" scale={0.85} />
                <rect x="-9" y="2" width="18" height="7" rx="1.5" fill="rgba(26,16,8,0.82)" />
                <text y="7.5" textAnchor="middle" fontSize="5"
                  fill="#4db8c8" fontFamily="'Big Shoulders Display', system-ui, sans-serif" fontWeight="700">
                  {p.shortName}
                </text>
              </g>
            </g>
          ))}

        {/* ── Layer 8b: Self player token ────────────────────────────────── */}
        {playerPixelPos && controlsEnabled && (
          <g
            style={{
              transform: `translate(${playerPixelPos.x}px, ${playerPixelPos.y}px)`,
              transition: 'transform 0.5s ease-in-out',
            }}
            pointerEvents="none"
          >
            <g opacity={0.95} transform="translate(0, 12)">
              {/* Ember 呼吸光環(圍住人形) */}
              <circle cy={-11} r="15" fill="none" stroke="rgba(243,156,32,0.35)" strokeWidth="2"
                style={{ animation: 'wm-player-breathe 2.5s ease-in-out infinite' }} />
              <FigureBody cloak="#f39c20" scale={0.9} />
              <g transform="translate(0, -10.5) scale(0.5)">
                <CompassStar tideFill="#4db8c8" emberFill="#fff5b8" />
              </g>
              <rect x="-9" y="2" width="18" height="7" rx="1.5" fill="rgba(26,16,8,0.88)" />
              <text y="7.5" textAnchor="middle" fontSize="5"
                fill="#f39c20" fontFamily="'Big Shoulders Display', system-ui, sans-serif" fontWeight="700">
                {playerName ? playerName.charAt(0).toUpperCase() : '你'}
              </text>
            </g>
          </g>
        )}

        {/* ── Layer 9: NPC tokens ───────────────────────────────────────── */}
        {npcs.map(npc => {
          const [baseX, baseY] = npcPixelPos(npc)
          const drift = idleDrift.get(npc.id) ?? { dx: 0, dy: 0 }
          const x = baseX + drift.dx
          const y = baseY + drift.dy
          const npcColor = numToHex(npc.color ?? DEFAULT_NPC_COLOR)
          const actEmoji = activityGlyphFor(npc.activity)
          const raw      = npc.recentUtterance
          const truncated = raw
            ? raw.length > 20 ? raw.slice(0, 20) + '…' : raw
            : null
          const isTravelling = !!npc.travelRoute
          const isLowHealth = typeof npc.health === 'number' && npc.health < 30

          return (
            <g
              key={npc.id}
              className="wm-npc"
              style={{
                transform: `translate(${x}px, ${y}px)`,
                transition: 'transform 4.5s ease-in-out',
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

              {/* NPC Medallion */}
              <g opacity={isTravelling ? 0.65 : 1}>
                {/* Speaking pulse ring */}
                {truncated && (
                  <circle r="13" fill="none" stroke="#f39c20" strokeWidth="1.5"
                    className="wm-npc-pulse" />
                )}
                {/* Outer faction ring */}
                <circle r="11" fill="none"
                  stroke={isLowHealth ? '#c0532a' : (isTravelling ? '#7a6040' : npcColor)}
                  strokeWidth="2" />
                {/* Subtle glow */}
                <circle r="11" fill="none" stroke={npcColor} strokeWidth="4" opacity="0.12" />
                {/* Dark base */}
                <circle r="9" fill="url(#wm-npc-base)" />
                {/* Occupation glyph */}
                <NpcGlyph activity={npc.activity} initial={npc.shortName} color={npcColor} />
                {/* Name pill */}
                <rect x="-10" y="11.5" width="20" height="8" rx="1.5" fill="rgba(26,16,8,0.82)" />
                <text y="17.5" textAnchor="middle" fontSize="5.5"
                  fill={npcColor} fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                  fontWeight="700" letterSpacing="0.03em"
                  pointerEvents="none">
                  {npc.shortName}
                </text>
              </g>

              {/* Activity emoji badge (right upper corner) */}
              {actEmoji && (
                <text
                  x="13" y="-11"
                  fontSize="9"
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

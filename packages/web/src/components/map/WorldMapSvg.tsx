// Hub world map — SVG vector implementation (top-down illustrated city, v0.102).
// Replaces PhaserGame/MapScene for HubPage.
//
// Design goals (painterly-hub-map v4 — "make the hub look like the sub-map"):
//   潮鳴市 as ONE organic island city, drawn in the SAME visual grammar as the
//   area (sub) map: naturalistic terrain materials (grass / stone / sand / water)
//   with deterministic detail marks, a tan street network, DENSE building facades
//   (reusing <BuildingFacade/>) forming neighbourhoods, and actual character
//   figures (reusing <FigureBody/>) — not abstract colour blocks. Wards are
//   irregular Voronoi neighbourhoods that flow together; a tidal river runs
//   through the city. Life is data-driven (people-count per ward, latest event
//   pins a quest marker, busiest ward glows). Legible on a phone.
//   Ember #f39c20 warm light / tide #4db8c8 water.

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
import { BuildingFacade } from './buildingFacade'
import { FigureBody } from './tokenFigure'

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_W = 800
const VIEW_H = 600

const TIDE = '#4db8c8'
const EMBER = '#f39c20'
const SAND = '#e6d3a3'
const STREET = '#8a7550'
const STREET_EDGE = '#5f4e34'

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

const FACTION_STYLE: Readonly<Record<FactionLeanId, { stroke: string; dash?: string }>> = {
  tide_hunters: { stroke: '#4db8c8', dash: '5 3' },
  guild:        { stroke: '#f39c20' },
  free_runners: { stroke: '#6ec864', dash: '3 3' },
  civilian:     { stroke: 'rgba(180,180,180,0.4)' },
}

type Biome = 'forest' | 'mountain' | 'port' | 'ley' | 'flats' | 'town' | 'ruin' | 'dock' | 'marsh'

interface WardMeta {
  biome: Biome
  /** naturalistic terrain base (sub-map palette, tinted per district) */
  ground: string
  /** building roof "type" for BuildingFacade / roofColorFor */
  buildType: string
  /** how built-up: buildings per ward */
  density: number
}

const WARD: Readonly<Record<DistrictId, WardMeta>> = {
  t_forest:     { biome: 'forest',   ground: '#37482c', buildType: 'residential', density: 8 },
  t_mountain:   { biome: 'mountain', ground: '#42392c', buildType: 'workshop',    density: 6 },
  t_temple:     { biome: 'port',     ground: '#37442f', buildType: 'warehouse',   density: 12 },
  t_dimai:      { biome: 'ley',      ground: '#39324a', buildType: 'temple',      density: 6 },
  t_desert:     { biome: 'flats',    ground: '#544631', buildType: 'market',      density: 7 },
  t_central:    { biome: 'town',     ground: '#464a33', buildType: 'tavern',      density: 15 },
  t_ruin:       { biome: 'ruin',     ground: '#463a2b', buildType: 'factory',     density: 8 },
  t_dock:       { biome: 'dock',     ground: '#33454f', buildType: 'warehouse',   density: 10 },
  t_salt_marsh: { biome: 'marsh',    ground: '#2f4650', buildType: 'residential', density: 5 },
  t_road:       { biome: 'flats',    ground: '#8a7550', buildType: 'residential', density: 0 },
}

type Pt = [number, number]

const SEED: Readonly<Record<DistrictId, Pt>> = {
  t_dimai:      [402, 300],
  t_forest:     [196, 196],
  t_mountain:   [406, 138],
  t_temple:     [612, 190],
  t_desert:     [150, 344],
  t_ruin:       [648, 344],
  t_dock:       [292, 486],
  t_central:    [452, 452],
  t_salt_marsh: [636, 486],
  t_road:       [0, 0],
}

const ISLAND_PTS: Pt[] = [
  [122, 158], [210, 100], [322, 78], [430, 72], [548, 88], [652, 122], [714, 182],
  [744, 268], [726, 350], [746, 432], [706, 500], [628, 540], [548, 552],
  [470, 560], [430, 522], [360, 556], [268, 556], [172, 542], [96, 500],
  [62, 424], [80, 338], [58, 262], [88, 196],
]

const RIVER_PATH = 'M406,150 Q430,220 402,300 Q378,378 360,430 Q330,486 292,520'

// ── Geometry ──────────────────────────────────────────────────────────────────

function clipHalfPlane(poly: Pt[], P: Pt, Q: Pt): Pt[] {
  const mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2
  const nx = Q[0] - P[0], ny = Q[1] - P[1]
  const f = (pt: Pt) => (pt[0] - mx) * nx + (pt[1] - my) * ny
  const out: Pt[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const A = poly[i]!, B = poly[(i + 1) % n]!
    const fa = f(A), fb = f(B)
    if (fa <= 0) out.push(A)
    if ((fa <= 0) !== (fb <= 0)) {
      const t = fa / (fa - fb)
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])])
    }
  }
  return out
}

function voronoiCell(id: DistrictId): Pt[] {
  let poly = ISLAND_PTS.slice()
  const P = SEED[id]
  for (const other of DISTRICT_IDS) {
    if (other === id) continue
    poly = clipHalfPlane(poly, P, SEED[other])
    if (poly.length < 3) break
  }
  return poly
}

const CELLS: Partial<Record<DistrictId, Pt[]>> = (() => {
  const m: Partial<Record<DistrictId, Pt[]>> = {}
  for (const id of DISTRICT_IDS) m[id] = voronoiCell(id)
  return m
})()

function roundedPath(pts: Pt[], r = 10): string {
  const n = pts.length
  if (n < 3) return ''
  let d = ''
  for (let i = 0; i < n; i++) {
    const P = pts[(i - 1 + n) % n]!, V = pts[i]!, N = pts[(i + 1) % n]!
    const v1: Pt = [P[0] - V[0], P[1] - V[1]]
    const v2: Pt = [N[0] - V[0], N[1] - V[1]]
    const l1 = Math.hypot(v1[0], v1[1]) || 1
    const l2 = Math.hypot(v2[0], v2[1]) || 1
    const t1 = Math.min(r, l1 / 2) / l1
    const t2 = Math.min(r, l2 / 2) / l2
    const A: Pt = [V[0] + v1[0] * t1, V[1] + v1[1] * t1]
    const B: Pt = [V[0] + v2[0] * t2, V[1] + v2[1] * t2]
    d += (i === 0 ? `M${A[0].toFixed(1)},${A[1].toFixed(1)} ` : `L${A[0].toFixed(1)},${A[1].toFixed(1)} `)
    d += `Q${V[0].toFixed(1)},${V[1].toFixed(1)} ${B[0].toFixed(1)},${B[1].toFixed(1)} `
  }
  return d + 'Z'
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0], yi = poly[i]![1], xj = poly[j]![0], yj = poly[j]![1]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0
  for (const p of poly) { x += p[0]; y += p[1] }
  return [x / poly.length, y / poly.length]
}

function makeRng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = (h ^ seed.charCodeAt(i)) * 16777619 >>> 0
  let s = h >>> 0
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

function scatterInCell(cell: Pt[], seed: Pt, rng: () => number, n: number, spread: number, minR = 0): Pt[] {
  const out: Pt[] = []
  let tries = 0
  while (out.length < n && tries < n * 14) {
    tries++
    const ang = rng() * Math.PI * 2
    const r = (minR + Math.sqrt(rng()) * (spread - minR))
    const p: Pt = [seed[0] + Math.cos(ang) * r, seed[1] + Math.sin(ang) * r]
    if (pointInPoly(p, cell)) out.push(p)
  }
  return out
}

// ── Pure utilities (exported for tests) ───────────────────────────────────────

export function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}
export function darkenNum(n: number, factor = 0.7): string {
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.round(((n >> 8)  & 0xff) * factor))
  const b = Math.min(255, Math.round((n         & 0xff) * factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
export function mixNum(n: number, toward: number, t: number): string {
  const r = Math.round(((n >> 16) & 0xff) * (1 - t) + ((toward >> 16) & 0xff) * t)
  const g = Math.round(((n >> 8)  & 0xff) * (1 - t) + ((toward >> 8)  & 0xff) * t)
  const b = Math.round((n         & 0xff) * (1 - t) + (toward         & 0xff) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
export function lightenNum(n: number, t = 0.3): string { return mixNum(n, 0xffffff, t) }

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
  const def = DISTRICTS[npc.districtId]
  const anchorX = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
  const anchorY = def.anchor.row * TILE_SIZE + TILE_SIZE / 2
  if (npc.subCol !== undefined && npc.subRow !== undefined) {
    const SPREAD = TILE_SIZE * 1.8
    return [anchorX + ((npc.subCol - 7) / 7) * SPREAD, anchorY + ((npc.subRow - 4.5) / 4.5) * SPREAD]
  }
  return [anchorX, anchorY]
}

// ── Terrain detail marks (deterministic, sub-map grammar) ─────────────────────

function TerrainMarks({ id }: { id: DistrictId }) {
  const cell = CELLS[id]; if (!cell) return null
  const meta = WARD[id]
  const rng = makeRng(id + 'terr')
  const seed = SEED[id]
  const pts = scatterInCell(cell, seed, rng, 14, 78)
  return (
    <g pointerEvents="none">
      {pts.map((p, i) => {
        const k = `${id}-t-${i}`
        const s = 0.8 + rng() * 0.7
        const t = `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${s.toFixed(2)})`
        switch (meta.biome) {
          case 'forest':
            return <g key={k} transform={t}><path d="M0,2 L0,-1" stroke="#2c3f22" strokeWidth={1} /><path d="M0,-5 L2.6,0 L-2.6,0 Z" fill="#3f5230" /></g>
          case 'mountain': case 'ruin':
            return <path key={k} transform={t} d="M-3,2 L0,-2.5 L3,2 Z" fill={meta.biome === 'ruin' ? '#4a3d2c' : '#4a5260'} opacity={0.8} />
          case 'flats':
            return <ellipse key={k} transform={t} cx={0} cy={0} rx={3} ry={1.1} fill="#6f6045" opacity={0.6} />
          case 'dock': case 'marsh':
            return <path key={k} transform={t} d="M-4,0 Q-2,-2 0,0 Q2,2 4,0" fill="none" stroke="#3d6c85" strokeWidth={1} opacity={0.6} />
          case 'ley':
            return <path key={k} transform={t} d="M0,-2.6 L1.1,0 L0,2.6 L-1.1,0 Z" fill="#b89bd8" opacity={0.5} />
          default: // town, port
            return <rect key={k} transform={t} x={-1.5} y={-1.5} width={3} height={3} rx={0.6} fill="#5b5038" opacity={0.5} />
        }
      })}
    </g>
  )
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
  focusDistrictId?: DistrictId | null
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WorldMapSvg({
  npcs,
  locale,
  playerName,
  onAreaEnter,
  onPositionChange,
  areaOverlays = [],
  activeDistrictIds,
  constructionActivities = [],
  controlsEnabled = true,
  focusDistrictId = null,
}: WorldMapSvgProps) {
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictId | null>(null)
  const [playerDistrictId, setPlayerDistrictId] = useState<DistrictId | null>(loadHubPlayerDistrict)

  const activeSet = useMemo(
    () => (activeDistrictIds ? new Set<DistrictId>(activeDistrictIds) : null),
    [activeDistrictIds],
  )
  const isActiveDistrict = useCallback(
    (id: DistrictId) => !isDistrict(id) || activeSet === null || activeSet.has(id),
    [activeSet],
  )

  const npcsByDistrict = useMemo(() => {
    const m = new Map<DistrictId, MapNpc[]>()
    for (const npc of npcs) {
      const arr = m.get(npc.districtId) ?? []; arr.push(npc); m.set(npc.districtId, arr)
    }
    return m
  }, [npcs])

  const constructionByDistrict = useMemo(() => {
    const m = new Map<DistrictId, MapConstructionActivity[]>()
    for (const a of constructionActivities) {
      const arr = m.get(a.districtId) ?? []; arr.push(a); m.set(a.districtId, arr)
    }
    return m
  }, [constructionActivities])

  const hottestDistrict = useMemo(() => {
    let best: DistrictId | null = null, bestN = 0
    for (const id of DISTRICT_IDS) {
      if (!isActiveDistrict(id)) continue
      const n = npcsByDistrict.get(id)?.length ?? 0
      if (n > bestN) { bestN = n; best = id }
    }
    return best
  }, [npcsByDistrict, isActiveDistrict])

  useEffect(() => {
    if (!onPositionChange) return
    onPositionChange({ x: SEED.t_dimai[0], y: SEED.t_dimai[1], z: 0 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDistrictClick = useCallback(
    (id: DistrictId) => {
      if (!isActiveDistrict(id)) return
      if (controlsEnabled) { setPlayerDistrictId(id); saveHubPlayerDistrict(id) }
      onAreaEnter(id)
      if (onPositionChange) onPositionChange({ x: SEED[id][0], y: SEED[id][1], z: 0 })
    },
    [isActiveDistrict, controlsEnabled, onAreaEnter, onPositionChange],
  )

  // Streets: main avenues from the core to each ward + a ring joining neighbours.
  const streets = useMemo(() => {
    const spokes = DISTRICT_IDS.filter(id => id !== 't_dimai').map(id => ({ a: SEED.t_dimai, b: SEED[id] }))
    const ring: Array<{ a: Pt; b: Pt }> = []
    const around: DistrictId[] = ['t_forest', 't_mountain', 't_temple', 't_ruin', 't_salt_marsh', 't_central', 't_dock', 't_desert']
    for (let i = 0; i < around.length; i++) ring.push({ a: SEED[around[i]!], b: SEED[around[(i + 1) % around.length]!] })
    return { spokes, ring }
  }, [])

  // Buildings + figures across the whole city (sorted by y for depth).
  const buildings = useMemo(() => {
    const list: Array<{ id: DistrictId; p: Pt; w: number; type: string; state: string; prog?: number | undefined }> = []
    for (const id of DISTRICT_IDS) {
      if (!isActiveDistrict(id)) continue
      const cell = CELLS[id]; if (!cell) continue
      const meta = WARD[id]
      const rng = makeRng(id + 'bld')
      const cons = constructionByDistrict.get(id) ?? []
      const pts = scatterInCell(cell, SEED[id], rng, meta.density, meta.biome === 'town' ? 66 : 56, 8)
      pts.forEach((p, i) => {
        const w = 22 + rng() * 12
        const underCons = i < cons.length
        list.push({
          id, p, w, type: meta.buildType,
          state: underCons ? 'under_construction' : (rng() > 0.9 ? 'damaged' : 'operational'),
          prog: underCons ? cons[i]!.progressAfter : undefined,
        })
      })
    }
    list.sort((a, b) => a.p[1] - b.p[1])
    return list
  }, [isActiveDistrict, constructionByDistrict])

  const figures = useMemo(() => {
    const list: Array<{ p: Pt; color: string; name: string }> = []
    for (const id of DISTRICT_IDS) {
      if (!isActiveDistrict(id)) continue
      const cell = CELLS[id]; if (!cell) continue
      const people = npcsByDistrict.get(id) ?? []
      const rng = makeRng(id + 'fig')
      const shown = people.slice(0, 6)
      const pts = scatterInCell(cell, SEED[id], rng, shown.length, 60, 14)
      shown.forEach((npc, i) => {
        const p = pts[i]; if (!p) return
        list.push({ p, color: numToHex(npc.color ?? 0xf6c560), name: npc.shortName })
      })
    }
    list.sort((a, b) => a.p[1] - b.p[1])
    return list
  }, [isActiveDistrict, npcsByDistrict])

  return (
    <div
      className="w-full mx-auto aspect-[4/3] sm:aspect-[16/10] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
      role="region"
      aria-label={locale === 'zh' ? '世界地圖' : 'World Map'}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet"
        width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <style>{`
            @keyframes wm-hot { 0% { opacity:0.5; transform:scale(0.95) } 70%,100% { opacity:0; transform:scale(1.05) } }
            .wm-hot { animation: wm-hot 3.2s ease-out infinite; transform-origin:center; transform-box:fill-box; }
            @keyframes wm-lane { to { stroke-dashoffset:-30 } }
            .wm-lane { animation: wm-lane 8s linear infinite; }
            @keyframes wm-pin { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-3px) } }
            .wm-pin { animation: wm-pin 2.4s ease-in-out infinite; }
          `}</style>
          <radialGradient id="wm-sea" cx="50%" cy="44%" r="75%">
            <stop offset="0%" stopColor="#15455a" /><stop offset="55%" stopColor="#0c2c3b" /><stop offset="100%" stopColor="#06181f" />
          </radialGradient>
          <radialGradient id="wm-vignette" cx="50%" cy="48%" r="72%">
            <stop offset="66%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#02080c" stopOpacity="0.5" />
          </radialGradient>
          <filter id="wm-caustics" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="5" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.30 0 0 0 0 0.72 0 0 0 0 0.78 0 0 0 0.9 0" result="c" />
            <feComponentTransfer in="c" result="c2"><feFuncA type="discrete" tableValues="0 0 0 0.5 0 0 0.3 0" /></feComponentTransfer>
            <feComposite in="c2" in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="wm-grain" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09 0.11" numOctaves="3" seed="9" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0" result="g" />
            <feComposite in="g" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id="wm-coast" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#020a10" floodOpacity="0.6" />
          </filter>
          <filter id="wm-bloom" x="-140%" y="-140%" width="380%" height="380%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <clipPath id="wm-island-clip"><path d={roundedPath(ISLAND_PTS, 22)} /></clipPath>
        </defs>

        {/* Sea */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-sea)" />
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-caustics)" opacity="0.5" />

        {/* Island landmass shadow + base */}
        <path d={roundedPath(ISLAND_PTS, 22)} fill={TIDE} opacity="0.3" filter="url(#wm-bloom)" pointerEvents="none" />
        <path d={roundedPath(ISLAND_PTS, 22)} fill="#241b12" filter="url(#wm-coast)" pointerEvents="none" />

        <g clipPath="url(#wm-island-clip)">
          {/* Ward terrain (naturalistic ground + detail marks) */}
          {DISTRICT_IDS.map(id => {
            const cell = CELLS[id]; if (!cell || cell.length < 3) return null
            const active = isActiveDistrict(id)
            const meta = WARD[id]
            const d = roundedPath(cell, 16)
            return (
              <g key={`terr-${id}`} opacity={active ? 1 : 0.5}>
                <path d={d} fill={meta.ground} pointerEvents="none" />
                <path d={d} fill="#000" filter="url(#wm-grain)" opacity={0.4} style={{ mixBlendMode: 'overlay' }} pointerEvents="none" />
                {active && <TerrainMarks id={id} />}
              </g>
            )
          })}

          {/* Tidal river */}
          <path d={RIVER_PATH} fill="none" stroke={TIDE} strokeWidth="15" strokeLinecap="round" opacity="0.3" filter="url(#wm-bloom)" pointerEvents="none" />
          <path d={RIVER_PATH} fill="none" stroke="#123c4c" strokeWidth="11" strokeLinecap="round" opacity="0.95" pointerEvents="none" />
          <path d={RIVER_PATH} fill="none" stroke="#bfeaf2" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4" strokeDasharray="2 12" className="wm-lane" pointerEvents="none" />

          {/* Streets */}
          {[...streets.ring, ...streets.spokes].map((s, i) => (
            <g key={`st-${i}`} pointerEvents="none">
              <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={STREET_EDGE} strokeWidth="9" strokeLinecap="round" />
              <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={STREET} strokeWidth="6" strokeLinecap="round" />
            </g>
          ))}

          {/* Faction / safety overlays (subtle) */}
          {areaOverlays.map(o => {
            const cell = CELLS[o.districtId]; if (!cell || cell.length < 3) return null
            const fs = o.dominantFaction ? FACTION_STYLE[o.dominantFaction] : null
            const d = roundedPath(cell, 16)
            return (
              <g key={`ov-${o.districtId}`} pointerEvents="none">
                {o.safety < 40 && <path d={d} fill="rgba(180,30,30,0.08)" />}
                {fs && <path d={d} fill="none" stroke={fs.stroke} strokeWidth="1.5" strokeOpacity="0.45" strokeDasharray={fs.dash} />}
              </g>
            )
          })}

          {/* Buildings (depth-sorted) */}
          {buildings.map((b, i) => (
            <g key={`b-${i}`} transform={`translate(${b.p[0].toFixed(1)},${b.p[1].toFixed(1)})`} pointerEvents="none">
              <BuildingFacade type={b.type} state={b.state} w={b.w} constructionProgress={b.prog} />
            </g>
          ))}

          {/* Character figures (depth-sorted, on top) */}
          {figures.map((f, i) => (
            <g key={`f-${i}`} transform={`translate(${f.p[0].toFixed(1)},${f.p[1].toFixed(1)}) scale(0.8)`} pointerEvents="none">
              <FigureBody cloak={f.color} scale={1} />
            </g>
          ))}
        </g>

        {/* Coastline + hover highlight */}
        <path d={roundedPath(ISLAND_PTS, 22)} fill="none" stroke={SAND} strokeWidth="2.4" strokeOpacity="0.5" pointerEvents="none" />
        {hoveredDistrict && isActiveDistrict(hoveredDistrict) && CELLS[hoveredDistrict] && (
          <path d={roundedPath(CELLS[hoveredDistrict]!, 16)} fill="rgba(255,220,150,0.08)" stroke={EMBER} strokeWidth="2" strokeOpacity="0.6" pointerEvents="none" />
        )}

        {/* Click zones */}
        {DISTRICT_IDS.map(id => {
          const cell = CELLS[id]; if (!cell || cell.length < 3) return null
          const active = isActiveDistrict(id)
          return (
            <path key={`hit-${id}`} d={roundedPath(cell, 16)} fill="transparent"
              style={{ cursor: active && controlsEnabled ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredDistrict(id)}
              onMouseLeave={() => setHoveredDistrict(p => (p === id ? null : p))}
              onClick={() => handleDistrictClick(id)}
              role="button" aria-label={locale === 'zh' ? DISTRICTS[id].nameZh : DISTRICTS[id].nameEn} />
          )
        })}

        {/* Labels + badges + markers */}
        {DISTRICT_IDS.map(id => {
          const cell = CELLS[id]; if (!cell || cell.length < 3) return null
          const active = isActiveDistrict(id)
          const seed = SEED[id]
          const cen = centroid(cell)
          const count = npcsByDistrict.get(id)?.length ?? 0
          const focused = focusDistrictId === id
          const hot = hottestDistrict === id
          const cons = constructionByDistrict.get(id) ?? []
          const label = locale === 'zh' ? DISTRICTS[id].nameZh : DISTRICTS[id].nameEn
          let topY = cell[0]![1]
          for (const p of cell) topY = Math.min(topY, p[1])
          const bannerY = Math.max(topY + 15, seed[1] - 52)
          return (
            <g key={`lbl-${id}`} pointerEvents="none">
              {(hot || focused) && active && (
                <path d={roundedPath(cell, 16)} fill="none" stroke={focused ? '#8fe3ef' : EMBER}
                  strokeWidth="2.2" className="wm-hot" />
              )}
              <rect x={seed[0] - label.length * 8.5 - 7} y={bannerY - 13} width={label.length * 17 + 14} height={21} rx={4}
                fill={active ? 'rgba(16,10,4,0.82)' : 'rgba(15,12,10,0.55)'}
                stroke={active ? 'rgba(230,211,163,0.45)' : 'rgba(90,80,60,0.3)'} strokeWidth="0.75" />
              <text x={seed[0]} y={bannerY + 1.5} textAnchor="middle"
                fill={active ? '#f4e3b4' : '#6a6052'} fontSize="15.5" fontWeight="800"
                fontFamily="'Big Shoulders Display', system-ui, sans-serif" letterSpacing="0.05em"
                style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,0.65)" strokeWidth="3">
                {label}
              </text>
              {active && count > 0 && (
                <g transform={`translate(${cen[0] - 18},${cen[1] + 46})`}>
                  <rect x={-2} y={-10} width={40} height={16} rx={8} fill="rgba(14,9,4,0.9)" stroke="rgba(230,211,163,0.4)" strokeWidth={0.75} />
                  <circle cx={8} cy={-4.5} r={2.6} fill={SAND} /><path d="M3.5,3 Q8,-2 12.5,3 Z" fill={SAND} />
                  <text x={18} y={1} fill="#f4e3b4" fontSize={11} fontWeight={800} fontFamily="'Big Shoulders Display', system-ui, sans-serif">×{count}</text>
                </g>
              )}
              {cons.length > 0 && (
                <g transform={`translate(${cen[0] + 34},${cen[1] + 44})`} className="wm-pin">
                  <circle r="9" fill={EMBER} opacity="0.18" filter="url(#wm-bloom)" />
                  <path d="M-4,4 L-4,-3 L4,-3 L4,4 M-4,-3 L0,-7 L4,-3" fill="none" stroke="#f4c98a" strokeWidth="1.4" strokeLinejoin="round" />
                </g>
              )}
              {focused && active && (
                <g transform={`translate(${seed[0] + label.length * 9 + 6},${bannerY - 6})`} className="wm-pin">
                  <circle r="10" fill={TIDE} opacity="0.4" filter="url(#wm-bloom)" />
                  <path d="M0,-11 L2.5,-3.2 L10.6,-3.2 L4,1.9 L6.5,9.8 L0,4.8 L-6.5,9.8 L-4,1.9 L-10.6,-3.2 L-2.5,-3.2 Z" fill="#bff0f7" stroke="#fff" strokeWidth="0.6" />
                  <circle r="3.2" fill="#0c2c3b" /><circle r="1.3" fill="#eafbff" />
                </g>
              )}
            </g>
          )
        })}

        {/* Player marker */}
        {playerDistrictId && controlsEnabled && SEED[playerDistrictId] && (
          <g transform={`translate(${SEED[playerDistrictId][0]},${SEED[playerDistrictId][1] - 30})`} pointerEvents="none" className="wm-pin">
            <path d="M0,0 L0,-24" stroke="#7a5a20" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M0,-24 L18,-20 L0,-13 Z" fill={EMBER} stroke="#fff5b8" strokeWidth="0.8" />
            <circle cx="0" cy="0" r="3.5" fill={EMBER} stroke="#fff5b8" strokeWidth="1" />
            <text x="9" y="-16" fontSize="7" fill="#1c1206" fontWeight="800" fontFamily="'Big Shoulders Display', system-ui, sans-serif">
              {playerName ? playerName.charAt(0).toUpperCase() : '你'}
            </text>
          </g>
        )}

        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-vignette)" pointerEvents="none" />
      </svg>
    </div>
  )
}

// ── Player district persistence ───────────────────────────────────────────────

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
  try { window.localStorage.setItem(HUB_POS_KEY, id) } catch { /* quota */ }
}

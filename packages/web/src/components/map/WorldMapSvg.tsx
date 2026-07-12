// Hub world map — SVG vector implementation (Phase M1 → painterly hub, v0.100).
// Replaces PhaserGame/MapScene for HubPage.
//
// Visual language (map-visual-language / painterly-hub):
//   潮鳴市 as a warm-lit island archipelago seen from above at dusk.
//   Sea is real teal water (not near-black); each district is a LIT landmass
//   that keeps its identity colour, floats above the water with depth
//   (coastal shallows glow + drop shadow), carries hand-drawn terrain motifs,
//   and glows with warm town-lights so the world reads as inhabited. The most
//   active district pulses — the world looks alive even in a still frame.
//   Ember #f39c20 warm light / tide #4db8c8 cold water.

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
import { NpcGlyph, CompassStar } from './tokenMedallion'
import { FigureBody } from './tokenFigure'

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_W = 800
const VIEW_H = 600
const DEFAULT_NPC_COLOR = 0xf6c560 // NPC_BADGE_COLOR fallback

const TIDE = '#4db8c8'
const EMBER = '#f39c20'
const SAND = '#e6d3a3'
const WINDOW_LIGHT = '#ffcf6e'

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
  tide_hunters: { fill: 'rgba(77,184,200,0.16)',  stroke: '#4db8c8', strokeDasharray: '4 2' },
  guild:        { fill: 'rgba(243,156,32,0.13)',  stroke: '#f39c20' },
  free_runners: { fill: 'rgba(110,200,100,0.13)', stroke: '#6ec864', strokeDasharray: '2 2' },
  civilian:     { fill: 'rgba(0,0,0,0)',          stroke: 'rgba(180,180,180,0.22)' },
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

type Biome =
  | 'forest' | 'mountain' | 'port' | 'ley'
  | 'flats' | 'town' | 'ruin' | 'dock' | 'marsh'

const BIOME: Readonly<Partial<Record<DistrictId, Biome>>> = {
  t_forest:     'forest',
  t_mountain:   'mountain',
  t_temple:     'port',
  t_dimai:      'ley',
  t_desert:     'flats',
  t_central:    'town',
  t_ruin:       'ruin',
  t_dock:       'dock',
  t_salt_marsh: 'marsh',
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

/** Mix a 24-bit RGB number toward another (0..1), return CSS hex. */
export function mixNum(n: number, toward: number, t: number): string {
  const r = Math.round(((n >> 16) & 0xff) * (1 - t) + ((toward >> 16) & 0xff) * t)
  const g = Math.round(((n >> 8)  & 0xff) * (1 - t) + ((toward >> 8)  & 0xff) * t)
  const b = Math.round((n         & 0xff) * (1 - t) + (toward         & 0xff) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Lighten a 24-bit RGB number toward white. */
export function lightenNum(n: number, t = 0.3): string {
  return mixNum(n, 0xffffff, t)
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

// ── Island geometry (parsed once from ISLAND_PATHS) ───────────────────────────

interface IslandGeo {
  pts: Array<[number, number]>
  cx: number
  cy: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
  size: number
}

function parsePoints(s: string): Array<[number, number]> {
  return s.trim().split(/\s+/).map(p => {
    const [a, b] = p.split(',').map(Number)
    return [a!, b!] as [number, number]
  })
}

const ISLAND_GEO: Partial<Record<DistrictId, IslandGeo>> = (() => {
  const out: Partial<Record<DistrictId, IslandGeo>> = {}
  for (const id of DISTRICT_IDS) {
    const path = ISLAND_PATHS[id]
    if (!path) continue
    const pts = parsePoints(path)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let sx = 0, sy = 0
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      sx += x; sy += y
    }
    const w = maxX - minX, h = maxY - minY
    out[id] = {
      pts, minX, minY, maxX, maxY, w, h,
      cx: sx / pts.length, cy: sy / pts.length,
      size: Math.min(w, h),
    }
  }
  return out
})()

/** Deterministic 0..1 RNG seeded by a string. */
function makeRng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = (h ^ seed.charCodeAt(i)) * 16777619 >>> 0
  let s = h >>> 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** Scatter n points within a radius around a centre (deterministic). */
function scatter(cx: number, cy: number, radius: number, n: number, rng: () => number) {
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * radius
    out.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r])
  }
  return out
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

// ── Terrain motifs (decorative, deterministic, per biome) ─────────────────────

/** A little hand-drawn terrain cluster for one district's biome. */
function TerrainMotifs({ id, biome, geo }: { id: DistrictId; biome: Biome; geo: IslandGeo }) {
  const base = DISTRICTS[id].color
  const baseHex = numToHex(base)
  const dark = darkenNum(base, 0.55)
  const light = lightenNum(base, 0.55)
  const rng = makeRng(id + biome)
  const R = geo.size * 0.36
  const n =
    biome === 'town' || biome === 'port' ? 7 :
    biome === 'forest' ? 8 :
    biome === 'marsh' ? 5 : 6
  const spots = scatter(geo.cx, geo.cy, R, n, rng)
  // sort by y so nearer (lower) motifs draw on top
  spots.sort((a, b) => a[1] - b[1])

  return (
    <g pointerEvents="none">
      {spots.map(([x, y], i) => {
        const s = 0.75 + rng() * 0.6
        const k = `${id}-m-${i}`
        switch (biome) {
          case 'forest':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <path d="M0,3 L0,-2" stroke="#3a2a18" strokeWidth={1.4} strokeLinecap="round" />
                <path d="M0,-9 L4.5,-1 L-4.5,-1 Z" fill={dark} />
                <path d="M0,-6 L4,1.5 L-4,1.5 Z" fill={mixNum(base, 0x8fd070, 0.3)} />
                <path d="M0,-3.5 L3,3 L-3,3 Z" fill={mixNum(base, 0xbdf090, 0.4)} />
              </g>
            )
          case 'mountain':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <path d={`M-6,4 L0,-9 L6,4 Z`} fill={dark} />
                <path d={`M-6,4 L0,-9 L1.5,-2 L-1,1 Z`} fill={baseHex} opacity={0.9} />
                <path d="M-2.4,-4.2 L0,-9 L2.4,-4.2 L1,-3 L0,-5 L-1,-3 Z" fill="#eef2f4" opacity={0.92} />
              </g>
            )
          case 'port':
          case 'town': {
            const warm = biome === 'town'
            const roof = warm ? mixNum(base, 0xff7a3c, 0.35) : mixNum(base, 0x9fd4e8, 0.4)
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <rect x={-4} y={-2} width={8} height={7} fill={dark} />
                <path d={`M-5.2,-2 L0,-8 L5.2,-2 Z`} fill={roof} />
                <rect x={-2} y={0} width={1.8} height={1.8} fill={WINDOW_LIGHT} opacity={0.9} />
                <rect x={1} y={0} width={1.8} height={1.8} fill={WINDOW_LIGHT} opacity={0.75} />
              </g>
            )
          }
          case 'ley':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <path d="M0,-8 L3,0 L0,8 L-3,0 Z" fill={mixNum(base, 0xffffff, 0.15)} opacity={0.5} />
                <path d="M0,-8 L1.6,0 L0,8 L-1.6,0 Z" fill={mixNum(base, 0xe0b8ff, 0.55)} />
                <circle r={1.5} fill="#f2e0ff" opacity={0.9} />
              </g>
            )
          case 'flats':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <path d={`M-6,2 Q-2,-3 2,0 Q5,2 6,2`} fill="none" stroke={light} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
                <ellipse cx={1} cy={2} rx={3.5} ry={1.4} fill={dark} opacity={0.7} />
              </g>
            )
          case 'ruin':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <rect x={-2.5} y={-7} width={2} height={11} fill={baseHex} />
                <rect x={1} y={-4} width={2} height={8} fill={dark} />
                <rect x={-3.5} y={4} width={8} height={2} fill={dark} />
                <rect x={-2.6} y={-8} width={2.2} height={1.6} fill={light} opacity={0.7} />
              </g>
            )
          case 'dock':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <rect x={-6} y={-1} width={12} height={2} fill={darkenNum(base, 0.4)} />
                <path d="M-3,4 Q0,7 3,4 L3,3 L-3,3 Z" fill={mixNum(base, 0x2a1a10, 0.5)} />
                <path d="M0,3 L0,-6" stroke={SAND} strokeWidth={0.9} opacity={0.7} />
                <path d="M0,-6 L4,-3 L0,-3 Z" fill={SAND} opacity={0.8} />
              </g>
            )
          case 'marsh':
            return (
              <g key={k} transform={`translate(${x},${y}) scale(${s})`}>
                <path d="M-3,5 L-3,-4 M0,5 L0,-6 M3,5 L3,-3" stroke={light} strokeWidth={1} strokeLinecap="round" opacity={0.65} />
                <circle cx={0} cy={-6} r={1} fill={mixNum(base, 0xffe0a0, 0.5)} />
                <ellipse cx={0} cy={5} rx={5} ry={1.5} fill={TIDE} opacity={0.18} />
              </g>
            )
          default:
            return null
        }
      })}
    </g>
  )
}

/** Warm town-lights: a cluster of glowing windows near the district centre. */
function TownLights({ id, geo, count, glow }: { id: DistrictId; geo: IslandGeo; count: number; glow: number }) {
  const rng = makeRng(id + 'lights')
  const spots = scatter(geo.cx, geo.cy + geo.size * 0.08, geo.size * 0.32, count, rng)
  return (
    <g pointerEvents="none">
      {spots.map(([x, y], i) => (
        <g key={`${id}-l-${i}`}>
          <circle cx={x} cy={y} r={3.2} fill={WINDOW_LIGHT} opacity={0.12 * glow} filter="url(#wm-bloom)" />
          <circle cx={x} cy={y} r={0.9} fill={WINDOW_LIGHT} opacity={0.85} />
        </g>
      ))}
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

  // Per-district liveliness = NPCs present (+ construction). Drives town-light
  // brightness and the "hottest district" pulse so the still frame reads alive.
  const activityByDistrict = useMemo(() => {
    const m = new Map<DistrictId, number>()
    for (const npc of npcs) {
      if (npc.travelRoute) continue
      const d = npc.districtId
      m.set(d, (m.get(d) ?? 0) + 1)
    }
    for (const [d, acts] of constructionMap) m.set(d, (m.get(d) ?? 0) + acts.length)
    return m
  }, [npcs, constructionMap])

  const hottestDistrict = useMemo(() => {
    let best: DistrictId | null = null
    let bestN = 0
    for (const id of DISTRICT_IDS) {
      if (!isActiveDistrict(id)) continue
      const n = activityByDistrict.get(id) ?? 0
      if (n > bestN) { bestN = n; best = id }
    }
    return best
  }, [activityByDistrict, isActiveDistrict])

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
            @keyframes wm-float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
            .wm-float { animation: wm-float 3s ease-in-out infinite; }
            @keyframes wm-npc-pulse { 0%,100% { opacity:1 } 50% { opacity:0.2 } }
            .wm-npc-pulse { animation: wm-npc-pulse 1.8s ease-in-out infinite; }
            @keyframes wm-player-breathe { 0%,100% { opacity:0.3 } 50% { opacity:0.85 } }
            @keyframes wm-ember-pulse { 0%,100% { opacity:0.35 } 50% { opacity:0.85 } }
            .wm-ember-pulse { animation: wm-ember-pulse 2.8s ease-in-out infinite; }
            @keyframes wm-hot { 0% { opacity:0.5; transform: scale(0.86) } 70%,100% { opacity:0; transform: scale(1.25) } }
            .wm-hot { animation: wm-hot 3.4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
            @keyframes wm-lane { to { stroke-dashoffset: -40; } }
            .wm-lane { animation: wm-lane 5.5s linear infinite; }
            .wm-npc:hover > g { filter: drop-shadow(0 0 5px rgba(243,156,32,0.7)); }
          `}</style>

          {/* Sea */}
          <radialGradient id="wm-sea" cx="50%" cy="42%" r="72%">
            <stop offset="0%"  stopColor="#16465a" />
            <stop offset="48%" stopColor="#0d3040" />
            <stop offset="100%" stopColor="#061a25" />
          </radialGradient>
          <radialGradient id="wm-vignette" cx="50%" cy="48%" r="66%">
            <stop offset="66%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#02080c" stopOpacity="0.55" />
          </radialGradient>
          {/* Sky glow at top (dusk) */}
          <linearGradient id="wm-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#5a3a2a" stopOpacity="0.5" />
            <stop offset="30%" stopColor="#2a2438" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          {/* Top sheen for island volume (shared, objectBoundingBox) */}
          <linearGradient id="wm-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
          </linearGradient>

          {/* Water caustics */}
          <filter id="wm-caustics" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix"
              values="0 0 0 0 0.30  0 0 0 0 0.72  0 0 0 0 0.78  0 0 0 0.9 0" result="c" />
            <feComponentTransfer in="c" result="c2"><feFuncA type="discrete" tableValues="0 0 0 0.5 0 0 0.35 0" /></feComponentTransfer>
            <feComposite in="c2" in2="SourceGraphic" operator="in" />
          </filter>
          {/* Island painterly grain (clipped to island alpha) */}
          <filter id="wm-grain" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.11 0.13" numOctaves="3" seed="11" result="n" />
            <feColorMatrix in="n" type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" result="g" />
            <feComposite in="g" in2="SourceAlpha" operator="in" />
          </filter>
          {/* Soft bloom for lights */}
          <filter id="wm-bloom" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          {/* Island drop shadow onto sea */}
          <filter id="wm-drop" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="1.5" dy="5" stdDeviation="6" floodColor="#020a10" floodOpacity="0.7" />
          </filter>

          <marker id="wm-arr-dep" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#e0a850" opacity="0.8" />
          </marker>
        </defs>

        {/* ── Layer 0: Sea ─────────────────────────────────────────────────── */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-sea)" />
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-caustics)" opacity="0.5" />
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-sky)" pointerEvents="none" />

        {/* ── Sea routes (glowing dashed lanes between district anchors) ────── */}
        {SEA_ROUTES.map(([a, b]) => {
          const defA = DISTRICTS[a], defB = DISTRICTS[b]
          const x1 = defA.anchor.col * TILE_SIZE + TILE_SIZE / 2
          const y1 = defA.anchor.row * TILE_SIZE + TILE_SIZE / 2
          const x2 = defB.anchor.col * TILE_SIZE + TILE_SIZE / 2
          const y2 = defB.anchor.row * TILE_SIZE + TILE_SIZE / 2
          return (
            <g key={`route-${a}-${b}`} pointerEvents="none">
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={TIDE} strokeWidth="2.4" strokeOpacity="0.06" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#bfeaf2" strokeWidth="0.9"
                strokeOpacity="0.3" strokeDasharray="2 12" strokeLinecap="round" className="wm-lane" />
            </g>
          )
        })}

        {/* ── Migration arrows (faint, alive) ──────────────────────────────── */}
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
              <line key={`mig-${eco.tileId}-${i}`} x1={fx} y1={fy} x2={tx} y2={ty}
                stroke="#e0a850" strokeWidth="1.2" opacity="0.4"
                markerEnd="url(#wm-arr-dep)" pointerEvents="none" />
            )
          })
        )}

        {/* ── Layer 1: Islands (lit landmasses with depth) ─────────────────── */}
        {DISTRICT_IDS.map(id => {
          const geo = ISLAND_GEO[id]
          const path = ISLAND_PATHS[id]
          if (!geo || !path) return null
          const active = isActiveDistrict(id)
          const biome = BIOME[id]!
          const base = DISTRICTS[id].color
          const hot = hottestDistrict === id
          const activity = activityByDistrict.get(id) ?? 0
          const lightCount = Math.max(3, Math.min(10, 3 + activity * 2))
          const lightGlow = active ? 1 : 0.3
          const gradId = `wm-isl-${id}`

          return (
            <g key={`isl-${id}`} opacity={active ? 1 : 0.4} style={{ transition: 'opacity 0.3s' }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0.15" y2="1">
                  <stop offset="0%"   stopColor={mixNum(base, 0xfff0d0, 0.34)} />
                  <stop offset="42%"  stopColor={lightenNum(base, 0.05)} />
                  <stop offset="100%" stopColor={darkenNum(base, 0.52)} />
                </linearGradient>
              </defs>

              {/* Hot-district warm aura + pulse (alive) */}
              {hot && active && (
                <>
                  <polygon points={path} fill={EMBER} opacity="0.10" filter="url(#wm-bloom)" pointerEvents="none" />
                  <polygon points={path} fill="none" stroke={EMBER} strokeWidth="2" className="wm-hot" pointerEvents="none" />
                </>
              )}

              {/* Coastal shallows halo */}
              <polygon points={path} fill="none" stroke={TIDE} strokeWidth="7"
                strokeOpacity={active ? 0.5 : 0.25} filter="url(#wm-bloom)" pointerEvents="none" />

              {/* Body with drop shadow */}
              <polygon points={path} fill={`url(#${gradId})`} filter="url(#wm-drop)" pointerEvents="none" />
              {/* Painterly grain */}
              <polygon points={path} fill="#000" filter="url(#wm-grain)"
                opacity={0.5} style={{ mixBlendMode: 'overlay' }} pointerEvents="none" />
              {/* Top sheen (volume) */}
              <polygon points={path} fill="url(#wm-sheen)" pointerEvents="none" />
              {/* Sand coastline */}
              <polygon points={path} fill="none" stroke={SAND} strokeWidth="1.3"
                strokeOpacity={active ? 0.55 : 0.3} strokeLinejoin="round" pointerEvents="none" />

              {/* Terrain motifs + town lights */}
              <TerrainMotifs id={id} biome={biome} geo={geo} />
              <TownLights id={id} geo={geo} count={lightCount} glow={lightGlow} />
            </g>
          )
        })}

        {/* ── Layer 1b: Hover highlight ────────────────────────────────────── */}
        {hoveredDistrict && isActiveDistrict(hoveredDistrict) && (() => {
          const path = ISLAND_PATHS[hoveredDistrict]
          if (!path) return null
          return (
            <polygon points={path} fill="rgba(255,220,150,0.08)" stroke={EMBER}
              strokeWidth="1.75" strokeOpacity="0.6" pointerEvents="none" />
          )
        })()}

        {/* ── Layer 2: Faction / safety overlays (subtle) ──────────────────── */}
        {areaOverlays.map(o => {
          const path = ISLAND_PATHS[o.districtId]
          if (!path) return null
          const fs = o.dominantFaction ? FACTION_STYLE[o.dominantFaction] : null
          return (
            <g key={`ov-${o.districtId}`} pointerEvents="none">
              {o.safety < 40 && <polygon points={path} fill="rgba(180,30,30,0.10)" />}
              {fs && (
                <polygon points={path} fill={fs.fill} stroke={fs.stroke}
                  strokeWidth="1.25" strokeOpacity="0.5" strokeDasharray={fs.strokeDasharray} />
              )}
            </g>
          )
        })}

        {/* ── Layer 4: District name labels (parchment pill) ──────────────── */}
        {DISTRICT_IDS.map(id => {
          const geo = ISLAND_GEO[id]
          if (!geo) return null
          const def    = DISTRICTS[id]
          const cx     = geo.cx
          const pillY  = geo.minY + 15
          const active = isActiveDistrict(id)
          const label  = locale === 'zh' ? def.nameZh : def.nameEn
          const pillW  = Math.max(label.length * 11 + 16, 42)
          return (
            <g key={`lbl-${id}`} pointerEvents="none">
              <rect
                x={cx - pillW / 2} y={pillY - 12}
                width={pillW} height={17}
                rx="3" ry="3"
                fill={active ? 'rgba(20,13,6,0.72)' : 'rgba(15,12,10,0.5)'}
                stroke={active ? 'rgba(230,211,163,0.4)' : 'rgba(90,80,60,0.3)'}
                strokeWidth="0.75"
              />
              <text
                x={cx} y={pillY}
                textAnchor="middle"
                fill={active ? '#f4e3b4' : '#6a6052'}
                fontSize="12"
                fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                fontWeight="800"
                letterSpacing="0.08em"
                style={{ paintOrder: 'stroke' }}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth="2.4"
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* ── Layer 6: Construction markers (small glowing scaffold) ──────── */}
        {Array.from(constructionMap.entries()).map(([id, acts]) => {
          const geo = ISLAND_GEO[id]
          if (!geo || acts.length === 0) return null
          const a  = acts[0]!
          const cx = geo.cx + geo.w * 0.28
          const by = geo.maxY - 16
          return (
            <g key={`ct-${id}`} pointerEvents="none" className="wm-float">
              <circle cx={cx} cy={by - 4} r="6" fill={EMBER} opacity="0.16" filter="url(#wm-bloom)" />
              <text x={cx} y={by} textAnchor="middle" fontSize="11">🔨</text>
              <text x={cx} y={by + 9} textAnchor="middle" fontSize="7"
                fill="#f4c98a" fontFamily="'JetBrains Mono', monospace">
                {`${a.progressAfter}/${a.targetProgress}`}
              </text>
            </g>
          )
        })}

        {/* ── Layer 7: District click zones ────────────────────────────────── */}
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
              fill="transparent"
              style={{ cursor: active && controlsEnabled ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredDistrict(id)}
              onMouseLeave={() => setHoveredDistrict(prev => (prev === id ? null : prev))}
              onClick={controlsEnabled ? () => handleDistrictClick(id) : undefined}
            />
          )
        })}

        {/* ── Layer 8: Peer player tokens ──────────────────────────────────── */}
        {players
          .filter(p => p.x != null && p.y != null)
          .map(p => (
            <g
              key={`peer-${p.id}`}
              style={{ transform: `translate(${p.x!}px, ${p.y!}px)`, transition: 'transform 1.8s ease-in-out' }}
              pointerEvents="none"
            >
              <g opacity={0.88} transform="translate(0, 12)">
                <FigureBody cloak="#3a7a8a" scale={0.85} />
                <rect x="-9" y="2" width="18" height="7" rx="1.5" fill="rgba(26,16,8,0.82)" />
                <text y="7.5" textAnchor="middle" fontSize="5"
                  fill={TIDE} fontFamily="'Big Shoulders Display', system-ui, sans-serif" fontWeight="700">
                  {p.shortName}
                </text>
              </g>
            </g>
          ))}

        {/* ── Layer 8b: Self player token ──────────────────────────────────── */}
        {playerPixelPos && controlsEnabled && (
          <g
            style={{ transform: `translate(${playerPixelPos.x}px, ${playerPixelPos.y}px)`, transition: 'transform 0.5s ease-in-out' }}
            pointerEvents="none"
          >
            <g opacity={0.95} transform="translate(0, 12)">
              <circle cy={-11} r="15" fill="none" stroke="rgba(243,156,32,0.4)" strokeWidth="2"
                style={{ animation: 'wm-player-breathe 2.5s ease-in-out infinite' }} />
              <FigureBody cloak={EMBER} scale={0.9} />
              <g transform="translate(0, -10.5) scale(0.5)">
                <CompassStar tideFill={TIDE} emberFill="#fff5b8" />
              </g>
              <rect x="-9" y="2" width="18" height="7" rx="1.5" fill="rgba(26,16,8,0.88)" />
              <text y="7.5" textAnchor="middle" fontSize="5"
                fill={EMBER} fontFamily="'Big Shoulders Display', system-ui, sans-serif" fontWeight="700">
                {playerName ? playerName.charAt(0).toUpperCase() : '你'}
              </text>
            </g>
          </g>
        )}

        {/* ── Layer 9: NPC tokens ──────────────────────────────────────────── */}
        {npcs.map(npc => {
          const [baseX, baseY] = npcPixelPos(npc)
          const drift = idleDrift.get(npc.id) ?? { dx: 0, dy: 0 }
          const x = baseX + drift.dx
          const y = baseY + drift.dy
          const npcColor = numToHex(npc.color ?? DEFAULT_NPC_COLOR)
          const actEmoji = activityGlyphFor(npc.activity)
          const raw      = npc.recentUtterance
          const truncated = raw
            ? raw.length > 18 ? raw.slice(0, 18) + '…' : raw
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
              {truncated && (
                <>
                  <rect x={-48} y={-42} width="96" height="15" rx="3" ry="3"
                    fill="rgba(24,15,6,0.9)" stroke="rgba(243,156,32,0.45)" strokeWidth="0.75" />
                  <text y={-31} textAnchor="middle" fontSize="7.5" fill="#f4c98a"
                    fontFamily="system-ui, sans-serif" pointerEvents="none">
                    {truncated}
                  </text>
                </>
              )}

              {/* Hit area */}
              <circle r="14" fill="transparent" />

              <g opacity={isTravelling ? 0.7 : 1}>
                {/* warm ground-glow so token pops off the lit island */}
                <ellipse cy="2" rx="10" ry="4" fill="#000" opacity="0.28" />
                {truncated && (
                  <circle r="12.5" fill="none" stroke={EMBER} strokeWidth="1.5" className="wm-npc-pulse" />
                )}
                <circle r="10" fill="none" stroke={npcColor} strokeWidth="3.5" opacity="0.16" />
                <circle r="9.5" fill="none"
                  stroke={isLowHealth ? '#c0532a' : (isTravelling ? '#7a6040' : npcColor)} strokeWidth="1.8" />
                <circle r="8" fill="#1a130a" />
                <NpcGlyph activity={npc.activity} initial={npc.shortName} color={npcColor} />
                <rect x="-11" y="10.5" width="22" height="8.5" rx="1.5" fill="rgba(20,12,5,0.88)" />
                <text y="16.5" textAnchor="middle" fontSize="5.5"
                  fill={npcColor} fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                  fontWeight="700" letterSpacing="0.03em" pointerEvents="none">
                  {npc.shortName}
                </text>
              </g>

              {actEmoji && (
                <text x="12" y="-10" fontSize="9" pointerEvents="none">{actEmoji}</text>
              )}
            </g>
          )
        })}

        {/* ── Vignette (atmosphere, drawn last, non-interactive) ───────────── */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#wm-vignette)" pointerEvents="none" />
      </svg>
    </div>
  )
}

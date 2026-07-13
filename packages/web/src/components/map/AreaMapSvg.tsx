// Area vector map — CSS Grid + absolute-positioned overlay (Phase M2).
// Replaces AreaPhaserGame / AreaScene for AreaPage.
//
// Visual language: 18th-century nautical chart × salvage-lit treasure port.
// Ground #1a1510, ember #f39c20 warm glow, tide #4db8c8 cold water accents.
// Follows the same design grammar as WorldMapSvg (Phase M1).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AreaEcologyView } from '../../api/client'
import type {
  AreaMapBuilding,
  AreaMapDrop,
  AreaMapNpc,
  AreaMapPlayer,
  AreaWeather,
} from '../../game/AreaScene'
import type { DistrictId } from '../../game/districts'
import { activityGlyphFor } from '../../game/npcVisuals'
import { visualForSpecies } from '../../game/speciesPalette'
import { NpcFigure, PlayerFigure, PeerFigure } from './tokenFigure'
import { BuildingFacade } from './buildingFacade'
import { AnimalFigure } from './animalFigure'
import {
  effectiveTerrainAt,
  type AnyTerrain,
  type LandTerrain,
  type SubcellTerrain,
} from '../../game/terrainMask'

// ── Constants ──────────────────────────────────────────────────────────────

const COLS = 15
const ROWS = 10
// Legacy canvas pixel dimensions — used for drop x/y to percentage conversion
const PIXEL_W = 600
const PIXEL_H = 400
// Chebyshev distance threshold for NPC interaction proximity
const INTERACT_CELLS = 2
// Chebyshev distance threshold for building entry proximity
const BUILDING_ENTER_CELLS = 1.5
// localStorage key prefix (v2 col/row format; avoids collision with old Phaser {x,y} keys)
const POS_PREFIX = 'gi:areaPos:v2:'

// ── CSS colour maps (night nautical, readable) ─────────────────────────────
// map-visual-language 契約:亮度撐開到 6%–42%。不變量:
//   1. path 是全圖最亮的可走面(玩家視線沿路走)
//   2. 水是唯一的藍色系(冷暖分離,一眼分出海陸)
//   3. ember 光只給「活的東西」(窗、燈、玩家光環),不進地形

const SUBCELL_CSS: Readonly<Record<SubcellTerrain, string>> = {
  land:          '#3c4a2e',
  pier:          '#63482e',
  shore:         '#5e5138',
  shallow_water: '#17394f',
  open_water:    '#0e2438',
}

const LAND_CSS: Readonly<Record<LandTerrain, string>> = {
  open:     '#3c4a2e',
  rough:    '#43392a',
  path:     '#8a7550',
  blocked:  '#2e333b',
  building: '#332c1e',
}

// 紋理層顏色(每種地形一種 detail mark)
const DETAIL_CSS = {
  wave:       '#2b5878',
  waveShallow:'#3d6c85',
  grass:      '#55683f',
  grassDot:   '#4d5f39',
  sand:       '#6f6045',
  stone:      '#6e5c3f',
  rubble:     '#5a4c36',
  rubbleDark: '#33291d',
  rockFace:   '#3a414c',
  rockEdge:   '#4a5260',
  rockShade:  '#262b33',
  plank:      '#472f1c',
} as const

const DROP_RANK_COLOR: Readonly<Record<string, string>> = {
  SS: '#f39c20',
  S:  '#e07030',
  A:  '#9060d0',
  H:  '#606060',
}

// ── Pure utilities (exported for tests) ───────────────────────────────────

/** 24-bit RGB number → CSS hex string. */
export function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

/** Column 0..14 → CSS left% for the cell centre. */
export function colToPercent(col: number): string {
  return `${((col + 0.5) / COLS) * 100}%`
}

/** Row 0..9 → CSS top% for the cell centre. */
export function rowToPercent(row: number): string {
  return `${((row + 0.5) / ROWS) * 100}%`
}

/** Legacy-canvas pixel-x (0..600) → CSS left%. */
export function pixelXToPercent(x: number): string {
  return `${(x / PIXEL_W) * 100}%`
}

/** Legacy-canvas pixel-y (0..400) → CSS top%. */
export function pixelYToPercent(y: number): string {
  return `${(y / PIXEL_H) * 100}%`
}

/** Chebyshev (chess-king) distance between two grid cells. */
export function gridDistance(c1: number, r1: number, c2: number, r2: number): number {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2))
}

/** Return the CSS background-colour for any terrain type. */
export function terrainToCssColor(terrain: AnyTerrain): string {
  if (terrain in SUBCELL_CSS) return SUBCELL_CSS[terrain as SubcellTerrain]
  if (terrain in LAND_CSS) return LAND_CSS[terrain as LandTerrain]
  return '#3c4a2e'
}

/** Build a ROWS×COLS terrain grid for the given district + placed buildings. */
export function buildTerrainGrid(
  tileId: DistrictId,
  buildings: readonly Pick<AreaMapBuilding, 'col' | 'row' | 'state'>[],
): AnyTerrain[][] {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) =>
      effectiveTerrainAt(tileId, col, row, buildings)
    )
  )
}

// ── Terrain detail marks (deterministic, FNV-1a) ───────────────────────────
// 每格依地形撒 0–4 個向量記號:波浪/苔點/沙點/石板縫/稜線/木板縫。
// 同格永遠同紋理(hash by col,row),重渲染不閃爍。

/** FNV-1a 變體 → 0..1;salt 讓同格可取多個獨立亂數。 */
export function detailRand(col: number, row: number, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0
  h = Math.imul(h ^ col, 16777619) >>> 0
  h = Math.imul(h ^ row, 16777619) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0x5bd1e995) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return h / 4294967296
}

const CELL_W = PIXEL_W / COLS // 40
const CELL_H = PIXEL_H / ROWS // 40

/** 單格紋理(SVG elements,座標為 legacy 600×400 像素空間)。 */
function cellDetail(terrain: AnyTerrain, col: number, row: number): JSX.Element | null {
  const x = col * CELL_W
  const y = row * CELL_H
  const r1 = detailRand(col, row, 7)
  const r2 = detailRand(col, row, 13)
  const key = `td-${col}-${row}`

  if (terrain === 'open_water' || terrain === 'shallow_water') {
    if (r1 < 0.4) return null
    const wy = y + 8 + r2 * (CELL_H - 16)
    const wx = x + 4
    return (
      <path
        key={key}
        d={`M ${wx} ${wy} q ${CELL_W / 4} -3.4 ${CELL_W / 2} 0 q ${CELL_W / 4} 3.4 ${CELL_W / 2 - 10} 0`}
        stroke={terrain === 'open_water' ? DETAIL_CSS.wave : DETAIL_CSS.waveShallow}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
        opacity={0.8}
      />
    )
  }
  if (terrain === 'open' || terrain === 'land') {
    return (
      <g key={key}>
        {[0, 1, 2].map(i => {
          const gx = x + 4 + detailRand(col, row, 20 + i) * (CELL_W - 8)
          const gy = y + 4 + detailRand(col, row, 30 + i) * (CELL_H - 8)
          return detailRand(col, row, 40 + i) > 0.5 ? (
            <path
              key={i}
              d={`M ${gx} ${gy} l 1.5 -3.6 M ${gx + 2.6} ${gy} l 1.1 -2.8`}
              stroke={DETAIL_CSS.grass}
              strokeWidth={1}
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <circle key={i} cx={gx} cy={gy} r={1} fill={DETAIL_CSS.grassDot} />
          )
        })}
      </g>
    )
  }
  if (terrain === 'shore') {
    return (
      <g key={key}>
        {[0, 1, 2, 3].map(i => (
          <circle
            key={i}
            cx={x + 4 + detailRand(col, row, 50 + i) * (CELL_W - 8)}
            cy={y + 4 + detailRand(col, row, 60 + i) * (CELL_H - 8)}
            r={0.9}
            fill={DETAIL_CSS.sand}
          />
        ))}
      </g>
    )
  }
  if (terrain === 'path') {
    return (
      <path
        key={key}
        d={`M ${x + 3 + r1 * 10} ${y + CELL_H * 0.35} h ${CELL_W * 0.4} M ${x + 5 + r2 * 10} ${y + CELL_H * 0.72} h ${CELL_W * 0.3}`}
        stroke={DETAIL_CSS.stone}
        strokeWidth={1.1}
        strokeLinecap="round"
        fill="none"
      />
    )
  }
  if (terrain === 'rough') {
    return (
      <g key={key}>
        <path
          d={`M ${x + 5 + r1 * 12} ${y + 9 + r2 * 16} l 5 -2.2 l 4.4 3.2`}
          stroke={DETAIL_CSS.rubble}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
        />
        <circle cx={x + CELL_W - 9 - r2 * 9} cy={y + CELL_H - 8} r={1.7} fill={DETAIL_CSS.rubbleDark} />
      </g>
    )
  }
  if (terrain === 'blocked') {
    return (
      <g key={key}>
        <path
          d={`M ${x + 6} ${y + CELL_H - 7} L ${x + CELL_W * 0.4} ${y + 7 + r1 * 7} L ${x + CELL_W * 0.62} ${y + CELL_H * 0.5} L ${x + CELL_W - 6} ${y + CELL_H - 7} Z`}
          fill={DETAIL_CSS.rockFace}
          stroke={DETAIL_CSS.rockEdge}
          strokeWidth={1}
        />
        <path
          d={`M ${x + CELL_W * 0.4} ${y + 7 + r1 * 7} L ${x + CELL_W * 0.45} ${y + CELL_H - 8}`}
          stroke={DETAIL_CSS.rockShade}
          strokeWidth={1}
          fill="none"
        />
      </g>
    )
  }
  if (terrain === 'pier') {
    return (
      <path
        key={key}
        d={`M ${x} ${y + CELL_H * 0.33} h ${CELL_W} M ${x} ${y + CELL_H * 0.66} h ${CELL_W}`}
        stroke={DETAIL_CSS.plank}
        strokeWidth={1.3}
        fill="none"
      />
    )
  }
  return null
}

/** 沙-淺水左界海岸咬合:把沙色鋸齒咬進水格,消掉矩形感。 */
function coastBite(col: number, row: number): JSX.Element {
  const x = col * CELL_W
  const y = row * CELL_H
  const segs: string[] = [`M ${x} ${y}`]
  let yy = 0
  let i = 0
  while (yy < CELL_H) {
    const step = 5 + detailRand(col, row, 90 + i) * 6
    segs.push(
      `l ${2 + detailRand(col, row, 80 + i) * 4.5} ${step / 2} l ${-(1 + detailRand(col, row, 70 + i) * 3)} ${step / 2}`
    )
    yy += step
    i++
  }
  segs.push(`L ${x} ${y + CELL_H} Z`)
  return <path key={`cb-${col}-${row}`} d={segs.join(' ')} fill={SUBCELL_CSS.shore} opacity={0.92} />
}

/** 整張地圖的紋理+海岸層(pointer-events 穿透,蓋在地形格上)。 */
function TerrainDetailLayer({ grid }: { grid: AnyTerrain[][] }) {
  const marks: JSX.Element[] = []
  for (let r = 0; r < grid.length; r++) {
    const rowArr = grid[r]
    if (!rowArr) continue
    for (let c = 0; c < rowArr.length; c++) {
      const t = rowArr[c]
      if (!t) continue
      const m = cellDetail(t, c, r)
      if (m) marks.push(m)
      // 左鄰是沙、本格是水 → 咬合
      if ((t === 'shallow_water' || t === 'open_water') && c > 0 && rowArr[c - 1] === 'shore') {
        marks.push(coastBite(c, r))
      }
    }
  }
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${PIXEL_W} ${PIXEL_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {marks}
    </svg>
  )
}

// ── localStorage helpers ───────────────────────────────────────────────────

function posKey(tileId: string, playerId?: number | null): string {
  return `${POS_PREFIX}${playerId != null ? `u${playerId}:` : 'guest:'}${tileId}`
}

function loadPos(tileId: string, playerId?: number | null): { col: number; row: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(posKey(tileId, playerId))
    if (!raw) return null
    const p = JSON.parse(raw) as unknown
    if (p && typeof p === 'object') {
      const { col, row } = p as { col?: unknown; row?: unknown }
      if (typeof col === 'number' && typeof row === 'number') return { col, row }
    }
    return null
  } catch { return null }
}

function savePos(tileId: string, playerId: number | null | undefined, col: number, row: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(posKey(tileId, playerId), JSON.stringify({ col, row }))
  } catch { /* storage quota */ }
}

// ── Deterministic position hash (FNV-1a 32-bit) ───────────────────────────

function hashPosition(key: string, tileId: string, seed: number): { xPct: number; yPct: number } {
  let h = 2166136261 >>> 0
  const s = `${tileId}|${seed}|${key}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return {
    xPct: 8 + (h % 84),
    yPct: 8 + (Math.floor(h / 84) % 77),
  }
}

// ── Props ────────────────────────────────────────────────────────────────

export interface AreaMapSvgProps {
  tileId: DistrictId
  npcs: AreaMapNpc[]
  players?: AreaMapPlayer[]
  drops: AreaMapDrop[]
  buildings?: AreaMapBuilding[]
  locale: 'zh' | 'en'
  playerId?: number | null
  playerName?: string | null
  hudStrings: { interact: string; pickup: string; tooFar: string; enterBuilding?: string }
  weather?: AreaWeather
  ecology?: AreaEcologyView | null
  controlsEnabled?: boolean
  onNpcInteract: (npcId: string) => void
  onDropPickup: (dropId: number) => void
  onNearbyNpcsChange?: (ids: string[]) => void
  onInteractTooFar?: (npcId: string) => void
  onBuildingEnter?: (buildingId: string) => void
  onExit?: () => void
  onPositionChange?: (pos: { x: number; y: number; z: number }) => void
  onNearbyBuildingChange?: (buildingId: string | null) => void
  onAnimalHunt?: (speciesId: string, animalId: string) => void
  onFish?: () => void
}

// ── Component ────────────────────────────────────────────────────────────

export function AreaMapSvg({
  tileId,
  npcs,
  players = [],
  drops,
  buildings = [],
  locale,
  playerId,
  playerName,
  hudStrings: _hudStrings,
  weather = 'clear',
  ecology = null,
  controlsEnabled = true,
  onNpcInteract,
  onDropPickup,
  onNearbyNpcsChange,
  onInteractTooFar: _onInteractTooFar,
  onBuildingEnter,
  onExit,
  onPositionChange,
  onNearbyBuildingChange,
  onAnimalHunt,
  onFish,
}: AreaMapSvgProps) {
  // ── Player position (grid cells) ─────────────────────────────────────────
  const initialPos = useMemo(() => {
    const s = loadPos(tileId, playerId)
    return { col: s?.col ?? 7, row: s?.row ?? 5 }
    // Initial value only — deps intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [playerCol, setPlayerCol] = useState(initialPos.col)
  const [playerRow, setPlayerRow] = useState(initialPos.row)

  // Reset position when tileId / playerId changes (after initial mount)
  const prevTileRef = useRef(tileId)
  useEffect(() => {
    if (prevTileRef.current === tileId) return
    prevTileRef.current = tileId
    const s = loadPos(tileId, playerId)
    const col = s?.col ?? 7
    const row = s?.row ?? 5
    setPlayerCol(col)
    setPlayerRow(row)
    onPositionChange?.({ x: col * 40 + 20, y: row * 40 + 20, z: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId, playerId])

  // Signal initial position to social-presence system on mount
  useEffect(() => {
    onPositionChange?.({ x: playerCol * 40 + 20, y: playerRow * 40 + 20, z: 0 })
    // Intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Terrain grid ─────────────────────────────────────────────────────────
  const terrainGrid = useMemo(
    () => buildTerrainGrid(tileId, buildings),
    [tileId, buildings]
  )

  // ── Proximity calculations ────────────────────────────────────────────────
  const nearbyNpcIds = useMemo(
    () => npcs
      .filter(npc => gridDistance(npc.subCol, npc.subRow, playerCol, playerRow) <= INTERACT_CELLS)
      .map(npc => npc.id),
    [npcs, playerCol, playerRow]
  )
  const nearbyNpcIdSet = useMemo(() => new Set(nearbyNpcIds), [nearbyNpcIds])

  const nearbyBuildingId = useMemo(
    () => buildings.find(
      b => b.enterable && gridDistance(b.col, b.row, playerCol, playerRow) <= BUILDING_ENTER_CELLS
    )?.id ?? null,
    [buildings, playerCol, playerRow]
  )

  // Fire onNearbyNpcsChange only when the set actually changes
  const prevNearbyNpcIdsRef = useRef<string[]>([])
  useEffect(() => {
    const prev = prevNearbyNpcIdsRef.current
    const changed = prev.length !== nearbyNpcIds.length
      || prev.some((id, i) => nearbyNpcIds[i] !== id)
    if (changed) {
      prevNearbyNpcIdsRef.current = nearbyNpcIds
      onNearbyNpcsChange?.(nearbyNpcIds)
    }
  }, [nearbyNpcIds, onNearbyNpcsChange])

  // Fire onNearbyBuildingChange only when it changes
  const prevNearbyBldRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevNearbyBldRef.current !== nearbyBuildingId) {
      prevNearbyBldRef.current = nearbyBuildingId
      onNearbyBuildingChange?.(nearbyBuildingId)
    }
  }, [nearbyBuildingId, onNearbyBuildingChange])

  // ── Interaction handlers ──────────────────────────────────────────────────
  const handleCellClick = useCallback((col: number, row: number) => {
    if (!controlsEnabled) return
    const terrain = terrainGrid[row]?.[col]
    if (terrain === 'open_water' || terrain === 'blocked') return
    setPlayerCol(col)
    setPlayerRow(row)
    savePos(tileId, playerId, col, row)
    onPositionChange?.({ x: col * 40 + 20, y: row * 40 + 20, z: 0 })
  }, [controlsEnabled, terrainGrid, tileId, playerId, onPositionChange])

  const handleNpcClick = useCallback((npcId: string) => {
    onNpcInteract(npcId)
  }, [onNpcInteract])

  const handleBuildingClick = useCallback((b: AreaMapBuilding) => {
    if (!controlsEnabled || !b.enterable) return
    onBuildingEnter?.(b.id)
  }, [controlsEnabled, onBuildingEnter])

  // ── Weather CSS class ─────────────────────────────────────────────────────
  const weatherClass =
    weather === 'storm'    ? 'am-storm' :
    weather === 'mist'     ? 'am-mist' :
    weather === 'overcast' ? 'am-overcast' :
    weather === 'breeze'   ? 'am-breeze' :
    'am-clear'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`relative w-full max-w-[600px] mx-auto aspect-[3/2] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none ${weatherClass}`}
      role="region"
      aria-label={locale === 'zh' ? '區域地圖' : 'Area Map'}
      // pan-y 讓手機能沿垂直方向捲動頁面(點地移動是 tap,不受影響);
      // 舊值 'none' 會吃掉所有觸控手勢 → 手機在地圖上完全無法捲頁。
      style={{ touchAction: 'pan-y' }}
    >
      <style>{`
        .am-overcast { filter: brightness(0.82) saturate(0.7) }
        .am-mist     { filter: brightness(0.9)  saturate(0.5) }
        .am-storm    { filter: brightness(0.65) saturate(0.5) }
        .am-clear    { filter: brightness(1.05) }
        .am-breeze   { filter: brightness(1.0) }
        @keyframes am-drop-pulse { 0%,100% { opacity:0.9 } 50% { opacity:0.35 } }
        @keyframes am-float      { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-3px) } }
        @keyframes am-rain       { 0% { transform:translateY(-10%) } 100% { transform:translateY(110%) } }
        @keyframes am-breeze-leaf { 0% { transform:translateX(-10px) translateY(0) scale(0.8); opacity:0 } 60% { opacity:0.7 } 100% { transform:translateX(70px) translateY(-15px) scale(1); opacity:0 } }
        @keyframes am-bubble-in  { 0% { transform:translateX(-50%) scale(0.85); opacity:0 } 100% { transform:translateX(-50%) scale(1); opacity:1 } }
        @keyframes am-npc-pulse  { 0%,100% { opacity:1 } 50% { opacity:0.15 } }
        @keyframes am-player-breathe { 0%,100% { opacity:0.3 } 50% { opacity:0.9 } }
        .am-drop     { animation: am-drop-pulse 1.4s ease-in-out infinite }
        .am-float    { animation: am-float 2.8s ease-in-out infinite }
      `}</style>

      {/* ── Layer 0: Terrain CSS Grid ─────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {terrainGrid.flatMap((rowArr, r) =>
          rowArr.map((terrain, c) => (
            <div
              key={`${c}-${r}`}
              style={{
                backgroundColor: terrainToCssColor(terrain),
                cursor:
                  controlsEnabled &&
                  terrain !== 'open_water' &&
                  terrain !== 'blocked'
                    ? 'crosshair'
                    : 'default',
              }}
              onClick={() => handleCellClick(c, r)}
            />
          ))
        )}
      </div>

      {/* ── Layer 0.5: 地形紋理+海岸咬合(決定論,點擊穿透) ─────────── */}
      <TerrainDetailLayer grid={terrainGrid} />

      {/* Hidden SVG defs for medallion gradients */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <radialGradient id="am-npc-base" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#2d2418" />
            <stop offset="100%" stopColor="#120d06" />
          </radialGradient>
          <radialGradient id="am-player-base" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#14232a" />
            <stop offset="100%" stopColor="#08101a" />
          </radialGradient>
        </defs>
      </svg>

      {/* ── Layer 1: Overlay (pointer-events-none container) ─────────── */}
      <div className="absolute inset-0 pointer-events-none">

        {/* ── Ecology: predator warnings ──────────────────────────────── */}
        {ecology && ecology.predatorWarnings.length > 0 && (
          <div className="absolute top-2 left-2" style={{ zIndex: 40 }}>
            <span className="gi-panel text-[10px] px-1.5 py-0.5 border border-rust-600 text-rust-300 rounded-sharp">
              ⚠ {ecology.predatorWarnings.map(p => visualForSpecies(p.predatorSpeciesId).emoji).join('')}
            </span>
          </div>
        )}

        {/* ── Ecology: arriving migration chips ──────────────────────── */}
        {ecology?.migrationsArriving.map((m, i) => {
          const vis = visualForSpecies(m.speciesId)
          return (
            <div
              key={`arr-${m.waveId}`}
              className="absolute"
              style={{ right: 6, top: 6 + i * 20, zIndex: 35 }}
            >
              <span className="gi-panel text-[10px] px-1 py-0.5 border border-tide-600 text-tide-300 rounded-sharp">
                {vis.emoji}↘×{m.count}
              </span>
            </div>
          )
        })}

        {/* ── Ecology: departing migration chips ─────────────────────── */}
        {ecology?.migrationsDeparting.map((m, i) => {
          const offset = (ecology.migrationsArriving.length + i) * 20
          const vis = visualForSpecies(m.speciesId)
          return (
            <div
              key={`dep-${m.waveId}`}
              className="absolute"
              style={{ right: 6, top: 6 + offset, zIndex: 35 }}
            >
              <span className="gi-panel text-[10px] px-1 py-0.5 border border-ember-700 text-ember-400 rounded-sharp">
                {vis.emoji}↗×{m.count}
              </span>
            </div>
          )
        })}

        {/* ── Ecology: plant chips ───────────────────────────────────── */}
        {ecology?.plants.map((plant, i) => {
          const vis = visualForSpecies(plant.speciesId)
          const pos = hashPosition(`plant-${plant.speciesId}`, tileId, i)
          const alpha = 0.4 + (plant.saturationPct / 100) * 0.6
          return (
            <div
              key={`plant-${plant.speciesId}`}
              className="absolute"
              style={{
                left: `${pos.xPct}%`,
                top: `${pos.yPct}%`,
                transform: 'translate(-50%, -50%)',
                opacity: alpha,
                fontSize: 13,
                zIndex: 5,
              }}
            >
              {vis.emoji}
            </div>
          )
        })}

        {/* ── Ecology: animal groups (clickable) ────────────────────── */}
        {ecology?.animals.map((group) => {
          const vis = visualForSpecies(group.speciesId)
          const pos = hashPosition(`animal-${group.speciesId}`, tileId, group.count)
          const isCluster = group.count >= 6
          return (
            <div
              key={`animal-${group.speciesId}`}
              className="absolute pointer-events-auto"
              style={{
                left: `${pos.xPct}%`,
                top: `${pos.yPct}%`,
                transform: 'translate(-50%, -50%)',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                cursor: 'pointer',
                zIndex: 8,
              }}
              onClick={() => {
                const animalId = group.animalIds[0]
                if (animalId) onAnimalHunt?.(group.speciesId, animalId)
              }}
              title={`${group.speciesId} ×${group.count}`}
            >
              {/* 側面剪影群:最多畫 3 隻,超過以 ×N 表示(數量=生態密度可視化) */}
              <svg
                width={56}
                height={30}
                viewBox="-28 -24 56 30"
                style={{ overflow: 'visible', display: 'block' }}
                aria-hidden="true"
              >
                {Array.from({ length: Math.min(group.count, 3) }, (_, i) => (
                  <g key={i} transform={`translate(${(i - 1) * 15}, ${i % 2 === 0 ? 0 : 3}) scale(${i === 1 ? 1 : 0.82})`}>
                    <AnimalFigure speciesId={group.speciesId} color={numToHex(vis.color)} />
                  </g>
                ))}
              </svg>
              {isCluster && (
                <span
                  style={{
                    fontSize: 9,
                    color: '#d4c89a',
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                  }}
                >
                  ×{group.count}
                </span>
              )}
            </div>
          )
        })}

        {/* ── Fishery:躍水魚剪影 + 密度條(bottom strip, clickable) ── */}
        {ecology?.fishery && (
          <div
            className="absolute pointer-events-auto"
            style={{ bottom: 0, left: 0, right: 0, height: 26, cursor: 'pointer', zIndex: 20 }}
            onClick={() => onFish?.()}
            title="捕魚"
          >
            {/* 魚躍剪影:密度 → 0–3 隻 */}
            {!ecology.fishery.collapsed && (
              <svg
                width="100%"
                height="18"
                viewBox="0 0 600 18"
                preserveAspectRatio="none"
                style={{ display: 'block', pointerEvents: 'none' }}
                aria-hidden="true"
              >
                {Array.from(
                  { length: Math.max(1, Math.min(3, Math.round(ecology.fishery.density * 3))) },
                  (_, i) => (
                    <g key={i} transform={`translate(${120 + i * 170}, 14)`}>
                      <AnimalFigure speciesId="marsh_fish" color="#8fb6c9" scale={1.1} />
                    </g>
                  )
                )}
              </svg>
            )}
            <div
              style={{
                height: 8,
                width: `${ecology.fishery.collapsed ? 5 : Math.round(ecology.fishery.density * 100)}%`,
                backgroundColor: ecology.fishery.collapsed ? '#c0532a' : '#4db8c8',
                transition: 'width 1s ease',
                minWidth: ecology.fishery.collapsed ? 4 : 0,
              }}
            />
          </div>
        )}

        {/* ── Card drops (clickable, pulsing) ───────────────────────── */}
        {drops.map((drop) => {
          const color = DROP_RANK_COLOR[drop.rank] ?? '#606060'
          return (
            <div
              key={`drop-${drop.id}`}
              className="absolute am-drop pointer-events-auto"
              style={{
                left: pixelXToPercent(drop.x),
                top: pixelYToPercent(drop.y),
                transform: 'translate(-50%, -50%)',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 12,
              }}
              onClick={() => onDropPickup(drop.id)}
              title={`${drop.rank}`}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 3,
                  backgroundColor: `${color}22`,
                  border: `1.5px solid ${color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color,
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    fontWeight: 700,
                  }}
                >
                  {drop.rank}
                </span>
              </div>
            </div>
          )
        })}

        {/* ── Buildings:正面立面,窗光=狀態(clickable) ────────────── */}
        {buildings.map((b) => {
          const isNearby = nearbyBuildingId === b.id
          const isClickable = controlsEnabled && b.enterable
          // size(格數)→ 立面寬:1 格 38px,每多 1 格 +12,**上限 ~2.5 格**。
          // (未鉗制時 size 大的建築會算出 300px+ 的立面,加上 overflow:visible
          //  讓外層 div 判定框覆蓋整張地圖、吃掉點地移動的點擊 → 移動失效。)
          const sizeCells = Math.min(5, Math.max(0, (b.size ?? 1) - 1))
          const facadeW = 38 + sizeCells * 12
          const facadeH = facadeW * 0.6 + facadeW * 0.32
          return (
            <div
              key={`bld-${b.id}`}
              className="absolute"
              style={{
                left: colToPercent(b.col),
                // 貼地:立面底部對齊格子下緣
                top: `${((b.row + 1) / ROWS) * 100}%`,
                transform: 'translate(-50%, -100%)',
                cursor: isClickable ? 'pointer' : 'default',
                // 只有「可進入」的建築才攔截點擊;其餘一律穿透,讓玩家能點地移動。
                pointerEvents: isClickable ? 'auto' : 'none',
                zIndex: 15,
                filter: isNearby ? 'drop-shadow(0 0 8px rgba(243,156,32,0.45))' : 'none',
                transition: 'filter 0.3s ease',
              }}
              onClick={isClickable ? () => handleBuildingClick(b) : undefined}
              title={b.nameZh}
            >
              <svg
                width={facadeW + 12}
                height={facadeH + 14}
                viewBox={`${-(facadeW + 12) / 2} ${-(facadeH + 6)} ${facadeW + 12} ${facadeH + 14}`}
                style={{ overflow: 'visible', display: 'block' }}
                aria-hidden="true"
              >
                <BuildingFacade
                  type={b.type}
                  state={b.state}
                  w={facadeW}
                  constructionProgress={b.constructionProgress}
                />
                {/* 名牌 */}
                <rect
                  x={-facadeW / 2}
                  y={6}
                  width={facadeW}
                  height={8}
                  rx={1.5}
                  fill="rgba(26,16,8,0.82)"
                />
                <text
                  y={12}
                  textAnchor="middle"
                  fontSize={5.5}
                  fill="#d4c89a"
                  fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                  fontWeight={700}
                >
                  {b.nameZh}
                </text>
              </svg>
              {/* Nearby entry hint */}
              {isNearby && (
                <span
                  className="am-float"
                  style={{
                    position: 'absolute',
                    top: -14,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ✋
                </span>
              )}
            </div>
          )
        })}

        {/* ── Peer player tokens ────────────────────────────────────── */}
        {players
          .filter(p => p.x != null && p.y != null)
          .map(p => (
            <div
              key={`peer-${p.id}`}
              className="absolute"
              style={{
                left: pixelXToPercent(p.x!),
                top: pixelYToPercent(p.y!),
                transform: 'translate(-50%, -50%)',
                transition: 'left 7.5s ease-in-out, top 7.5s ease-in-out',
                zIndex: 18,
              }}
            >
              {/* Peer player figure(人形剪影,tide 披風) */}
              <PeerFigure label={p.shortName} />
            </div>
          ))}

        {/* ── NPC tokens ────────────────────────────────────────────── */}
        {npcs.map(npc => {
          const npcColor = numToHex(npc.color ?? 0xf6c560)
          // 職業 glyph 已由頭頂徽記(FigureBadge)表達;behavior emoji 僅在無職業 glyph 時補位
          const actEmoji = activityGlyphFor(npc.activity)
          const behaviorEmoji = npc.behaviorIcon && !actEmoji ? npc.behaviorIcon : null
          const isNearby = nearbyNpcIdSet.has(npc.id)
          const isLowMood = typeof npc.mood === 'number' && npc.mood < 30
          const isLowHealth = typeof npc.health === 'number' && npc.health < 30
          const utterance = npc.recentUtterance
          const truncated = utterance
            ? (utterance.length > 60 ? utterance.slice(0, 60) + '…' : utterance)
            : null

          return (
            <div
              key={`npc-${npc.id}`}
              className="absolute pointer-events-auto"
              style={{
                left: colToPercent(npc.subCol),
                top: rowToPercent(npc.subRow),
                transform: 'translate(-50%, -50%)',
                transition: 'left 4.5s ease-in-out, top 4.5s ease-in-out',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 20,
              }}
              onClick={() => handleNpcClick(npc.id)}
              role="button"
              aria-label={npc.name}
            >
              {/* Speech bubble */}
              {truncated && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% - 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#2d1f0a',
                    border: '0.75px solid rgba(243,156,32,0.45)',
                    borderRadius: 3,
                    padding: '3px 7px',
                    maxWidth: 120,
                    wordBreak: 'break-all',
                    fontSize: 9,
                    color: '#f39c20',
                    lineHeight: 1.35,
                    textAlign: 'center',
                    animation: 'am-bubble-in 0.25s ease forwards',
                    zIndex: 30,
                    pointerEvents: 'none',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {truncated}
                </div>
              )}

              {/* NPC 人形剪影(職業徽記在頭頂;behavior emoji 保留右肩) */}
              <div
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  filter: isNearby ? `drop-shadow(0 0 5px ${npcColor}90)` : 'none',
                  transition: 'filter 0.3s ease',
                }}
              >
                <NpcFigure
                  color={npcColor}
                  shortName={npc.shortName}
                  activity={npc.activity}
                  speaking={Boolean(truncated)}
                  lowHealth={isLowHealth}
                  lowMood={isLowMood}
                />
                {behaviorEmoji && (
                  <span style={{ position: 'absolute', top: -5, right: -10, fontSize: 11, lineHeight: 1 }}>
                    {behaviorEmoji}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* ── Player token (human silhouette + hexagon frame) ───────── */}
        {controlsEnabled && (
          <div
            className="absolute"
            style={{
              left: colToPercent(playerCol),
              top: rowToPercent(playerRow),
              transform: 'translate(-50%, -50%)',
              transition: 'left 0.35s ease-in-out, top 0.35s ease-in-out',
              zIndex: 22,
              pointerEvents: 'none',
            }}
          >
            {/* 玩家人形剪影(ember 披風+胸前羅盤星+呼吸光環) */}
            <PlayerFigure label={playerName ? playerName.charAt(0).toUpperCase() : '你'} />
          </div>
        )}

        {/* ── Exit button ───────────────────────────────────────────── */}
        <div
          className="absolute pointer-events-auto"
          style={{ bottom: 10, left: 8, zIndex: 30 }}
        >
          <button
            type="button"
            onClick={() => onExit?.()}
            className="gi-touch px-2 py-1 text-[10px] font-display uppercase tracking-tightest bg-ground-900/90 border border-ground-600 text-ground-300 hover:border-ember-600 hover:text-ember-300 rounded-sharp transition-colors"
          >
            ← {locale === 'zh' ? '返回' : 'Back'}
          </button>
        </div>

        {/* ── Weather VFX: rain (mist / storm) ──────────────────────── */}
        {(weather === 'mist' || weather === 'storm') && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ pointerEvents: 'none', zIndex: 25 }}
          >
            {Array.from(
              { length: weather === 'storm' ? 60 : 15 },
              (_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 10,
                    backgroundColor: 'rgba(180,210,255,0.35)',
                    left: `${(i * 37 + 13) % 100}%`,
                    top: `${(i * 19 + 7) % 40}%`,
                    animation: `am-rain ${0.55 + (i * 0.07) % 0.4}s linear infinite`,
                    animationDelay: `${(i * 0.11) % 0.6}s`,
                  }}
                />
              )
            )}
          </div>
        )}

        {/* ── Weather VFX: breeze leaves ─────────────────────────────── */}
        {weather === 'breeze' && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ pointerEvents: 'none', zIndex: 25 }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  fontSize: 14,
                  left: `${(i * 23 + 5) % 90}%`,
                  top: `${(i * 17 + 10) % 78}%`,
                  animation: `am-breeze-leaf ${2 + (i * 0.28) % 1.5}s ease-in-out infinite`,
                  animationDelay: `${(i * 0.37) % 2}s`,
                }}
              >
                🍃
              </span>
            ))}
          </div>
        )}

      </div>{/* end overlay */}
    </div>
  )
}

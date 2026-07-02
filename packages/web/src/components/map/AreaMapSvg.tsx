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
import { activityGlyphFor, textColorForBg } from '../../game/npcVisuals'
import { visualForSpecies } from '../../game/speciesPalette'
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

// ── CSS colour maps (salvage-lit dark palette) ────────────────────────────

const SUBCELL_CSS: Readonly<Record<SubcellTerrain, string>> = {
  land:          '#2a2218',
  pier:          '#1e2a30',
  shore:         '#1a2830',
  shallow_water: '#0f1f2a',
  open_water:    '#0a1520',
}

const LAND_CSS: Readonly<Record<LandTerrain, string>> = {
  open:     '#2a2218',
  rough:    '#1e1810',
  path:     '#252018',
  blocked:  '#0e0c08',
  building: '#2a2218',
}

const DROP_RANK_COLOR: Readonly<Record<string, string>> = {
  SS: '#f39c20',
  S:  '#e07030',
  A:  '#9060d0',
  H:  '#606060',
}

const BUILDING_STATE_COLOR: Readonly<Record<string, string>> = {
  operational:        '#f39c20',
  damaged:            '#c0532a',
  under_construction: '#d4c800',
  abandoned:          '#4a4a4a',
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
  return '#2a2218'
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
      style={{ touchAction: 'none' }}
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
                border: '1px solid rgba(255,255,255,0.03)',
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
              <span style={{ fontSize: 15 }}>{vis.emoji}</span>
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

        {/* ── Fishery bar (bottom strip, clickable) ─────────────────── */}
        {ecology?.fishery && (
          <div
            className="absolute pointer-events-auto"
            style={{ bottom: 0, left: 0, right: 0, height: 8, cursor: 'pointer', zIndex: 20 }}
            onClick={() => onFish?.()}
            title="捕魚"
          >
            <div
              style={{
                height: '100%',
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

        {/* ── Buildings (clickable) ──────────────────────────────────── */}
        {buildings.map((b) => {
          const borderColor = BUILDING_STATE_COLOR[b.state] ?? '#6b5e4a'
          const isNearby = nearbyBuildingId === b.id
          const isClickable = controlsEnabled && b.enterable
          return (
            <div
              key={`bld-${b.id}`}
              className="absolute pointer-events-auto"
              style={{
                left: colToPercent(b.col),
                top: rowToPercent(b.row),
                transform: 'translate(-50%, -50%)',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                cursor: isClickable ? 'pointer' : 'default',
                zIndex: 15,
              }}
              onClick={isClickable ? () => handleBuildingClick(b) : undefined}
              title={b.nameZh}
            >
              <div
                style={{
                  border: `2px solid ${isNearby ? '#f39c20' : borderColor}`,
                  borderRadius: 2,
                  backgroundColor: '#1a1510cc',
                  padding: '3px 6px',
                  boxShadow: isNearby ? '0 0 10px 3px rgba(243,156,32,0.35)' : 'none',
                  transition: 'box-shadow 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{b.glyph}</span>
                {/* Construction progress bar */}
                {b.state === 'under_construction' && b.constructionProgress !== undefined && (
                  <div
                    style={{
                      width: 28,
                      height: 3,
                      backgroundColor: '#1a1510',
                      borderRadius: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${b.constructionProgress}%`,
                        height: '100%',
                        backgroundColor: '#d4c800',
                      }}
                    />
                  </div>
                )}
              </div>
              {/* Nearby entry hint */}
              {isNearby && (
                <span
                  className="am-float"
                  style={{ fontSize: 11, marginTop: 2, lineHeight: 1 }}
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
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  backgroundColor: '#4db8c8',
                  border: '1.5px solid #fff5b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.85,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: '#1a1407',
                    fontFamily: "'Big Shoulders Display', system-ui, sans-serif",
                    fontWeight: 800,
                  }}
                >
                  {p.shortName}
                </span>
              </div>
            </div>
          ))}

        {/* ── NPC tokens ────────────────────────────────────────────── */}
        {npcs.map(npc => {
          const npcColor = numToHex(npc.color ?? 0xf6c560)
          const textColor = textColorForBg(npc.color ?? 0xf6c560)
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

              {/* Token circle */}
              <div
                style={{
                  position: 'relative',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: npcColor,
                  border: `2px solid ${isLowMood ? '#6b6b6b' : '#fff5b8'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isNearby ? `0 0 10px 3px ${npcColor}88` : 'none',
                  transition: 'box-shadow 0.3s ease',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: textColor,
                    fontFamily: "'Big Shoulders Display', system-ui, sans-serif",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {npc.shortName}
                </span>

                {/* Low health indicator */}
                {isLowHealth && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -7,
                      left: -7,
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    🤕
                  </span>
                )}

                {/* Activity or behavior emoji (right shoulder) */}
                {(actEmoji || behaviorEmoji) && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -7,
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    {actEmoji || behaviorEmoji}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* ── Player token (SVG hexagon) ─────────────────────────────── */}
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
            <svg
              width="34"
              height="34"
              viewBox="0 0 34 34"
              style={{ overflow: 'visible' }}
              aria-hidden="true"
            >
              <polygon
                points="17,2 31,9.5 31,24.5 17,32 3,24.5 3,9.5"
                fill="#4db8c8"
                stroke="#f39c20"
                strokeWidth="1.5"
              />
              <text
                x="17"
                y="22"
                textAnchor="middle"
                fontSize="11"
                fill="#1a1407"
                fontFamily="'Big Shoulders Display', system-ui, sans-serif"
                fontWeight="800"
              >
                {playerName ? playerName.charAt(0).toUpperCase() : '你'}
              </text>
            </svg>
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

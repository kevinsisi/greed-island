// Building interior vector view — Phase M3.
// Replaces BuildingPhaserGame / BuildingScene for BuildingPage.
//
// Visual language: salvage-lit treasure port interior.
// Ground #1a1510, ember #f39c20, tide #4db8c8.
// Same design grammar as AreaMapSvg (Phase M2).

import type { ServerBuildingDef } from '../../api/client'
import type { BuildingSceneNpc } from '../../game/BuildingScene'
import { NpcFigure } from './tokenFigure'

// ── Floor colour pairs [light, dark] by building type ─────────────────────

// map-visual-language:室內地板同步撐開亮度(棋盤兩色差拉大,型別可辨)
const FLOOR_COLORS: Readonly<Record<string, readonly [string, string]>> = {
  restaurant:  ['#4a2c18', '#392112'],
  library:     ['#2c3434', '#222929'],
  factory:     ['#343130', '#272424'],
  temple:      ['#2e2e44', '#242438'],
  residential: ['#3a3022', '#2d251a'],
}

function floorColors(type: string): readonly [string, string] {
  return FLOOR_COLORS[type] ?? ['#332e4a', '#282343']
}

// ── NPC grid positioning (pure — exported for tests) ──────────────────────

/**
 * Deterministic NPC placement within the building interior.
 * Returns [leftPct, topPct] — CSS percentage from the interior top-left.
 * NPCs spread in rows across the upper half of the room; owner-first ordering
 * naturally places the most important NPC near the visual centre.
 */
export function buildingNpcPosition(
  idx: number,
  total: number,
): [leftPct: number, topPct: number] {
  if (total === 0) return [50, 32]
  if (total === 1) return [50, 30]

  const perRow = Math.min(total, 4)
  const row = Math.floor(idx / perRow)
  const col = idx % perRow
  const rowCount = Math.ceil(total / perRow)
  const colsInRow =
    row === Math.floor((total - 1) / perRow)
      ? total - row * perRow
      : perRow
  const step = 60 / perRow
  const startX = 50 - ((colsInRow - 1) * step) / 2
  const leftPct = startX + col * step
  const topPct = 22 + (rowCount <= 1 ? 0 : (row / (rowCount - 1)) * 36)
  return [leftPct, topPct]
}

/** 24-bit RGB → CSS hex string (local copy to avoid cross-file dependency). */
function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

// ── Props ────────────────────────────────────────────────────────────────

export interface BuildingSvgProps {
  building: ServerBuildingDef
  npcs: BuildingSceneNpc[]
  onNpcInteract: (npcId: string) => void
  onExit: () => void
  controlsEnabled?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────

export function BuildingSvg({
  building,
  npcs,
  onNpcInteract,
  onExit,
  controlsEnabled = true,
}: BuildingSvgProps) {
  const { cols, rows, props: furnitureProps } = building.interior
  const [light, dark] = floorColors(building.type)

  return (
    <div
      className="relative w-full mx-auto rounded-sharp overflow-hidden border border-ground-700 select-none"
      style={{
        maxWidth: cols * 36,
        aspectRatio: `${cols} / ${rows}`,
        background: light,
      }}
      role="region"
      aria-label={building.nameZh}
    >
      {/* Hidden SVG defs for medallion gradients */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <radialGradient id="bs-npc-base" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#2d2418" />
            <stop offset="100%" stopColor="#120d06" />
          </radialGradient>
        </defs>
      </svg>

      {/* ── Floor grid (checkerboard) ──────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <div
              key={`${c}-${r}`}
              style={{
                backgroundColor: (c + r) % 2 === 0 ? light : dark,
                borderRight: '1px solid rgba(255,255,255,0.035)',
                borderBottom: '1px solid rgba(255,255,255,0.035)',
              }}
            />
          ))
        )}
      </div>

      {/* ── Inner border glow ─────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ border: '2px solid rgba(255,245,184,0.32)', zIndex: 30 }}
      />

      {/* ── Furniture / props ────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
        {furnitureProps.map((prop, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${((prop.col + 0.5) / cols) * 100}%`,
              top: `${((prop.row + 0.5) / rows) * 100}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: prop.size ?? 20,
              lineHeight: 1,
              opacity: 0.78,
            }}
            title={prop.label}
          >
            {prop.glyph}
          </div>
        ))}
      </div>

      {/* ── NPC humanoid tokens ──────────────────────────────────── */}
      <div className="absolute inset-0" style={{ zIndex: 10 }}>
        {npcs.map((npc, idx) => {
          const [leftPct, topPct] = buildingNpcPosition(idx, npcs.length)
          const npcColor = typeof npc.color === 'number' ? numToHex(npc.color) : '#f39c20'
          const isOwner = npc.isOwner

          return (
            <div
              key={npc.id}
              className="absolute pointer-events-auto"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: 'translate(-50%, -50%)',
                cursor: controlsEnabled ? 'pointer' : 'default',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                zIndex: 15,
              }}
              onClick={controlsEnabled ? () => onNpcInteract(npc.id) : undefined}
              role={controlsEnabled ? 'button' : undefined}
              aria-label={npc.name}
            >
              {/* NPC 人形剪影(owner 金色高亮) */}
              <div
                style={{
                  display: 'inline-flex',
                  filter: isOwner ? 'drop-shadow(0 0 6px rgba(255,217,102,0.6))' : 'none',
                }}
              >
                <NpcFigure
                  color={isOwner ? '#ffd966' : npcColor}
                  shortName={npc.shortName}
                  activity={npc.activity}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Exit button ───────────────────────────────────────────── */}
      {controlsEnabled && (
        <div className="absolute pointer-events-auto" style={{ bottom: 8, left: 8, zIndex: 25 }}>
          <button
            type="button"
            onClick={onExit}
            className="gi-touch px-2 py-1 text-[10px] font-display uppercase tracking-tightest bg-ground-900/90 border border-ground-600 text-ground-300 hover:border-ember-600 hover:text-ember-300 rounded-sharp transition-colors"
          >
            🚪 離開
          </button>
        </div>
      )}
    </div>
  )
}

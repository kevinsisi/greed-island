// Figure token primitives — map-visual-language 的人形剪影。
//
// 契約(對應 openspec/changes/map-visual-language):
//   - 人是身體不是符號:頭/肩/袍/腳四段剪影,腳下橢圓影,底部貼地。
//   - 派系/NPC 色只上在披風;輪廓一律 parchment 暖描邊(夜裡可讀)。
//   - 職業 medallion 不刪,縮小成頭頂徽記(NpcGlyph 沿用)。
//   - 玩家 = ember 披風 + 胸前羅盤星 + ember 呼吸光環。
//
// 座標系:腳底 (0,0),向上為負 y。FigureToken 高約 30(scale=1)。
// 供 AreaMapSvg / BuildingSvg / WorldMapSvg 共用。

import { NpcGlyph, CompassStar } from './tokenMedallion'

export const FIGURE_SKIN = '#d8b98a'
export const FIGURE_OUTLINE = 'rgba(232,220,192,0.55)'
export const FIGURE_BOOT = '#1c1712'
export const FIGURE_INNER = '#241d15'
const EMBER = '#f39c20'
const RUST = '#c0532a'

/** 剪影本體(不含 svg 外殼):腳底在 (0,0)。 */
export function FigureBody({
  cloak,
  scale = 1,
  lowHealth = false,
}: {
  cloak: string
  scale?: number
  lowHealth?: boolean
}) {
  const s = scale
  return (
    <g>
      {/* 腳下影 */}
      <ellipse cx={0} cy={0} rx={7 * s} ry={2.3 * s} fill="#000" opacity={0.38} />
      {/* 腳 */}
      <path
        d={`M ${-3 * s} 0 v ${-5.5 * s} M ${3 * s} 0 v ${-5.5 * s}`}
        stroke={FIGURE_BOOT}
        strokeWidth={2.6 * s}
        strokeLinecap="round"
      />
      {/* 披風(派系色) */}
      <path
        d={`M 0 ${-22 * s} L ${7 * s} ${-16 * s} L ${5.5 * s} ${-4 * s} L ${-5.5 * s} ${-4 * s} L ${-7 * s} ${-16 * s} Z`}
        fill={cloak}
        stroke={lowHealth ? RUST : FIGURE_OUTLINE}
        strokeWidth={lowHealth ? 1.1 : 0.7}
      />
      {/* 內身 */}
      <rect x={-3 * s} y={-17 * s} width={6 * s} height={13 * s} fill={FIGURE_INNER} />
      {/* 頭 */}
      <circle
        cx={0}
        cy={-25 * s}
        r={3.9 * s}
        fill={FIGURE_SKIN}
        stroke={FIGURE_OUTLINE}
        strokeWidth={0.6}
      />
    </g>
  )
}

/** 頭頂職業徽記:縮小的 medallion,NpcGlyph 沿用。 */
export function FigureBadge({
  activity,
  initial,
  color,
  scale = 1,
}: {
  activity: string | undefined | null
  initial: string
  color: string
  scale?: number
}) {
  const s = scale
  return (
    <g transform={`translate(${7.5 * s}, ${-30 * s})`}>
      <circle r={5} fill="#2d2418" stroke={color} strokeWidth={1} />
      <g transform="scale(0.72)">
        <NpcGlyph activity={activity} initial={initial} color={color} />
      </g>
    </g>
  )
}

export interface NpcFigureProps {
  /** NPC/派系色(披風+徽記+名字) */
  color: string
  shortName: string
  activity?: string | null | undefined
  speaking?: boolean | undefined
  lowHealth?: boolean | undefined
  lowMood?: boolean | undefined
  scale?: number | undefined
}

/**
 * NPC 人形 token(完整 svg,含名牌)。
 * 外框 36×52(scale=1):x ∈ [-18,18],y ∈ [-38,14],腳底在 y=0。
 */
export function NpcFigure({
  color,
  shortName,
  activity,
  speaking = false,
  lowHealth = false,
  lowMood = false,
  scale = 1,
}: NpcFigureProps) {
  const s = scale
  return (
    <svg
      width={36 * s}
      height={52 * s}
      viewBox={`${-18 * s} ${-38 * s} ${36 * s} ${52 * s}`}
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* 說話脈光環(圍在身體中段) */}
      {speaking && (
        <circle
          cy={-13 * s}
          r={14 * s}
          fill="none"
          stroke={EMBER}
          strokeWidth={1.4}
          style={{ animation: 'am-npc-pulse 1.8s ease-in-out infinite' }}
        />
      )}
      <FigureBody cloak={lowMood ? '#565043' : color} scale={s} lowHealth={lowHealth} />
      <FigureBadge activity={activity} initial={shortName} color={color} scale={s} />
      {/* 名牌 */}
      <rect x={-13 * s} y={3 * s} width={26 * s} height={9 * s} rx={1.5} fill="rgba(26,16,8,0.82)" />
      <text
        y={9.5 * s}
        textAnchor="middle"
        fontSize={5.5 * s}
        fill={lowMood ? '#6a6a5a' : color}
        fontFamily="'Big Shoulders Display', system-ui, sans-serif"
        fontWeight={700}
        letterSpacing="0.03em"
      >
        {shortName}
      </text>
    </svg>
  )
}

export interface PlayerFigureProps {
  label: string
  /** 光環+披風主色,預設 ember */
  scale?: number
  breathing?: boolean
}

/**
 * 玩家人形 token:ember 披風、胸前羅盤星、呼吸光環。
 * 外框 40×54(scale=1),腳底在 y=0。
 */
export function PlayerFigure({ label, scale = 1, breathing = true }: PlayerFigureProps) {
  const s = scale
  return (
    <svg
      width={40 * s}
      height={54 * s}
      viewBox={`${-20 * s} ${-40 * s} ${40 * s} ${54 * s}`}
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* ember 呼吸光環 */}
      {breathing && (
        <circle
          cy={-13 * s}
          r={16 * s}
          fill="none"
          stroke="rgba(243,156,32,0.55)"
          strokeWidth={1.4}
          style={{ animation: 'am-player-breathe 2.5s ease-in-out infinite' }}
        />
      )}
      <FigureBody cloak={EMBER} scale={s} />
      {/* 胸前羅盤星(縮小) */}
      <g transform={`translate(0, ${-12 * s}) scale(${0.55 * s})`}>
        <CompassStar tideFill="#4db8c8" emberFill="#fff5b8" />
      </g>
      {/* 名牌 */}
      <rect x={-12 * s} y={3 * s} width={24 * s} height={9 * s} rx={1.5} fill="rgba(26,16,8,0.88)" />
      <text
        y={9.5 * s}
        textAnchor="middle"
        fontSize={6 * s}
        fill={EMBER}
        fontFamily="'Big Shoulders Display', system-ui, sans-serif"
        fontWeight={800}
      >
        {label}
      </text>
    </svg>
  )
}

/**
 * Peer 玩家(其他線上玩家):tide 披風,無呼吸光環,半透明。
 */
export function PeerFigure({ label, scale = 1 }: PlayerFigureProps) {
  const s = scale
  return (
    <svg
      width={36 * s}
      height={50 * s}
      viewBox={`${-18 * s} ${-36 * s} ${36 * s} ${50 * s}`}
      style={{ overflow: 'visible', opacity: 0.88 }}
      aria-hidden="true"
    >
      <FigureBody cloak="#3a7a8a" scale={s} />
      <rect x={-12 * s} y={3 * s} width={24 * s} height={8 * s} rx={1.5} fill="rgba(26,16,8,0.82)" />
      <text
        y={9 * s}
        textAnchor="middle"
        fontSize={5 * s}
        fill="#4db8c8"
        fontFamily="'Big Shoulders Display', system-ui, sans-serif"
        fontWeight={700}
      >
        {label}
      </text>
    </svg>
  )
}

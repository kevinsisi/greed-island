// Building facade — map-visual-language 的建築正面立面。
//
// 契約:建築是形體不是色框。牆體+屋頂+門+窗;夜世界的狀態寫在光裡:
//   operational        → 窗全亮(暖黃)
//   damaged            → 窗半亮 + 屋頂缺口
//   under_construction → 骨架 + 進度條
//   abandoned          → 全黑
//
// 座標系:貼地線 (0,0),向上為負 y。寬度 w 由 size 推導(1 格建築 w≈34)。
// 屋頂色依建築 type 查表(派系/用途聯想),牆體統一暗木色。

const WALL = '#3a3226'
const WALL_EDGE = '#241f16'
const PLANK = '#2b2519'
const DOOR = '#1c150e'
const DOOR_FRAME = '#584a33'
const WINDOW_LIT = '#ffcf6e'
const WINDOW_DARK = '#141210'
const PROGRESS = '#d4c800'

/** 屋頂色:依建築用途聯想(餐飲=陶紅、知識=靛、工坊=灰褐、神殿=苔綠、住宅=暖褐)。 */
const ROOF_BY_TYPE: Readonly<Record<string, string>> = {
  restaurant:  '#6d3f2e',
  tavern:      '#6d3f2e',
  library:     '#3d3a55',
  factory:     '#4a4436',
  workshop:    '#4a4436',
  temple:      '#3f5747',
  residential: '#5c4433',
  warehouse:   '#4a4436',
  market:      '#6a5430',
}

export function roofColorFor(type: string): string {
  return ROOF_BY_TYPE[type] ?? '#5c4433'
}

/** state → 亮窗數(0..2)。 */
export function litWindowsFor(state: string): number {
  if (state === 'operational') return 2
  if (state === 'damaged') return 1
  return 0
}

export interface BuildingFacadeProps {
  type: string
  state: string
  /** 立面寬(px,SVG user units)。1 格建築約 34,大建築 44+。 */
  w?: number
  constructionProgress?: number | undefined
}

/**
 * 建築立面(SVG group,貼地線在 y=0)。
 * 高度約 w*0.62 + 屋頂 w*0.34。呼叫端自行包 svg 與定位。
 */
export function BuildingFacade({ type, state, w = 38, constructionProgress }: BuildingFacadeProps) {
  const h = w * 0.6
  const roofH = w * 0.32
  const roof = roofColorFor(type)
  const lit = litWindowsFor(state)
  const construction = state === 'under_construction'
  const abandoned = state === 'abandoned'

  if (construction) {
    // 骨架:柱+橫樑+進度條
    return (
      <g>
        <ellipse cx={0} cy={1} rx={w * 0.55} ry={3} fill="#000" opacity={0.35} />
        <path
          d={`M ${-w / 2 + 3} 0 V ${-h} M ${w / 2 - 3} 0 V ${-h} M ${-w / 2 + 3} ${-h} L 0 ${-h - roofH} L ${w / 2 - 3} ${-h}`}
          stroke="#8a7550"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${-w / 2 + 3} ${-h / 2} H ${w / 2 - 3}`}
          stroke="#6e5c3f"
          strokeWidth={1.4}
          fill="none"
        />
        <rect x={-w / 2 + 3} y={4} width={w - 6} height={3.5} rx={1} fill="#1a1510" />
        <rect
          x={-w / 2 + 3}
          y={4}
          width={((w - 6) * Math.max(0, Math.min(100, constructionProgress ?? 0))) / 100}
          height={3.5}
          rx={1}
          fill={PROGRESS}
        />
      </g>
    )
  }

  const winY = -h + h * 0.22
  const winPositions = [-w / 2 + w * 0.16, w / 2 - w * 0.16 - 7]

  return (
    <g opacity={abandoned ? 0.8 : 1}>
      {/* 落地影 */}
      <ellipse cx={0} cy={1} rx={w * 0.55} ry={3.2} fill="#000" opacity={0.38} />
      {/* 牆體 */}
      <rect x={-w / 2} y={-h} width={w} height={h} fill={WALL} stroke={WALL_EDGE} strokeWidth={1} />
      {/* 板縫 */}
      <path
        d={`M ${-w / 2 + 2} ${-h / 3} H ${w / 2 - 2} M ${-w / 2 + 2} ${(-h * 2) / 3} H ${w / 2 - 2}`}
        stroke={PLANK}
        strokeWidth={0.8}
        fill="none"
      />
      {/* 屋頂 */}
      <path
        d={`M ${-w / 2 - 4} ${-h} L 0 ${-h - roofH} L ${w / 2 + 4} ${-h} Z`}
        fill={abandoned ? '#3d3a45' : roof}
        stroke="rgba(232,220,192,0.35)"
        strokeWidth={0.7}
      />
      {/* damaged:屋頂缺口 */}
      {state === 'damaged' && (
        <path
          d={`M ${w * 0.08} ${-h - roofH * 0.55} L ${w * 0.22} ${-h - roofH * 0.2} L ${w * 0.02} ${-h - roofH * 0.15} Z`}
          fill="#0e0c08"
        />
      )}
      {/* 門 */}
      <rect x={-4.5} y={-12} width={9} height={12} rx={1.5} fill={DOOR} stroke={DOOR_FRAME} strokeWidth={0.8} />
      {/* 窗(亮=狀態) */}
      {winPositions.map((wx, i) => {
        const on = i < lit
        return (
          <g key={i}>
            {on && <rect x={wx - 2} y={winY - 2} width={11} height={11.5} rx={2} fill={WINDOW_LIT} opacity={0.16} />}
            <rect
              x={wx}
              y={winY}
              width={7}
              height={7.5}
              rx={1}
              fill={on ? WINDOW_LIT : WINDOW_DARK}
              stroke={DOOR_FRAME}
              strokeWidth={0.7}
            />
          </g>
        )
      })}
    </g>
  )
}

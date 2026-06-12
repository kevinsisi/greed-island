// 程序化卡面美術 — 依 card id 確定性播種的 SVG 插畫。
//
// 10 大類別各有自己的配色與主題構圖（潮源火種 / 食飲碗食 / 技藝鍛造 /
// 地景燈塔 / 潮器刃具 / 生靈潮獸 / 契約印鑑 / 秘聞卷軸 / 潮術法陣 /
// 深淵漩渦），rank 決定外框與光暈層級。同一張卡在任何裝置永遠長一樣，
// 不需要任何外部圖檔；GM 之後上傳的 AI 插畫仍優先顯示（CardImage 的
// imageUrl 分支），這裡只接手「沒有上傳圖」的卡。

import type { ReactNode } from 'react'

export type CardArtCategory =
  | 'tide-source'
  | 'food'
  | 'craft'
  | 'landscape'
  | 'tide-tool'
  | 'creature'
  | 'covenant'
  | 'secret'
  | 'tide-art'
  | 'abyss'

/** 與 server 端 CATEGORY_ID_RANGES 對齊的 id 區段（1..100）。 */
export function cardArtCategoryForId(id: number): CardArtCategory {
  if (id >= 1 && id <= 10) return 'tide-source'
  if (id <= 20) return 'food'
  if (id <= 30) return 'craft'
  if (id <= 40) return 'landscape'
  if (id <= 50) return 'tide-tool'
  if (id <= 60) return 'creature'
  if (id <= 70) return 'covenant'
  if (id <= 80) return 'secret'
  if (id <= 90) return 'tide-art'
  return 'abyss'
}

type Palette = Readonly<{
  skyTop: string
  skyBottom: string
  glow: string
  accent: string
  deep: string
}>

const PALETTES: Readonly<Record<CardArtCategory, Palette>> = {
  'tide-source': { skyTop: '#06283d', skyBottom: '#0b4f6c', glow: '#5be8ff', accent: '#ff9d45', deep: '#021622' },
  food: { skyTop: '#3a1f0e', skyBottom: '#6b3b18', glow: '#ffce7a', accent: '#ff8c5a', deep: '#1f0f05' },
  craft: { skyTop: '#241a14', skyBottom: '#4a3422', glow: '#ffb35c', accent: '#d97f3f', deep: '#120c08' },
  landscape: { skyTop: '#1a2a4a', skyBottom: '#3d6b8f', glow: '#ffd98a', accent: '#11354f', deep: '#0c1526' },
  'tide-tool': { skyTop: '#1c2230', skyBottom: '#3a4a63', glow: '#bfe3ff', accent: '#8fa8c9', deep: '#0e111a' },
  creature: { skyTop: '#0d2b1e', skyBottom: '#1e5c3a', glow: '#6affc2', accent: '#c2ff9a', deep: '#06160f' },
  covenant: { skyTop: '#2e1f0b', skyBottom: '#5c421a', glow: '#ffd35c', accent: '#b88a3a', deep: '#170f05' },
  secret: { skyTop: '#1f1430', skyBottom: '#3d2a5c', glow: '#c89aff', accent: '#8a6ad1', deep: '#100a1a' },
  'tide-art': { skyTop: '#0a2433', skyBottom: '#155b73', glow: '#6ef0e0', accent: '#38c5d9', deep: '#04141d' },
  abyss: { skyTop: '#05060f', skyBottom: '#141b33', glow: '#4a5fd1', accent: '#2a3566', deep: '#020308' },
}

type RankFrame = Readonly<{ stroke: string; width: number; glowOpacity: number }>

const DEFAULT_FRAME: RankFrame = { stroke: '#5a5f55', width: 1, glowOpacity: 0 }

const RANK_FRAME: Readonly<Record<string, RankFrame>> = {
  S: { stroke: '#ffd35c', width: 3, glowOpacity: 0.55 },
  A: { stroke: '#e86a4a', width: 2.5, glowOpacity: 0.4 },
  B: { stroke: '#7fb7d9', width: 2, glowOpacity: 0.25 },
  C: { stroke: '#8a8f7a', width: 1.5, glowOpacity: 0.12 },
  D: DEFAULT_FRAME,
}

/** mulberry32 — 確定性 PRNG，同一張卡永遠長一樣。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface CardArtProps {
  cardId: number
  rank: string
  /** Extra CSS classes applied to the svg element. */
  className?: string
  /** 是否在角落顯示 rank 字樣（清單縮圖建議關掉）。 */
  showRankBadge?: boolean
}

export function CardArt({ cardId, rank, className = '', showRankBadge = true }: CardArtProps) {
  const category = cardArtCategoryForId(cardId)
  const p = PALETTES[category]
  const frame = RANK_FRAME[rank] ?? DEFAULT_FRAME
  const rng = mulberry32(cardId * 2654435761)
  const uid = `ca${cardId}`

  // 漂浮粒子（氣泡 / 星火 / 灰燼）— 每張卡位置不同。
  const particles: ReactNode[] = []
  const particleCount = 7 + Math.floor(rng() * 5)
  for (let i = 0; i < particleCount; i += 1) {
    particles.push(
      <circle
        key={i}
        cx={6 + rng() * 88}
        cy={8 + rng() * 110}
        r={0.5 + rng() * 1.4}
        fill={rng() > 0.5 ? p.glow : p.accent}
        opacity={0.18 + rng() * 0.35}
      />
    )
  }

  return (
    <svg
      viewBox="0 0 100 140"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label={`card art #${cardId} (${rank})`}
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyTop} />
          <stop offset="100%" stopColor={p.skyBottom} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.75" />
          <stop offset="60%" stopColor={p.glow} stopOpacity="0.18" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-vig`} cx="50%" cy="50%" r="75%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="100" height="140" fill={`url(#${uid}-sky)`} />
      <ellipse cx="50" cy="62" rx="46" ry="44" fill={`url(#${uid}-glow)`} />
      {particles}
      <Motif category={category} p={p} rng={rng} />
      <rect x="0" y="0" width="100" height="140" fill={`url(#${uid}-vig)`} />

      {frame.glowOpacity > 0 && (
        <rect
          x="2" y="2" width="96" height="136" rx="4" fill="none"
          stroke={frame.stroke} strokeWidth={frame.width + 2.5} opacity={frame.glowOpacity * 0.45}
        />
      )}
      <rect
        x="2" y="2" width="96" height="136" rx="4" fill="none"
        stroke={frame.stroke} strokeWidth={frame.width} opacity={0.9}
      />
      {rank === 'S' && (
        <rect x="5.5" y="5.5" width="89" height="129" rx="3" fill="none" stroke={frame.stroke} strokeWidth="0.8" opacity="0.7" />
      )}

      {showRankBadge && (
        <g>
          <circle cx="88" cy="128" r="8" fill={p.deep} stroke={frame.stroke} strokeWidth="1" opacity="0.92" />
          <text
            x="88" y="128" textAnchor="middle" dominantBaseline="central"
            fontSize="9" fontWeight="800" fill={frame.stroke}
            fontFamily="Inter, 'Noto Sans TC', system-ui, sans-serif"
          >
            {rank}
          </text>
        </g>
      )}
    </svg>
  )
}

function Motif({
  category,
  p,
  rng,
}: {
  category: CardArtCategory
  p: Palette
  rng: () => number
}): ReactNode {
  switch (category) {
    case 'tide-source': {
      // 聖火火種：同心潮紋環 + 火焰水滴。
      const sway = (rng() - 0.5) * 8
      return (
        <g>
          <circle cx="50" cy="72" r="26" fill="none" stroke={p.glow} strokeWidth="0.8" opacity="0.4" />
          <circle cx="50" cy="72" r="19" fill="none" stroke={p.glow} strokeWidth="0.6" opacity="0.55" strokeDasharray="3 2" />
          <ellipse cx="50" cy="86" rx="16" ry="4" fill={p.deep} opacity="0.8" />
          <path
            d={`M50 44 C ${58 + sway} 58, 62 68, 50 84 C 38 68, ${42 + sway} 58, 50 44 Z`}
            fill={p.accent}
          />
          <path d="M50 56 C 55 64, 56 70, 50 79 C 44 70, 45 64, 50 56 Z" fill={p.glow} />
        </g>
      )
    }
    case 'food': {
      // 熱食碗 + 蒸氣。
      const steamShift = (rng() - 0.5) * 6
      return (
        <g>
          <ellipse cx="50" cy="96" rx="26" ry="5" fill={p.deep} opacity="0.85" />
          <path d="M24 76 A 26 24 0 0 0 76 76 L 72 88 A 22 14 0 0 1 28 88 Z" fill={p.accent} />
          <ellipse cx="50" cy="76" rx="26" ry="6" fill={p.glow} opacity="0.9" />
          <path
            d={`M42 64 C ${40 + steamShift} 54, 46 50, 43 40 M58 64 C ${60 + steamShift} 54, 54 50, 57 40 M50 62 C 50 52, 54 48, 50 38`}
            fill="none" stroke={p.glow} strokeWidth="1.6" strokeLinecap="round" opacity="0.65"
          />
        </g>
      )
    }
    case 'craft': {
      // 鍛造鐵砧 + 火花。
      const sparks: ReactNode[] = []
      for (let i = 0; i < 6; i += 1) {
        sparks.push(
          <circle key={i} cx={44 + rng() * 18} cy={48 + rng() * 14} r={0.7 + rng()} fill={p.glow} opacity={0.6 + rng() * 0.4} />
        )
      }
      return (
        <g>
          <ellipse cx="50" cy="98" rx="24" ry="4.5" fill="#000" opacity="0.5" />
          <path d="M30 70 L70 70 L66 78 L58 78 L58 90 L42 90 L42 78 L34 78 Z" fill="#3b3b44" stroke="#15151a" strokeWidth="1" />
          <rect x="36" y="64" width="28" height="7" rx="2" fill="#52525e" />
          <rect x="60" y="42" width="6" height="22" rx="2" fill="#6b4a2b" transform="rotate(38 63 53)" />
          <rect x="56" y="36" width="14" height="9" rx="1.5" fill="#7d7d8a" transform="rotate(38 63 40)" />
          {sparks}
        </g>
      )
    }
    case 'landscape': {
      // 海平線 + 燈塔剪影 + 天光。
      const moonX = 26 + rng() * 14
      return (
        <g>
          <circle cx={moonX} cy="34" r="9" fill={p.glow} opacity="0.9" />
          <rect x="0" y="92" width="100" height="48" fill={p.accent} />
          <path d="M0 92 H100" stroke={p.glow} strokeWidth="0.8" opacity="0.6" />
          <path d="M62 92 L65 52 L73 52 L76 92 Z" fill={p.deep} />
          <rect x="64" y="44" width="10" height="9" rx="1" fill={p.deep} />
          <rect x="66" y="46" width="6" height="4" fill={p.glow} />
          <path d="M66 48 L36 40 L66 46 Z" fill={p.glow} opacity="0.35" />
          <path d="M8 104 Q 20 101, 32 104 T 56 104 T 80 104 T 104 104" fill="none" stroke={p.glow} strokeWidth="0.7" opacity="0.4" />
        </g>
      )
    }
    case 'tide-tool': {
      // 斜置潮刃 + 寒光。
      const tilt = -32 + (rng() - 0.5) * 10
      return (
        <g transform={`rotate(${tilt} 50 72)`}>
          <path d="M50 30 L56 44 L54 96 L50 102 L46 96 L44 44 Z" fill="#cfd9e8" stroke="#8fa2bd" strokeWidth="0.8" />
          <path d="M50 30 L56 44 L54 96 L50 102 Z" fill="#9fb2cc" />
          <rect x="44" y="100" width="12" height="5" rx="1.5" fill={p.accent} />
          <rect x="47" y="104" width="6" height="14" rx="2" fill="#5b4632" />
          <path d="M40 50 L60 58" stroke={p.glow} strokeWidth="1" opacity="0.8" />
        </g>
      )
    }
    case 'creature': {
      // 潮獸：發光眼 + 觸鬚曲線。
      const eyeX = 44 + rng() * 12
      return (
        <g>
          <ellipse cx="50" cy="78" rx="26" ry="20" fill={p.deep} opacity="0.92" />
          <ellipse cx="50" cy="78" rx="26" ry="20" fill="none" stroke={p.glow} strokeWidth="0.8" opacity="0.4" />
          <path
            d="M28 88 C 18 96, 16 106, 22 114 M40 95 C 36 106, 30 112, 32 120 M60 95 C 64 106, 70 112, 68 120 M72 88 C 82 96, 84 106, 78 114"
            fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" opacity="0.85"
          />
          <circle cx={eyeX} cy="74" r="6" fill={p.glow} />
          <circle cx={eyeX} cy="74" r="2.4" fill={p.deep} />
          <circle cx={eyeX + 16} cy="76" r="3.5" fill={p.glow} opacity="0.8" />
          <circle cx={eyeX + 16} cy="76" r="1.4" fill={p.deep} />
        </g>
      )
    }
    case 'covenant': {
      // 契約印鑑：圓印 + 緞帶 + 蠟封。
      const sealRot = rng() * 30 - 15
      return (
        <g>
          <path d="M30 96 L42 84 L50 92 L38 106 Z" fill={p.accent} opacity="0.85" />
          <path d="M70 96 L58 84 L50 92 L62 106 Z" fill={p.accent} opacity="0.7" />
          <g transform={`rotate(${sealRot} 50 66)`}>
            <circle cx="50" cy="66" r="20" fill={p.accent} />
            <circle cx="50" cy="66" r="20" fill="none" stroke={p.glow} strokeWidth="1.4" />
            <circle cx="50" cy="66" r="14" fill="none" stroke={p.deep} strokeWidth="1" opacity="0.7" />
            <path d="M50 56 L53 63 L60 63 L54 68 L56 75 L50 71 L44 75 L46 68 L40 63 L47 63 Z" fill={p.glow} />
          </g>
        </g>
      )
    }
    case 'secret': {
      // 秘聞卷軸 + 發光符文筆畫。
      const glyphs: ReactNode[] = []
      for (let i = 0; i < 4; i += 1) {
        const gx = 38 + i * 8 + (rng() - 0.5) * 2
        glyphs.push(
          <path
            key={i}
            d={`M${gx} 58 v14 M${gx - 2.5} ${61 + rng() * 4} h5`}
            stroke={p.glow} strokeWidth="1.3" strokeLinecap="round" opacity={0.6 + rng() * 0.4}
          />
        )
      }
      return (
        <g>
          <rect x="28" y="48" width="44" height="38" rx="3" fill="#d8c9a3" opacity="0.92" />
          <rect x="24" y="44" width="8" height="46" rx="4" fill="#b09a6a" />
          <rect x="68" y="44" width="8" height="46" rx="4" fill="#b09a6a" />
          {glyphs}
          <rect x="28" y="48" width="44" height="38" rx="3" fill={p.skyTop} opacity="0.18" />
        </g>
      )
    }
    case 'tide-art': {
      // 潮術法陣：螺旋 + 放射符點。
      const dots: ReactNode[] = []
      for (let i = 0; i < 8; i += 1) {
        const ang = (i / 8) * Math.PI * 2 + rng() * 0.3
        dots.push(
          <circle key={i} cx={50 + Math.cos(ang) * 28} cy={70 + Math.sin(ang) * 28} r="1.6" fill={p.glow} opacity="0.85" />
        )
      }
      return (
        <g>
          <circle cx="50" cy="70" r="28" fill="none" stroke={p.glow} strokeWidth="0.8" opacity="0.5" />
          <circle cx="50" cy="70" r="22" fill="none" stroke={p.accent} strokeWidth="0.6" opacity="0.6" strokeDasharray="4 3" />
          <path
            d="M50 70 m0 -16 a16 16 0 1 1 -11.3 27.3 a11 11 0 1 0 7.8 -18.8 a7 7 0 1 1 -5 8.6"
            fill="none" stroke={p.glow} strokeWidth="1.6" strokeLinecap="round"
          />
          {dots}
        </g>
      )
    }
    case 'abyss':
    default: {
      // 深淵漩渦：下沉同心弧 + 渦心微光。
      const arcs: ReactNode[] = []
      for (let i = 0; i < 5; i += 1) {
        const r = 30 - i * 5.5
        arcs.push(
          <circle
            key={i}
            cx="50" cy="74" r={r}
            fill="none" stroke={i % 2 === 0 ? p.accent : p.glow}
            strokeWidth={1.4 - i * 0.18}
            strokeDasharray={`${10 + rng() * 14} ${6 + rng() * 8}`}
            opacity={0.35 + i * 0.12}
            transform={`rotate(${rng() * 360} 50 74)`}
          />
        )
      }
      return (
        <g>
          {arcs}
          <circle cx="50" cy="74" r="4" fill={p.glow} opacity="0.9" />
          <circle cx="50" cy="74" r="9" fill={p.glow} opacity="0.18" />
        </g>
      )
    }
  }
}


// Medallion token primitives — shared across WorldMapSvg, AreaMapSvg, BuildingSvg.
//
// NpcGlyph  : occupation glyph rendered as SVG path/lines centred at (0,0).
// CompassStar : player token compass-rose glyph.
//
// All glyphs are stroke-only (fill="none") except where noted.
// Coordinate system: ±5 range, strokeWidth 1.3, strokeLinecap round.

// ── NpcGlyph ──────────────────────────────────────────────────────────────────

interface NpcGlyphProps {
  activity: string | undefined | null
  /** First character fallback for unknown activities */
  initial: string
  /** Faction/NPC color — used as stroke colour */
  color: string
}

export function NpcGlyph({ activity, initial, color }: NpcGlyphProps) {
  const act = activity ?? ''

  const shared = {
    stroke: color,
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }

  // guard / patrol → shield
  if (act === 'guard' || act === 'patrol') {
    return (
      <path
        d="M0,-5 L4,-2.5 L4,2 Q4,5 0,5.5 Q-4,5 -4,2 L-4,-2.5Z"
        {...shared}
      />
    )
  }

  // trade → scales
  if (act === 'trade') {
    return (
      <g {...shared}>
        <line x1="0" y1="-5" x2="0" y2="0" />
        <line x1="-4.5" y1="0" x2="4.5" y2="0" />
        <line x1="-4.5" y1="0" x2="-4.5" y2="3" />
        <line x1="4.5" y1="0" x2="4.5" y2="3" />
      </g>
    )
  }

  // read / study → scroll/book
  if (act === 'read' || act === 'study') {
    return (
      <g {...shared}>
        <path d="M-3,-5 Q-4,-5 -4,-3.5 L-4,4 Q-4,5 -3,5 L3,5 Q4,5 4,4 L4,-3.5 Q4,-5 3,-5Z" />
        <line x1="-2" y1="-1.5" x2="2" y2="-1.5" />
        <line x1="-2" y1="1" x2="2" y2="1" />
        <line x1="-2" y1="3.5" x2="0.5" y2="3.5" />
      </g>
    )
  }

  // craft / work → hammer
  if (act === 'craft' || act === 'work') {
    return (
      <g stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="0" y1="-5" x2="0" y2="4" strokeWidth={1.5} />
        <line x1="-3" y1="-5" x2="3" y2="-5" strokeWidth={1.3} />
        <line x1="-3" y1="-2.5" x2="3" y2="-2.5" strokeWidth={1.3} />
      </g>
    )
  }

  // pray → cross
  if (act === 'pray') {
    return (
      <g {...shared}>
        <line x1="0" y1="-5" x2="0" y2="5" />
        <line x1="-3.5" y1="-1" x2="3.5" y2="-1" />
      </g>
    )
  }

  // perform → music note
  if (act === 'perform') {
    return (
      <g stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3}>
        <line x1="0" y1="-5" x2="0" y2="1.5" />
        <circle cx="0" cy="3.5" r="2" fill={color} stroke="none" />
        <line x1="0" y1="-5" x2="4.5" y2="-3.5" />
      </g>
    )
  }

  // write → quill/feather
  if (act === 'write') {
    return (
      <path
        d="M4,-5 Q-1,0 -3.5,5 M4,-5 Q3,0 -0.5,3.5"
        {...shared}
      />
    )
  }

  // eat → fish hook
  if (act === 'eat') {
    return (
      <path
        d="M0,-4.5 L0,2.5 Q0,5 2.5,5 Q5,5 5,2.5"
        {...shared}
      />
    )
  }

  // default (idle, move, sleep, unknown) → initial letter
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={7}
      fontFamily="'Big Shoulders Display', system-ui, sans-serif"
      fontWeight={800}
      fill={color}
      stroke="none"
    >
      {initial ? initial.charAt(0).toUpperCase() : '?'}
    </text>
  )
}

// ── CompassStar ───────────────────────────────────────────────────────────────

interface CompassStarProps {
  /** Tide colour — NS needle */
  tideFill: string
  /** Ember colour — EW needle */
  emberFill: string
}

export function CompassStar({ tideFill, emberFill }: CompassStarProps) {
  const tickStroke = 'rgba(255,245,184,0.5)'
  const tickWidth  = 0.9

  return (
    <g>
      {/* NS needle — tide */}
      <polygon
        points="0,-6.5 1.5,0 0,6.5 -1.5,0"
        fill={tideFill}
      />
      {/* EW needle — ember */}
      <polygon
        points="6.5,0 0,1.5 -6.5,0 0,-1.5"
        fill={emberFill}
        opacity={0.85}
      />
      {/* Diagonal ticks */}
      <line x1="-4" y1="-4" x2="-1.5" y2="-1.5" stroke={tickStroke} strokeWidth={tickWidth} fill="none" />
      <line x1="4"  y1="-4" x2="1.5"  y2="-1.5" stroke={tickStroke} strokeWidth={tickWidth} fill="none" />
      <line x1="4"  y1="4"  x2="1.5"  y2="1.5"  stroke={tickStroke} strokeWidth={tickWidth} fill="none" />
      <line x1="-4" y1="4"  x2="-1.5" y2="1.5"  stroke={tickStroke} strokeWidth={tickWidth} fill="none" />
    </g>
  )
}

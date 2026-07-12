// Animal figure — map-visual-language 的動物側面剪影。
//
// 契約:動物用側面(輪廓資訊量最大):鹿看角、豬看鼻、鳥看喙、魚看躍水弧。
// 一個 speciesId 依關鍵字歸入一個 archetype;顏色沿用 speciesPalette。
// 座標系:腳底/水面線 (0,0),向上為負 y。預設高約 16–20px。

export type AnimalArchetype = 'deer' | 'heavy' | 'quadruped' | 'bird' | 'fish' | 'crawler'

/** speciesId → 剪影 archetype(純函式,供測試)。 */
export function archetypeFor(speciesId: string): AnimalArchetype {
  const id = speciesId.toLowerCase()
  if (id.includes('deer') || id.includes('elk')) return 'deer'
  if (id.includes('boar') || id.includes('bear')) return 'heavy'
  if (id.includes('owl') || id.includes('vulture') || id.includes('heron') || id.includes('bird')) return 'bird'
  if (id.includes('fish')) return 'fish'
  if (id.includes('lizard') || id.includes('mantis') || id.includes('crab')) return 'crawler'
  return 'quadruped' // wolf / lynx / goat / 其他四足
}

const OUTLINE = 'rgba(232,220,192,0.4)'

export interface AnimalFigureProps {
  speciesId: string
  /** speciesPalette 色(CSS hex)。 */
  color: string
  scale?: number
}

/** 動物剪影(SVG group,貼地線 y=0)。呼叫端包 svg 與定位。 */
export function AnimalFigure({ speciesId, color, scale = 1 }: AnimalFigureProps) {
  const s = scale
  const a = archetypeFor(speciesId)

  if (a === 'fish') {
    // 躍出水面的弧 + 水花
    return (
      <g>
        <path
          d={`M ${-6 * s} 0 Q 0 ${-8 * s} ${6 * s} 0 l ${-2.6 * s} ${-1.4 * s} m ${2.6 * s} ${1.4 * s} l ${-3 * s} ${0.8 * s}`}
          stroke={color}
          strokeWidth={1.7 * s}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${-8 * s} ${2 * s} h ${4 * s} M ${5 * s} ${2.4 * s} h ${3.4 * s}`}
          stroke={color}
          strokeWidth={1 * s}
          strokeLinecap="round"
          opacity={0.6}
        />
      </g>
    )
  }

  if (a === 'bird') {
    // 立姿鳥:身體橢圓+長頸+喙+細腳
    return (
      <g>
        <ellipse cx={0} cy={0.5 * s} rx={5 * s} ry={1.6 * s} fill="#000" opacity={0.3} />
        <path d={`M ${-1 * s} 0 v ${-4 * s} M ${1.5 * s} 0 v ${-4 * s}`} stroke={color} strokeWidth={0.9 * s} strokeLinecap="round" />
        <ellipse cx={0} cy={-7 * s} rx={4.4 * s} ry={3 * s} fill={color} stroke={OUTLINE} strokeWidth={0.5} />
        <path d={`M ${3 * s} ${-9 * s} q ${2 * s} ${-2 * s} ${2.4 * s} ${-4.4 * s}`} stroke={color} strokeWidth={1.6 * s} fill="none" strokeLinecap="round" />
        <circle cx={5.2 * s} cy={-13.6 * s} r={1.7 * s} fill={color} />
        <path d={`M ${6.8 * s} ${-13.4 * s} l ${2.2 * s} ${0.5 * s}`} stroke={color} strokeWidth={1 * s} strokeLinecap="round" />
      </g>
    )
  }

  if (a === 'crawler') {
    // 低伏爬蟲:扁身+尾
    return (
      <g>
        <ellipse cx={0} cy={0.5 * s} rx={6 * s} ry={1.4 * s} fill="#000" opacity={0.3} />
        <ellipse cx={0} cy={-1.8 * s} rx={5 * s} ry={2 * s} fill={color} stroke={OUTLINE} strokeWidth={0.5} />
        <path d={`M ${-4.6 * s} ${-1.6 * s} q ${-3 * s} ${0.4 * s} ${-4.6 * s} ${2 * s}`} stroke={color} strokeWidth={1.2 * s} fill="none" strokeLinecap="round" />
        <circle cx={5.6 * s} cy={-2.2 * s} r={1.5 * s} fill={color} />
      </g>
    )
  }

  if (a === 'deer') {
    return (
      <g>
        <ellipse cx={0} cy={0.5 * s} rx={8 * s} ry={2 * s} fill="#000" opacity={0.32} />
        <path
          d={`M ${-6 * s} 0 v ${-7 * s} M ${-2 * s} 0 v ${-7 * s} M ${3 * s} 0 v ${-7 * s} M ${6.5 * s} 0 v ${-7 * s}`}
          stroke={color}
          strokeWidth={1.5 * s}
          strokeLinecap="round"
        />
        <ellipse cx={0} cy={-9.5 * s} rx={8 * s} ry={4.2 * s} fill={color} stroke={OUTLINE} strokeWidth={0.5} />
        <path d={`M ${7 * s} ${-11 * s} l ${4 * s} ${-4.5 * s}`} stroke={color} strokeWidth={2.3 * s} strokeLinecap="round" />
        <circle cx={11.6 * s} cy={-16 * s} r={2.5 * s} fill={color} />
        {/* 角 */}
        <path
          d={`M ${11 * s} ${-18 * s} l ${-2 * s} ${-4 * s} m ${2 * s} ${4 * s} l ${1.4 * s} ${-4.6 * s} l ${2 * s} ${-1.6 * s} m ${-2 * s} ${1.6 * s} l ${1.8 * s} ${0.4 * s}`}
          stroke={color}
          strokeWidth={1 * s}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
      </g>
    )
  }

  if (a === 'heavy') {
    // 豬/熊:壯碩低身+鼻/吻
    return (
      <g>
        <ellipse cx={0} cy={0.5 * s} rx={7.5 * s} ry={2 * s} fill="#000" opacity={0.32} />
        <path
          d={`M ${-4.5 * s} 0 v ${-4.5 * s} M ${4.5 * s} 0 v ${-4.5 * s}`}
          stroke={color}
          strokeWidth={2 * s}
          strokeLinecap="round"
        />
        <ellipse cx={0} cy={-7.5 * s} rx={7.5 * s} ry={5 * s} fill={color} stroke={OUTLINE} strokeWidth={0.5} />
        <path d={`M ${6.5 * s} ${-6.5 * s} l ${3.4 * s} ${1.2 * s}`} stroke={color} strokeWidth={3.4 * s} strokeLinecap="round" />
        <circle cx={10.4 * s} cy={-5 * s} r={1 * s} fill="#d8b98a" />
        <path d={`M ${-2 * s} ${-12 * s} q ${2 * s} ${-2 * s} ${4 * s} 0`} stroke={color} strokeWidth={1.2 * s} fill="none" opacity={0.8} />
      </g>
    )
  }

  // quadruped:狼/猞/羊等一般四足
  return (
    <g>
      <ellipse cx={0} cy={0.5 * s} rx={7 * s} ry={1.8 * s} fill="#000" opacity={0.3} />
      <path
        d={`M ${-5 * s} 0 v ${-6 * s} M ${-1.5 * s} 0 v ${-6 * s} M ${2.5 * s} 0 v ${-6 * s} M ${5.5 * s} 0 v ${-6 * s}`}
        stroke={color}
        strokeWidth={1.4 * s}
        strokeLinecap="round"
      />
      <ellipse cx={0} cy={-8 * s} rx={7 * s} ry={3.4 * s} fill={color} stroke={OUTLINE} strokeWidth={0.5} />
      <path d={`M ${-6.4 * s} ${-8.5 * s} q ${-2.4 * s} ${-0.5 * s} ${-3.4 * s} ${1.6 * s}`} stroke={color} strokeWidth={1.4 * s} fill="none" strokeLinecap="round" />
      <path d={`M ${6 * s} ${-9.5 * s} l ${2.8 * s} ${-2 * s}`} stroke={color} strokeWidth={2 * s} strokeLinecap="round" />
      <circle cx={9.4 * s} cy={-12 * s} r={1.9 * s} fill={color} />
      {/* 耳 */}
      <path d={`M ${8.6 * s} ${-13.6 * s} l ${-0.6 * s} ${-1.8 * s} m ${1.6 * s} ${1.7 * s} l ${0.6 * s} ${-1.8 * s}`} stroke={color} strokeWidth={0.9 * s} strokeLinecap="round" />
    </g>
  )
}

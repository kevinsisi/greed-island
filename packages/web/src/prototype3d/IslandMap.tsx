import { useId } from 'react'
import { distance, getObjective } from './model'
import { getNpcs, NPC_CONFIG } from './npc'
import { WORLD, type DemoState, type Position } from './types'
import './map-ui.css'

const SCALE = 5.5
const point = ({ x, z }: Position) => ({ x: 150 + x * SCALE, y: 55 + (WORLD.bounds.maxZ - z) * SCALE })
const trail = ([[0, -27], [0, -19], [-1.4, -12], [-1.8, -5], [0.7, 3], [0.8, 11], [0, 19], [0, 30]] as const)
  .map(([x, z]) => { const p = point({ x, z }); return `${p.x},${p.y}` }).join(' ')
const trees: [number, number][] = [[-10, -10], [-7.8, -8], [9.5, -7], [7.8, -3], [-10.8, -1], [-8, 3], [10.5, 4], [8, 8], [-10, 10], [-7.6, 13], [10.5, 14], [12, -13], [-12, -16], [12, 23], [-12, 25]]

/** A north-up chart. All moving and quest markers use the same coordinates as the 3D world. */
export function IslandMap({ state, compact = false }: { state: DemoState; compact?: boolean }) {
  const uid = useId().replace(/:/g, '')
  const objective = getObjective(state)
  const player = point(state.position)
  const target = point(objective.position)
  const gate = point(WORLD.gate)
  const relic = point(WORLD.relic)
  const npcs = getNpcs(state)
  return <div className={`p3d-island-map${compact ? ' is-compact' : ''}`}>
    <svg viewBox="0 0 300 440" role="img" aria-labelledby={`${uid}-title ${uid}-desc`}>
      <title id={`${uid}-title`}>潮鳴島地圖 · 北方朝上</title>
      <desc id={`${uid}-desc`}>你位於地圖白色圓點。{objective.destination}距離 {Math.round(distance(state.position, objective.position))} 公尺。遺跡封印{state.bridgeOpen ? '已開啟' : '尚未開啟'}，剩餘光種 {WORLD.seeds.length - state.seeds.length} 枚。圓點為島民，紅色菱形為石衛。</desc>
      <defs>
        <pattern id={`${uid}-sea`} width="31" height="28" patternUnits="userSpaceOnUse"><path d="M3 15Q9 11 15 15T27 15" fill="none" stroke="#aac2ae" strokeWidth=".55" opacity=".24"/></pattern>
        <linearGradient id={`${uid}-land`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#acb7a0"/><stop offset=".43" stopColor="#697f64"/><stop offset=".71" stopColor="#7c8a67"/><stop offset="1" stopColor="#b8ae82"/></linearGradient>
        <pattern id={`${uid}-paper`} width="9" height="11" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".4" fill="#182f29" opacity=".2"/><circle cx="7" cy="9" r=".3" fill="#e2d1a5" opacity=".18"/></pattern>
      </defs>
      <rect x="1" y="1" width="298" height="438" rx="3" fill="#203f3b" stroke="#bda878" strokeOpacity=".55"/>
      <rect x="9" y="9" width="282" height="422" fill={`url(#${uid}-sea)`} stroke="#a3b6a3" strokeOpacity=".19"/>
      <path d="M125 37L175 40L209 50L225 79L231 112L225 142L239 177L232 213L241 253L231 287L239 318L229 351L237 376L220 403L185 412L149 408L115 417L80 400L62 372L69 341L61 307L70 268L63 233L70 201L60 171L71 137L66 102L78 72L99 59Z" fill="none" stroke="#729a8b" strokeWidth="10" opacity=".45"/>
      <path d="M125 37L175 40L209 50L225 79L231 112L225 142L239 177L232 213L241 253L231 287L239 318L229 351L237 376L220 403L185 412L149 408L115 417L80 400L62 372L69 341L61 307L70 268L63 233L70 201L60 171L71 137L66 102L78 72L99 59Z" fill={`url(#${uid}-land)`} stroke="#cfbf8e" strokeWidth="1.5"/>
      <path d="M79 301Q124 311 149 300T228 302L229 351L237 376L220 403L185 412L149 408L115 417L80 400L62 372L69 341L61 307Z" fill="#b9ad82" opacity=".55"/>
      <rect x="93" y="53" width="114" height="83" rx="5" fill="#aeb59b" opacity=".65" stroke="#d5ceaa" strokeDasharray="2 4"/>
      <polyline points={trail} fill="none" stroke="#4b614d" strokeWidth="18" strokeLinejoin="round" opacity=".3"/>
      <polyline points={trail} fill="none" stroke="#d0bd8c" strokeWidth="12" strokeLinejoin="round"/>
      <polyline points={trail} fill="none" stroke="#f1dcaa" strokeWidth=".7" strokeDasharray="3 6" opacity=".8"/>
      {trees.map(([x, z], i) => { const p = point({ x, z }); return <g key={i} transform={`translate(${p.x} ${p.y})`} fill="#304c3c" stroke="#bfd0a5" strokeWidth=".5"><path d="M0-9L-5 0H-3L-7 6H7L3 0H5Z"/><path d="M0 5V10" stroke="#395340" strokeWidth="1.5"/></g> })}
      {([[-8, -21], [8.3, -17]] as const).map(([x, z], i) => { const p = point({ x, z }); return <g key={i} transform={`translate(${p.x} ${p.y})`}><rect x="-10" y="-7" width="20" height="17" fill="#d2b684" stroke="#425449"/><path d="M-12-6L0-14L12-6Z" fill="#765849" stroke="#d4c392"/><path d="M-2 3H3V10H-2Z" fill="#425449"/></g> })}
      <path d="M176 397V424H190V397M177 403H189M177 410H189M177 417H189" fill="#907954" stroke="#cfb987" strokeWidth="1.3"/>
      {([[-6, 25], [6, 25], [-6, 31], [6, 31]] as const).map(([x, z], i) => { const p = point({ x, z }); return <g key={i} transform={`translate(${p.x} ${p.y})`}><rect x="-4" y="-6" width="8" height="12" fill="#687c70" stroke="#dfd6b7"/><path d="M-6-6H6M-6 6H6" stroke="#52685b" strokeWidth="2"/></g> })}
      <rect x="10" y="10" width="280" height="420" fill={`url(#${uid}-paper)`} pointerEvents="none"/>
      <g fill="#243f34" className="p3d-map-region" textAnchor="middle">
        <text x="150" y="47">{compact ? '遺跡' : '潮汐遺跡'}</text>
        <text x="151" y="208">{compact ? '林地' : '螢光林地'}</text>
        <text x="150" y="382">{compact ? '港口' : '潮鳴港'}</text>
      </g>
      <g transform={`translate(${gate.x} ${gate.y})`}>
        <path d="M-70 0H70" stroke={state.bridgeOpen ? '#84d6bd' : '#694846'} strokeWidth={compact ? '3' : '2'} strokeDasharray={state.bridgeOpen ? '3 4' : undefined}/>
        <rect x="-8" y="-7" width="16" height="14" fill={state.bridgeOpen ? '#214f40' : '#573b35'} stroke="#e1d0a2"/>
        <path d={state.bridgeOpen ? 'M-4 0L-1 3L4-3' : 'M-3-3L3 3M3-3L-3 3'} stroke="#e6dbbc" strokeWidth="1.5" fill="none"/>
      </g>
      {!state.relic && <g transform={`translate(${relic.x} ${relic.y})`}><path d="M0-7L5 0L0 7L-5 0Z" fill="#a7e4d2" stroke="#2f5b50" strokeWidth="1.5"/></g>}
      {WORLD.seeds.map((position, index) => { const p = point(position); return state.seeds.includes(index) ? null : <g key={index} transform={`translate(${p.x} ${p.y})`}><circle r="6" fill="#405635" stroke="#e2d49a"/><path d="M0-4L1-1L4 0L1 1L0 4L-1 1L-4 0L-1-1Z" fill="#ffdf80"/></g> })}
      <g transform={`translate(${target.x} ${target.y})`}><circle r="12" fill="none" stroke="#f7d899" strokeWidth="1.5"/><path d="M0-16V-12M0 12V16M-16 0H-12M12 0H16" stroke="#f7d899" strokeWidth="1.5"/></g>
      {npcs.map(npc => { const p = point(npc.position); const config = NPC_CONFIG[npc.id]; return <g key={npc.id} transform={`translate(${p.x} ${p.y})`} opacity={npc.id === 'sentinel' && state.enemyHp <= 0 ? '.4' : 1}><title>{config.name} · {npc.id === 'sentinel' && state.enemyHp <= 0 ? '沉眠' : config.role}</title>{npc.id === 'sentinel' ? <path d="M0-7L7 0L0 7L-7 0Z" fill="#a85a46" stroke="#f3d4af" strokeWidth="1.5"/> : <><circle r={compact ? '5.5' : '6'} fill={config.color} stroke="#f2e2b8" strokeWidth="1.5"/><circle r="1.5" fill="#f9edcc"/></>}</g> })}
      <g transform={`translate(${player.x} ${player.y})`}><circle r="9" fill="#183c36" stroke="#fff1cd" strokeWidth=".8" opacity=".75"/><circle r="4.5" fill="#fff4cf" stroke="#233d34" strokeWidth=".8"/></g>
      <g transform="translate(262 50)" fill="none" stroke="#d4c398" strokeWidth=".8"><path d="M0-14V14M-14 0H14M0-12L4 0L0 12L-4 0Z"/><path d="M0-12L4 0H0Z" fill="#d4c398"/><text y="-21" textAnchor="middle" fill="#dfd3b0" stroke="none" fontSize="11">N</text></g>
      {!compact && <g transform="translate(24 405)" stroke="#c8bc98" fill="none"><path d="M0-3V0H55V-3M27.5 0V-3"/><text x="27.5" y="13" textAnchor="middle" stroke="none" fill="#d2c4a0" fontSize="8">10 公尺</text></g>}
    </svg>
    {!compact && <>
      <div className="p3d-map-destination"><span>前往 {objective.destination}</span><strong>{Math.round(distance(state.position, objective.position))}<small> 公尺</small></strong></div>
      <ul className="p3d-map-legend" aria-label="地圖圖例"><li><i className="is-player"/>你的位置</li><li><i className="is-objective"/>當前目標</li><li><i className="is-npc"/>島民</li><li><i className="is-enemy"/>石衛</li><li><i className="is-seed"/>光種</li><li><i className={state.bridgeOpen ? 'is-open' : 'is-closed'}/>{state.bridgeOpen ? '古道已開啟' : '封印尚未開啟'}</li></ul>
      <p className="p3d-map-note">地圖北方朝上，標記隨實際位置更新。開啟面板時，島上的時間暫停。</p>
    </>}
  </div>
}

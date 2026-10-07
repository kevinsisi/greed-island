import { useState } from 'react'
import { distance, getNpcExpeditionSummary } from './model'
import { getNpc, NPC_CONFIG, NPC_GOAL_LABELS, NPC_IDS, NPC_SKILL_LABELS, NPC_TALK_COOLDOWN, NPC_TALK_RANGE, npcDialogue, npcEfficiency } from './npc'
import type { DemoState, NpcId } from './types'
import './map-ui.css'

const skillIds = ['gathering', 'study', 'guarding'] as const
const timeLabel = (time: number) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`

function Portrait({ id, color }: { id: NpcId; color: string }) {
  return <svg viewBox="0 0 64 72" aria-hidden="true" className="p3d-npc-portrait">
    <path d="M8 68V24L32 6L56 24V68Z" fill="#102e2a" stroke="#a99e71" strokeWidth=".7"/>
    <circle cx="32" cy="31" r="19" fill={color} opacity=".2"/>
    {id === 'sentinel' ? <><path d="M22 21H42L46 38L39 47H25L18 38Z" fill="#879083" stroke="#d2c8a3"/><path d="M15 51L24 43H40L50 51L47 68H18Z" fill="#657b6b"/><path d="M24 32H40V36H24Z" fill="#c67151"/><path d="M32 48L36 56L32 63L28 56Z" fill="#d19b67"/></> : <>
      <path d="M15 68L19 48L27 43H37L45 48L50 68" fill={color} stroke="#cbb68a" strokeWidth=".7"/>
      <path d="M26 39V46L32 51L38 46V39" fill="#bd9472"/><path d="M22 26Q32 14 42 26V34Q41 45 32 45Q23 44 22 34Z" fill="#d1b28a"/>
      {id === 'guide' ? <><path d="M20 24L24 13H39L44 25Z" fill="#b1a37a"/><path d="M14 25Q32 19 49 26L47 30Q32 28 16 31Z" fill="#d7c298"/><path d="M25 19H41" stroke={color} strokeWidth="3"/><path d="M42 19L46 10L48 11L44 21" fill="#ded8b5"/></> : id === 'herbalist' ? <><path d="M20 34V24Q22 15 32 18Q44 16 45 28L43 39L40 26L29 25L23 37Z" fill="#574732"/><path d="M39 22Q47 10 48 20Q46 25 39 24" fill="#9ab685"/><path d="M17 54L25 62M47 54L39 62" stroke="#d7caa0" strokeWidth="1.5"/></> : <><path d="M19 32L22 22L32 14L43 22L46 35L40 29L32 22L25 28Z" fill={color} stroke="#bcb692"/><path d="M20 50L41 64" stroke="#ad956b" strokeWidth="3"/><path d="M42 51V69" stroke="#d7c599" strokeWidth="1.5"/></>}
      <path d="M26 33H28M36 33H38" stroke="#354536" strokeWidth="1.3"/><path d="M29 39Q32 41 35 39" fill="none" stroke="#82664e"/>
      <path d="M32 51L28 57L32 62L36 57Z" fill="#e4c78a"/>
    </>}
  </svg>
}

export function NpcJournal({ state, onTalk, initialId = 'guide' }: { state: DemoState; onTalk: (id: NpcId) => void; initialId?: NpcId }) {
  const [selected, setSelected] = useState<NpcId>(initialId)
  const [conversation, setConversation] = useState<NpcId | null>(null)
  const npc = getNpc(state, selected)
  const config = NPC_CONFIG[selected]
  const metres = distance(state.position, npc.position)
  const latestTalk = [...npc.memories].reverse().find(memory => memory.kind === 'talk')
  const cooldown = latestTalk ? Math.max(0, NPC_TALK_COOLDOWN - ((state.worldTime ?? 0) - latestTalk.time)) : 0
  const canTalk = selected !== 'sentinel' && metres <= NPC_TALK_RANGE && cooldown <= 0 && state.hp > 0
  const moving = distance(npc.position, npc.target) > .4
  const recentMemories = npc.memories.slice(-4).reverse()
  const gain = Math.round((npcEfficiency(npc) - 1) * 100)
  const expeditionSummary = getNpcExpeditionSummary(state, selected)

  function talk() {
    if (!canTalk) return
    setConversation(selected)
    onTalk(selected)
  }

  return <div className="p3d-npc-journal">
    <p className="p3d-npc-simulation"><i/>本地規則模擬 · 遊玩時演進</p>
    <div className="p3d-npc-tabs" role="group" aria-label="選擇觀察的島民">
      {NPC_IDS.map(id => <button type="button" key={id} aria-pressed={selected === id} onClick={() => { setSelected(id); setConversation(null) }}><i style={{ backgroundColor: NPC_CONFIG[id].color }}/><span>{NPC_CONFIG[id].name}</span></button>)}
    </div>
    <div className="p3d-npc-profile">
      <Portrait id={selected} color={config.color}/>
      <div><small>{config.role}</small><h3>{config.name}</h3><span>{Math.round(metres)} 公尺外 <b>·</b> {selected === 'sentinel' ? '守護者' : `信任 ${Math.round(npc.trust)}`}</span></div>
    </div>
    <section className="p3d-npc-inheritance" aria-label={`${config.name}的跨趟記憶`}>
      <h4>跨趟記憶 <span>隨存檔保留</span></h4>
      {expeditionSummary.length ? <ul>{expeditionSummary.map((summary, index) => <li key={index}>{summary}</li>)}</ul> : <p>這段旅程還沒有留下跨趟的選擇。</p>}
    </section>
    <div className="p3d-npc-intent"><span>此刻的打算</span><strong>{moving ? '正在前往 · ' : ''}{NPC_GOAL_LABELS[npc.goal]}</strong><p>{npc.goal === 'sleep' ? '石衛保留這次相遇的記憶，安靜地休眠。' : npc.goal === 'rest' ? '先恢復體力，再決定下一件要做的事。' : npc.goal === 'gather' ? '收集物資，熟練後能採得更多。' : npc.goal === 'study' ? '研究島上的事物，逐步累積知識。' : npc.goal === 'guard' ? '留意周遭動靜，在守望中磨練本領。' : '觀察旅人的行動，更新自己的見聞。'}</p></div>
    <div className="p3d-npc-needs">
      <label>體力 <span>{Math.round(npc.energy)} / 100</span><meter min="0" max="100" value={npc.energy}/></label>
      <label>好奇心 <span>{Math.round(npc.curiosity)} / 100</span><meter min="0" max="100" value={npc.curiosity}/></label>
    </div>
    <div className="p3d-npc-work"><span>完成行動 <strong>{npc.completedActions}</strong></span><span>持有物資 <strong>{Math.round(npc.supplies)}</strong></span><span>工作效率 <strong>+{gain}%</strong></span></div>
    <div className="p3d-npc-skills"><h4>持續累積的本領</h4>{skillIds.map(skill => <label key={skill}><span>{NPC_SKILL_LABELS[skill]}</span><meter min="0" max="120" value={Math.min(120, npc.skills[skill])} aria-label={`${NPC_SKILL_LABELS[skill]}熟練度；120 達工作效率加成上限`}/><b>{Math.floor(npc.skills[skill])}</b></label>)}</div>
    <div className="p3d-npc-memory"><h4>最近的記憶</h4>{recentMemories.length ? <ol>{recentMemories.map((memory, index) => <li key={`${memory.time}-${index}`}><time>{timeLabel(memory.time)}</time><span>{memory.text}</span></li>)}</ol> : <p>旅程剛開始，新的見聞會記在這裡。</p>}</div>
    {selected === 'sentinel' ? <p className="p3d-npc-quiet">石衛無法交談；牠會記住戰鬥與卡牌的影響。</p> : <div className="p3d-npc-conversation">
      {conversation === selected && <blockquote aria-live="polite">{npcDialogue(state, selected)}</blockquote>}
      <button type="button" onClick={talk} disabled={!canTalk}>{metres > NPC_TALK_RANGE ? `靠近至 ${NPC_TALK_RANGE} 公尺內交談` : cooldown > 0 ? `稍後再聊 · ${Math.ceil(cooldown)} 秒` : `與${config.name}交談`}<span aria-hidden="true">↗</span></button>
    </div>}
    <p className="p3d-npc-footnote">目標、需求、記憶與熟練度會改變；這是本地模擬，不會自我訓練，也不呼叫外部 AI。</p>
  </div>
}

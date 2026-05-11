import { TILE_NAME_BY_ID } from './mapGraph.js'
import type { NpcRuntimeState } from './npcEngine.js'

export type NpcIntentLine = Readonly<{ zh: string; en: string }>

const TILE_NAME_EN_BY_ID: Readonly<Record<string, string>> = {
  t_central: 'Nighttide District',
  t_desert: 'Tidecall District',
  t_dimai: 'Leyline Stratum',
  t_dock: 'Dock District',
  t_forest: 'Tidemirror Hill',
  t_mountain: 'Mistpeak Mountain',
  t_ruin: 'Rustbay District',
  t_temple: 'Neon Harbor'
}

export function deriveNpcIntentLine(state: NpcRuntimeState): NpcIntentLine {
  const task = state.agent.activeTask
  const target = tileName(task.targetTile || state.targetTile)

  if (task.kind === 'player-dialog') {
    return { zh: '正在和玩家交談', en: 'Talking with a player' }
  }
  if (task.kind === 'social-interaction') {
    return task.reason === 'npc-argue'
      ? { zh: '和附近的人爭論', en: 'Arguing nearby' }
      : { zh: '和附近的人聊天', en: 'Chatting nearby' }
  }
  if (task.kind === 'travel' || state.activity === 'move') {
    return { zh: `前往${target.zh}`, en: `Heading to ${target.en}` }
  }
  if (task.kind === 'personality-nudge') {
    if (task.reason === 'seek-company') return { zh: '去人多的地方看看', en: 'Looking for company' }
    if (task.reason === 'risk-seeking') return { zh: '巡看不安定的街角', en: 'Checking risky streets' }
    return { zh: `前往${target.zh}辦事`, en: `Running an errand to ${target.en}` }
  }

  switch (state.activity) {
    case 'work':
      return { zh: `在${target.zh}處理工作`, en: `Working in ${target.en}` }
    case 'trade':
      return { zh: `在${target.zh}招呼交易`, en: `Trading in ${target.en}` }
    case 'patrol':
      return { zh: `巡邏${target.zh}`, en: `Patrolling ${target.en}` }
    case 'eat':
      return { zh: `在${target.zh}用餐休息`, en: `Taking a meal in ${target.en}` }
    case 'sleep':
      return { zh: `在${target.zh}休息`, en: `Resting in ${target.en}` }
    case 'idle':
    default:
      return { zh: `在${target.zh}待命`, en: `Standing by in ${target.en}` }
  }
}

function tileName(tileId: string): NpcIntentLine {
  const knownZh = TILE_NAME_BY_ID[tileId]
  const knownEn = TILE_NAME_EN_BY_ID[tileId]
  if (knownZh || knownEn) return { zh: knownZh ?? tileId, en: knownEn ?? tileId }
  return { zh: tileId, en: tileId }
}

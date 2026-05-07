// Personality-based greet placeholder line shown when a player opens
// a dialog with an NPC but has not typed anything yet (turns.length===0
// on the web side). Pure, deterministic — same NPC always returns the
// same line so this never causes replay drift.
//
// Why this exists:
//   Until v0.14.x the empty-dialog UI showed a single i18n string
//   ("（{name} 看了你一眼，沒有開口。）"), which (a) was identical for
//   every NPC and (b) looked indistinguishable from a real AI fallback.
//   Players reasonably misread it as "the AI broke again". Each NPC
//   now gets a personality-shaped placeholder so the empty state has
//   character and is obviously not an AI failure.

import type { NpcProfile } from './types.js'

export type LocalizedLine = Readonly<{ zh: string; en: string }>

type Bucket = Readonly<{
  id: string
  lines: readonly LocalizedLine[]
}>

const BUCKET_RESERVED: Bucket = {
  id: 'reserved',
  lines: [
    { zh: '「……」（{name} 微微點頭，沒有開口。）', en: '"..." ({name} nods quietly, saying nothing.)' },
    { zh: '（{name} 抬眼看了你一下，眼神安靜。）', en: '({name} glances at you, eyes calm.)' },
    { zh: '「嗯。」', en: '"Mm."' },
  ],
}

const BUCKET_TEMPLE: Bucket = {
  id: 'temple',
  lines: [
    { zh: '「施主。今日來此，是有什麼心事嗎？」', en: '"Friend. What weighs on your heart today?"' },
    { zh: '「先別急著說話。聽完一聲鈴再開口也不遲。」', en: '"Do not rush to speak. Wait for one bell, then speak."' },
    { zh: '「來了就來了。要茶嗎？」', en: '"You came, then. Tea?"' },
  ],
}

const BUCKET_GUILD: Bucket = {
  id: 'guild',
  lines: [
    { zh: '「同道。脈網最近不太平，你要小心。」', en: '"Comrade. The vein-net has been jumpy — watch yourself."' },
    { zh: '「公會今天不發新工，你要找事可以先說。」', en: '"The guild posts no new jobs today. Speak if you need work."' },
    { zh: '「公文還沒批，先講重點。」', en: '"The paperwork is not stamped yet — get to the point."' },
  ],
}

const BUCKET_CHEERFUL: Bucket = {
  id: 'cheerful',
  lines: [
    { zh: '「嘿！新面孔啊，歡迎來到潮鳴市！」', en: '"Hey! New face — welcome to Tideway!"' },
    { zh: '「喔～你是來找我聊天的嗎？太棒了！」', en: '"Oh — are you here to chat with me? Wonderful!"' },
    { zh: '「來啦來啦，正好我閒著呢！」', en: '"There you are! I was just standing around bored."' },
  ],
}

const BUCKET_GREEDY: Bucket = {
  id: 'greedy',
  lines: [
    { zh: '「喲，看你眼生。要不要做筆生意？」', en: '"Heh, fresh face. Care for a little business?"' },
    { zh: '「身上有貨吧？拿出來看看，我不殺熟。」', en: '"You have wares, no? Show me — I do not gouge regulars."' },
    { zh: '「先說好，閒聊不收錢，但情報要算的。」', en: '"Chatting is free — but information has a price."' },
  ],
}

const BUCKET_GRUFF: Bucket = {
  id: 'gruff',
  lines: [
    { zh: '「找我幹嘛？沒事就別擋路。」', en: '"What do you want? If it is nothing, do not block the way."' },
    { zh: '「說話。我沒空陪你站著。」', en: '"Speak. I do not have time to stand around."' },
    { zh: '「嘖。又一個外地人。」', en: '"Tch. Another out-of-towner."' },
  ],
}

const BUCKET_NEUTRAL: Bucket = {
  id: 'neutral',
  lines: [
    { zh: '「來啦？有事嗎？」', en: '"Oh, you. Need something?"' },
    { zh: '「站在這裡，是想找我講話嗎？」', en: '"Standing there — did you want to speak with me?"' },
    { zh: '「嗯，怎麼？」', en: '"Mm, what is it?"' },
  ],
}

function pickBucket(profile: NpcProfile): Bucket {
  const p = profile.personality
  const calmness = num(p.calmness)
  const patience = num(p.patience)
  const greed = num(p.greed)
  const faction = typeof p.factionLean === 'string' ? p.factionLean : ''

  if (faction === 'temple' || faction === 'mountain') return BUCKET_TEMPLE
  if (faction === 'guild' || faction === 'exchange') return BUCKET_GUILD
  if (calmness >= 0.85 && patience >= 0.5) return BUCKET_RESERVED
  if (greed >= 0.65) return BUCKET_GREEDY
  if (calmness <= 0.45 && patience >= 0.4) return BUCKET_CHEERFUL
  if (patience <= 0.35) return BUCKET_GRUFF
  return BUCKET_NEUTRAL
}

function num(v: number | string | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0.5
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic personality-shaped greet placeholder for the empty
 * dialog UI. Pure: same profile always returns the same line. */
export function derivePersonalityGreetLine(profile: NpcProfile): LocalizedLine {
  const bucket = pickBucket(profile)
  const idx = hash(profile.id) % bucket.lines.length
  const tpl = bucket.lines[idx]!
  return {
    zh: tpl.zh.replaceAll('{name}', profile.name.zh),
    en: tpl.en.replaceAll('{name}', profile.name.en),
  }
}

// ── v0.15.0：dynamic greet 改進 ───────────────────────────────────
//
// 玩家打開對話框時，前端先 call /api/npc/:id/greet?accountId=… 拿一句
// 帶好感度 + 互動歷史的招呼語。這仍然是 deterministic 的（用
// (profile, trust, interactionCount) 做 seed），不是 AI；目的是讓「空
// 對話」的占位符根據雙方目前狀態而變，而不是固定一句。

const GREET_FAMILIAR_TIER: ReadonlyArray<LocalizedLine> = [
  { zh: '「啊，又見面了。」', en: '"Ah — you again."' },
  { zh: '「來啦？我以為你今天不會出門。」', en: '"There you are. I thought you were holed up today."' },
  { zh: '「來坐。茶還熱。」', en: '"Come, sit. Tea\'s still warm."' },
  { zh: '「看到你進來，我笑了一下。」', en: '"Caught myself smiling when I saw you walk in."' },
]

const GREET_BONDED_TIER: ReadonlyArray<LocalizedLine> = [
  { zh: '「你回來了。」（語氣比平時放鬆一點）', en: '"You\'re back." (the voice softens a touch)' },
  { zh: '「我猜你今天會來。對吧。」', en: '"I had a feeling you\'d come today. I was right."' },
  { zh: '「老樣子？還是想換個說法。」', en: '"The usual — or do you want a fresh take?"' },
  { zh: '「先別走。我有事要跟你說。」', en: '"Don\'t leave just yet. There\'s something for you."' },
]

const GREET_HOSTILE_TIER: ReadonlyArray<LocalizedLine> = [
  { zh: '「又是你？」（眉一挑）', en: '"You — again." (eyebrow raised)' },
  { zh: '「我以為昨天那場事沒講完。」', en: '"I thought we hadn\'t finished yesterday\'s business."' },
  { zh: '「別站太近。」', en: '"Don\'t stand so close."' },
]

const GREET_FRESH_TIER: ReadonlyArray<LocalizedLine> = [
  { zh: '（{name} 上下打量了你一眼。）', en: '({name} looks you up and down once.)' },
  { zh: '「面生啊。是來找我的？」', en: '"Don\'t know your face. Looking for me?"' },
  { zh: '「先說名字，再開口。」', en: '"Name first. Then speak."' },
]

const GREET_RECONNECT_TIER: ReadonlyArray<LocalizedLine> = [
  { zh: '「好久不見。」', en: '"It has been a while."' },
  { zh: '「我以為你不會再來了。」', en: '"I thought you wouldn\'t come back."' },
  { zh: '「久違。坐下說。」', en: '"It\'s been long. Sit."' },
]

/**
 * Per-player dynamic greet：依好感度 + 互動次數 + 上次互動 tick 差挑句。
 *
 * Tier rules:
 *   * trust >= 80：bonded — 親密語氣
 *   * trust >= 55 + interactions >= 5：familiar — 熟客
 *   * trust <= 20：hostile — 防衛
 *   * sinceTickGap >= 2400 (≈3.3 hr 模擬時) + interactions >= 3：reconnect — 久別
 *   * 其它：fall back to personality-based line
 */
export function deriveDynamicGreetLine(
  profile: NpcProfile,
  options: {
    trust: number
    interactionCount: number
    lastInteractionTick: number
    currentTick: number
  }
): LocalizedLine {
  const sinceGap = Math.max(0, options.currentTick - options.lastInteractionTick)
  let bucket: ReadonlyArray<LocalizedLine> | null = null
  if (options.interactionCount === 0) {
    bucket = GREET_FRESH_TIER
  } else if (options.trust <= 20) {
    bucket = GREET_HOSTILE_TIER
  } else if (options.trust >= 80) {
    bucket = GREET_BONDED_TIER
  } else if (
    options.trust >= 55 &&
    options.interactionCount >= 5 &&
    sinceGap < 2400
  ) {
    bucket = GREET_FAMILIAR_TIER
  } else if (options.interactionCount >= 3 && sinceGap >= 2400) {
    bucket = GREET_RECONNECT_TIER
  }

  if (!bucket) {
    return derivePersonalityGreetLine(profile)
  }
  // Deterministic by (profile.id, trust, interactionCount)
  const seed = hash(`${profile.id}|${options.trust}|${options.interactionCount}`)
  const idx = seed % bucket.length
  const tpl = bucket[idx]!
  return {
    zh: tpl.zh.replaceAll('{name}', profile.name.zh),
    en: tpl.en.replaceAll('{name}', profile.name.en),
  }
}

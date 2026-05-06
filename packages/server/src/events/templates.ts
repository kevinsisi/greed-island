// World event template registry.
//
// 32 narrative event templates spread across four categories
// (weather, npc, card, city). The world event engine picks one per
// cadence tick using a deterministic RNG seeded from the tick number,
// so the same event log replays identically.
//
// Templates intentionally keep narration short and stay within the
// Tideway / 潮鳴市 worldview. NPC and card templates pull from named
// NPCs and existing rune-card lore so the world feels populated by
// the same characters the player can already meet.

import type { LocalizedText, WorldEventTemplate } from './types.js'
import { TICKS_PER_MINUTE } from '../config/world.js'

const SHORT = TICKS_PER_MINUTE * 2
const MEDIUM = TICKS_PER_MINUTE * 5
const LONG = TICKS_PER_MINUTE * 10
const VERY_LONG = TICKS_PER_MINUTE * 20

function pick<T>(rng: () => number, options: readonly T[]): T {
  if (options.length === 0) throw new Error('pick called with empty options')
  const idx = Math.floor(rng() * options.length)
  return options[Math.max(0, Math.min(options.length - 1, idx))]!
}

// ---- Weather ---------------------------------------------------------
const WEATHER_TEMPLATES: WorldEventTemplate[] = [
  {
    id: 'weather.storm',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '海上颳起暴風雨，潮鳴市的窗戶都在嘎嘎作響。出門記得抓緊雨棚。',
      en: 'A storm rolls in over the sea — every window in Tideway rattles. Hold tight to your awnings.',
    }),
    buildPayload: () => ({ effect: 'storm', surfaceMovementPenalty: 0.2 }),
  },
  {
    id: 'weather.fog',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: LONG,
    narrate: () => ({
      zh: '一層厚海霧悄悄爬上岸，街燈像漂浮在牛奶裡。',
      en: 'A thick sea-fog creeps up the streets — every lamp seems to swim in milk.',
    }),
    buildPayload: () => ({ effect: 'fog', visibilityPenalty: 0.4 }),
  },
  {
    id: 'weather.tide_omen',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '初潮紀念日當夜，海面上閃過一道淡綠色的光，像有人在水底點燈。',
      en: 'On the eve of the first-tide remembrance, a faint green glow flickers below the waves — as if someone is lighting lamps underwater.',
    }),
    buildPayload: () => ({ effect: 'rare_window_hint', windowId: 'tide_festival' }),
  },
  {
    id: 'weather.lightning',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '一道乾雷劈過中央城上空，公會大鐘震了三聲後又自己歸於安靜。',
      en: 'Dry lightning splits the sky over Central — the guild bell rings thrice and falls silent again on its own.',
    }),
  },
  {
    id: 'weather.heat',
    type: 'weather',
    scope: { kind: 'region', tileIds: ['t_desert', 't_dock'] },
    durationTicks: LONG,
    narrate: () => ({
      zh: '熱浪沿著西緣荒地一路鋪到碼頭區，連石頭都在喘氣。',
      en: 'A heat ridge runs from the western badlands to the docks — even the stones seem to pant.',
    }),
    buildPayload: () => ({ effect: 'heat_wave', staminaDecay: 0.15 }),
  },
  {
    id: 'weather.cold_front',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '北方森林吹來一道冷鋒，神殿的湖面結出細薄的冰殼。',
      en: 'A cold front blows down from the northern forest — a fine crust of ice forms across the shrine lake.',
    }),
  },
  {
    id: 'weather.aurora',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '夜空裡浮起紫色的脈光，像有人把潮汐節提早搬到了天上。',
      en: 'Violet vein-light wakes across the night sky — as if the tide festival had been moved early into the heavens.',
    }),
  },
  {
    id: 'weather.calm',
    type: 'weather',
    scope: { kind: 'world' },
    durationTicks: VERY_LONG,
    narrate: () => ({
      zh: '潮鳴市的天氣突然變得異常平靜，連風行船的舵手都皺起了眉頭。',
      en: 'Tideway settles into an unnatural calm — even wind-runner helmsmen frown.',
    }),
    buildPayload: () => ({ effect: 'eerie_calm' }),
  },
]

// ---- NPC -------------------------------------------------------------
const NPC_TEMPLATES: WorldEventTemplate[] = [
  {
    id: 'npc.argue.dock_central',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_dock', 't_central'] },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '碼頭的阿弟和中央城的麵攤老闆阿成又為了魚貨價吵起來，圍觀的人賺到笑話。',
      en: 'A-Di at the docks and A-Cheng the noodle vendor argue again over fish prices — onlookers get a free comedy.',
    }),
  },
  {
    id: 'npc.discount.grocer',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '林菲煙的雜貨店今晚清庫存，街口貼出黃紙：今夜八折。',
      en: 'Lin Fei-Yan posts a yellow sheet on the corner — tonight only, 20% off at the general store.',
    }),
    buildPayload: () => ({ effect: 'price_discount', npcId: 'central.grocer.lin_fei_yan', percent: 20 }),
  },
  {
    id: 'npc.pickpocket.night_market',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '夜市傳來呼喊聲——又有人在攤前被偷了紋卡，目擊者說那身影一閃就鑽進廢墟去了。',
      en: 'Shouts ring through the night-market — another rune-card lifted at a stall. Witnesses say the shadow vanished toward the southern ruins.',
    }),
    buildPayload: () => ({ effect: 'theft_alert', region: 't_central' }),
  },
  {
    id: 'npc.rumour.bai_wei',
    type: 'npc',
    scope: { kind: 'world' },
    durationTicks: LONG,
    narrate: () => ({
      zh: '潮語塔的白薇姊三天沒下塔，公寓管理員小安到處打聽她到底在等什麼。',
      en: 'Bai Wei has not left the Tide-Tongue Tower in three days. Concierge An asks around — what is she waiting for?',
    }),
  },
  {
    id: 'npc.busker_set',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '街頭吉他手黃宇澄在主廣場開了一場即興演唱，路人圍出整片人牆。',
      en: 'Huang Yu-Cheng kicks off an impromptu set on the main square — passers-by form a wall around him.',
    }),
  },
  {
    id: 'npc.feud.shen_lien',
    type: 'npc',
    scope: { kind: 'world' },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '紋卡交易所的沈所長與潮獵會連博文又互相放話，公會大廳的氣氛冷得能結霜。',
      en: 'Director Shen and Master Lien trade barbs again — the guild hall freezes mid-conversation.',
    }),
  },
  {
    id: 'npc.lost_child.forest',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_forest'] },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '北方森林傳出消息，樹屋少年童依跟蹤一隻狐狸跑遠了，守林員楊樺出去找他。',
      en: 'Word from the forest — Tung Yi has chased a fox too far. Ranger Yang Hua is out searching.',
    }),
  },
  {
    id: 'npc.tea_invitation',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_dock'] },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '港邊咖啡店長鄭婉婷今晚開放免費奶茶給「身上有故事」的客人。',
      en: 'At the harbour café, Cheng Wan-Ting offers free milk-tea tonight to anyone "with a story to tell".',
    }),
  },
  {
    id: 'npc.silent_protest.guild',
    type: 'npc',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '一群通勤上班族在公會門口靜坐，抗議捷運停運與名單外洩。',
      en: 'A line of commuters sits silently at the guild gate — protesting transit halts and leaked lists.',
    }),
  },
]

// ---- Cards -----------------------------------------------------------
const CARD_TEMPLATES: WorldEventTemplate[] = [
  {
    id: 'card.rumour.rare_in_ruin',
    type: 'card',
    scope: { kind: 'region', tileIds: ['t_ruin'] },
    durationTicks: LONG,
    narrate: () => ({
      zh: '南方廢墟傳出線索，一張被磨掉編號的稀有紋卡昨夜易手，價碼高得離譜。',
      en: 'A whisper from the southern ruins — a rare card with its serial scraped off changed hands at an outrageous price last night.',
    }),
    buildPayload: () => ({ effect: 'card_lead', region: 't_ruin', rarityHint: 'rare' }),
  },
  {
    id: 'card.release.cap_zero',
    type: 'card',
    scope: { kind: 'world' },
    durationTicks: VERY_LONG,
    narrate: () => ({
      zh: '存世上限歸零的舊卡被釋出市場，紋卡交易所外排起長龍。',
      en: 'An old card whose surviving copies dropped to zero is released back into circulation — a long line forms outside the exchange.',
    }),
    buildPayload: () => ({ effect: 'card_release', releaseSource: 'exchange' }),
  },
  {
    id: 'card.surfacing.lake',
    type: 'card',
    scope: { kind: 'region', tileIds: ['t_temple'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '湖心神殿的湖面浮出一張新的紋卡輪廓，沒人敢先伸手撈。',
      en: 'A fresh card silhouette surfaces at the shrine lake — no one dares reach for it first.',
    }),
    buildPayload: () => ({ effect: 'card_surfacing', region: 't_temple' }),
  },
  {
    id: 'card.stolen.exchange',
    type: 'card',
    scope: { kind: 'world' },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '紋卡交易所的櫃檯傳出竊案，沈所長親自下令封鎖一個小時。',
      en: 'A theft hits the exchange counter — Director Shen orders the floor sealed for an hour.',
    }),
    buildPayload: () => ({ effect: 'exchange_lockdown' }),
  },
  {
    id: 'card.lighthouse_signal',
    type: 'card',
    scope: { kind: 'world' },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '潮語塔的燈閃了三長兩短，老衝浪手江博然說那是稀有紋卡的入場號。',
      en: 'The Tide-Tongue lighthouse flashes three-long-two-short — surfer Jiang Bo-Ran calls it the call sign for a rare card.',
    }),
    buildPayload: () => ({ effect: 'rare_signal' }),
  },
  {
    id: 'card.relic_appraisal',
    type: 'card',
    scope: { kind: 'region', tileIds: ['t_ruin'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '廢墟資料員卓敏宣布今晚免費鑑定一張舊卡，廢墟入口排起二十人長隊。',
      en: 'Archivist Cho Min announces free appraisal of one old card tonight — a queue of twenty forms at the ruin gate.',
    }),
  },
  {
    id: 'card.exchange_dump',
    type: 'card',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: LONG,
    narrate: () => ({
      zh: '中央城的交易所大量釋出一批 D 階紋卡，盤面瞬間被打到地板價。',
      en: 'The central exchange dumps a batch of D-rank cards — the floor price collapses in minutes.',
    }),
    buildPayload: () => ({ effect: 'card_dump', rank: 'D' }),
  },
  {
    id: 'card.window_alignment',
    type: 'card',
    scope: { kind: 'world' },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '潮汐節的窗口和湖心神殿的鈴罕見地同步響起，連神殿守護者元若言都沉默了一秒。',
      en: 'The festival window and the shrine bell ring at the same instant — even Warden Yuan Jo-Yen pauses for a beat.',
    }),
    buildPayload: () => ({ effect: 'rare_window_alignment' }),
  },
]

// ---- City ------------------------------------------------------------
const CITY_TEMPLATES: WorldEventTemplate[] = [
  {
    id: 'city.transit.broken',
    type: 'city',
    scope: { kind: 'region', tileIds: ['t_central', 't_dock'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '潮聲列車中央站訊號故障，全線停駛三十分鐘，月台上擠滿罵罵咧咧的通勤客。',
      en: 'A signal failure halts the tide-line train at Central for thirty minutes — platforms fill with grumbling commuters.',
    }),
    buildPayload: () => ({ effect: 'transit_outage' }),
  },
  {
    id: 'city.fire.night_market',
    type: 'city',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: LONG,
    narrate: () => ({
      zh: '夜市小巷一間炸物攤起火，消防隊撲了二十分鐘才壓住。整條街今晚都是焦味。',
      en: 'A fryer blaze ignites a night-market alley — it takes the brigade twenty minutes to tame. The whole street smells of char.',
    }),
    buildPayload: () => ({ effect: 'fire_alert' }),
  },
  {
    id: 'city.opening.bookstore',
    type: 'city',
    scope: { kind: 'region', tileIds: ['t_central'] },
    durationTicks: VERY_LONG,
    narrate: () => ({
      zh: '中央城新開了一家潮鳴紀的二手書店，第一週每張紋卡傳記書類七折。',
      en: 'A new second-hand bookshop opens in Central — Tideway-lore card biographies 30% off in week one.',
    }),
    buildPayload: () => ({ effect: 'shop_opening', shopType: 'bookstore' }),
  },
  {
    id: 'city.parade.festival_prep',
    type: 'city',
    scope: { kind: 'world' },
    durationTicks: LONG,
    narrate: () => ({
      zh: '潮汐節準備期，中央城掛起整排紙燈籠，公會發布三日內限時任務。',
      en: 'Tide festival prep — paper lanterns line Central, and the guild posts three-day flash quests.',
    }),
    buildPayload: () => ({ effect: 'festival_prep', windowDays: 3 }),
  },
  {
    id: 'city.curfew.advice',
    type: 'city',
    scope: { kind: 'region', tileIds: ['t_ruin', 't_central'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '潮獵會建議入夜後勿進廢墟，最近偽幣與假紋卡頻傳。',
      en: 'The Tide-Hunter Guild advises against entering the ruins after dark — counterfeit coins and forged cards have spiked.',
    }),
    buildPayload: () => ({ effect: 'curfew_advisory' }),
  },
  {
    id: 'city.power_outage',
    type: 'city',
    scope: { kind: 'region', tileIds: ['t_dock', 't_central'] },
    durationTicks: SHORT,
    narrate: () => ({
      zh: '碼頭區跳電，整條商業街瞬間黑掉，攤販靠手電筒繼續做生意。',
      en: 'Power drops at the docks — the whole commerce strip blacks out, vendors keep selling by torchlight.',
    }),
    buildPayload: () => ({ effect: 'power_outage' }),
  },
  {
    id: 'city.regulation_drop',
    type: 'city',
    scope: { kind: 'world' },
    durationTicks: VERY_LONG,
    narrate: () => ({
      zh: '公會公布新規：A 階以上紋卡須登記發行人。爭吵聲在大廳中迴盪。',
      en: 'The guild announces a new rule — A-rank-and-above cards must register their issuer. Shouts echo in the hall.',
    }),
    buildPayload: () => ({ effect: 'regulation_change' }),
  },
  {
    id: 'city.rescue.mountain_drill',
    type: 'city',
    scope: { kind: 'region', tileIds: ['t_mountain'] },
    durationTicks: MEDIUM,
    narrate: () => ({
      zh: '東方山脈舉行救難演習，礦工頭鐵叔親自帶隊，山徑封閉一陣。',
      en: 'A rescue drill runs on the eastern mountain — Foreman Tieh leads, the trail is closed for a while.',
    }),
  },
]

const ALL_TEMPLATES: readonly WorldEventTemplate[] = [
  ...WEATHER_TEMPLATES,
  ...NPC_TEMPLATES,
  ...CARD_TEMPLATES,
  ...CITY_TEMPLATES,
]

// Sanity-check at module load: ids must be unique.
;(() => {
  const seen = new Set<string>()
  for (const t of ALL_TEMPLATES) {
    if (seen.has(t.id)) throw new Error(`Duplicate world event template id: ${t.id}`)
    seen.add(t.id)
  }
})()

export function listEventTemplates(): readonly WorldEventTemplate[] {
  return ALL_TEMPLATES
}

export function findEventTemplate(id: string): WorldEventTemplate | null {
  for (const t of ALL_TEMPLATES) if (t.id === id) return t
  return null
}

// Helper used by templates that need to vary narration deterministically
// from the rng. Kept here so the template registry stays the only place
// that owns randomised text.
export function pickNarration(
  rng: () => number,
  options: readonly LocalizedText[]
): LocalizedText {
  return pick(rng, options)
}

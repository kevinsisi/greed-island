// Archetype-based dialog packs for the city's "daily-life" NPC set.
//
// Each daily-life NPC profile carries `personality.archetype` (e.g.
// "shopkeeper" / "civic" / "craftsman" / "mystic" / "outsider"
// / "entertainer"). At boot, the loader walks every loaded profile
// and, for any profile that does not already have an explicit dialog
// pack registered in dialog.ts, builds a personalised pack from the
// matching archetype template here.
//
// The personalisation is purely template substitution: `{name}` is
// replaced with the NPC's localised display name, `{role}` with the
// localised role label. Everything else is shared text per archetype,
// so adding a new daily-life NPC is a one-file change (JSON profile
// only).

import type { DialogPack, InteractIntent, LocalizedLine, RelationshipTier } from '../dialog.js'
import type { NpcLocale, NpcProfile } from '../types.js'

export type DailyLifeArchetype =
  | 'shopkeeper'
  | 'civic'
  | 'craftsman'
  | 'mystic'
  | 'outsider'
  | 'entertainer'

const DAILY_LIFE_ARCHETYPES: readonly DailyLifeArchetype[] = [
  'shopkeeper',
  'civic',
  'craftsman',
  'mystic',
  'outsider',
  'entertainer',
]

export function isDailyLifeArchetype(value: unknown): value is DailyLifeArchetype {
  return typeof value === 'string' && (DAILY_LIFE_ARCHETYPES as readonly string[]).includes(value)
}

type RawPack = Readonly<Record<InteractIntent, Readonly<Record<RelationshipTier, readonly LocalizedLine[]>>>>

const TEMPLATES: Readonly<Record<DailyLifeArchetype, RawPack>> = {
  // --- 店家／攤販／餐飲 -----------------------------------------------
  shopkeeper: {
    greet: {
      low: [
        { zh: '「歡迎來到{role}的攤前。要看貨還是隨便逛？」', en: '"Welcome to my stall. Buying, or just looking?"' },
        { zh: '「我是{name}，今天剛上的東西在這一排。」', en: '"I am {name}. New stock is on this rack today."' },
      ],
      mid: [
        { zh: '「又是你！老樣子，還是想看點新進的？」', en: '"You again — the usual, or eyeing the fresh batch?"' },
        { zh: '「來坐一下，潮鳴市最近價飄得很，我講給你聽。」', en: '"Come sit. Tideway prices have been jittery — let me tell you."' },
      ],
      high: [
        { zh: '「自己人！後櫃我留了一份你愛吃的。」', en: '"Family! I tucked away your favourite in the back."' },
        { zh: '「進來進來，今天的東西特別好，先給你挑。」', en: '"Come in, come in. Today\'s lot is good — first pick is yours."' },
      ],
    },
    ask: {
      low: [
        { zh: '「攤上的事我比較懂啦，城裡大事不要問我。」', en: '"I know stalls — leave the city\'s big news to bigger ears."' },
        { zh: '「你要打聽事情？要先買點東西嘛。」', en: '"Want to ask around? Buy something first."' },
      ],
      mid: [
        { zh: '「最近碼頭區漲，山貨壓不下來；夜市那邊有人在掃貨。」', en: '"Dock prices climb, mountain goods will not budge — and someone is sweeping the night-market."' },
        { zh: '「我聽隔壁老闆說，潮汐節前貨會漲一波，你要囤就趁早。」', en: '"My neighbour says prices spike before the festival — stockpile while you can."' },
      ],
      high: [
        { zh: '「跟你講，下一批貨我先幫你留好，不在帳上。」', en: '"Between us — the next batch is yours first, off the books."' },
        { zh: '「夜市某條巷子有人深夜搬箱，貨色不太對，你別接。」', en: '"Crates moving down a night-market alley after dark — bad goods, do not touch."' },
      ],
    },
    trade: {
      low: [
        { zh: '「目前沒有可交易的物品，東西還沒上架。」', en: '"Nothing to trade right now — stock is not on the shelf yet."' },
      ],
      mid: [
        { zh: '「目前沒有可交易的物品，下批進來我捎你一聲。」', en: '"Nothing to trade right now — I will tip you off when stock arrives."' },
      ],
      high: [
        { zh: '「目前沒有可交易的物品，但你來，賒帳也行。」', en: '"Nothing to trade right now — for you, credit is fine."' },
      ],
    },
    leave: {
      low: [{ zh: '「走慢點，下次帶錢包。」', en: '"Mind your step — bring a wallet next time."' }],
      mid: [{ zh: '「路上小心，潮鳴市夜裡不太乾淨。」', en: '"Walk safe. Tideway is not clean at night."' }],
      high: [{ zh: '「再來啊，攤永遠在這條街。」', en: '"Come back. The stall stays on this street."' }],
    },
  },

  // --- 通勤族／學生／市民 ---------------------------------------------
  civic: {
    greet: {
      low: [
        { zh: '「不好意思，我趕時間。要問路嗎？」', en: '"Sorry, I am in a rush — need directions?"' },
        { zh: '「{name}，路過而已，沒空。」', en: '"{name} here — just passing through, no time."' },
      ],
      mid: [
        { zh: '「咦，這時間你也在這邊？我準備去趕下一班潮聲列車。」', en: '"Oh, you here at this hour? I am chasing the next tide-line train."' },
        { zh: '「中央城最近真的太擠了，我下班都要繞路。」', en: '"Central is really jammed — I take the long way home now."' },
      ],
      high: [
        { zh: '「好巧！要不要等等一起去吃個宵夜？」', en: '"Small world — want to grab a late-night bite together?"' },
        { zh: '「老朋友！我今天難得有空，陪我走一段？」', en: '"Old friend — I am free for once. Walk with me?"' },
      ],
    },
    ask: {
      low: [
        { zh: '「我只是上班族，城裡的事新聞最快。」', en: '"I just commute — the news has it faster than I do."' },
        { zh: '「{name} 只認識自己這條路線，問捷運站告示比較快。」', en: '"{name} only knows this commute. The transit board has it faster."' },
      ],
      mid: [
        { zh: '「最近捷運常停，公會說脈網有點不穩。」', en: '"The transit halts a lot lately — the guild blames an unstable vein-net."' },
        { zh: '「夜市那一條街上禮拜失火，現在大家繞著走。」', en: '"That night-market block had a fire last week. Everyone walks around it now."' },
      ],
      high: [
        { zh: '「我表姐在公會上班，她說名單上有人從碼頭過來。」', en: '"My cousin works at the guild. She says someone from the docks is on the list."' },
        { zh: '「跟你講真的——上次潮汐節我看到燈塔閃三長兩短。」', en: '"Honestly — last festival I saw the lighthouse flash three-long-two-short."' },
      ],
    },
    trade: {
      low: [{ zh: '「我下班的人哪有什麼貨。目前沒有可交易的物品。」', en: '"Just a commuter — no stock here. Nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品，但我同事手上有，要我幫你問？」', en: '"Nothing to trade — my coworker might. Want me to ask?"' }],
      high: [{ zh: '「目前沒有可交易的物品。但你要的話，我家裡那張舊紋卡可以借你看。」', en: '"Nothing to trade — but I can lend you the old card from my place."' }],
    },
    leave: {
      low: [{ zh: '「掰，我趕車。」', en: '"Bye — train to catch."' }],
      mid: [{ zh: '「下次再聊，我先去打卡。」', en: '"Catch up later — clocking in now."' }],
      high: [{ zh: '「保重啊，這城裡夜路要小心。」', en: '"Take care — Tideway nights are tricky."' }],
    },
  },

  // --- 工匠／勞動者 ---------------------------------------------------
  craftsman: {
    greet: {
      low: [
        { zh: '「手上活還沒收，要看的話自己看。」', en: '"Still working — look around if you must."' },
        { zh: '「{name}。手髒，不握手。」', en: '"{name}. Hands are dirty, no shaking."' },
      ],
      mid: [
        { zh: '「來啦。等我把這道收一收，再陪你聊。」', en: '"You came. Let me finish this run, then I am yours."' },
        { zh: '「最近這活有點難搞，潮鳴市的東西就是不講道理。」', en: '"This job has been stubborn — Tideway materials never play by the rules."' },
      ],
      high: [
        { zh: '「老兄！椅子在那邊，我邊做邊聊。」', en: '"Brother! Chair\'s there — I will work and talk."' },
        { zh: '「你來得剛好，我這把工具替你磨好了。」', en: '"Right on time — I sharpened this tool for you."' },
      ],
    },
    ask: {
      low: [
        { zh: '「我只懂手上的東西，城裡的事問別人。」', en: '"I only know what is in my hands — ask someone else about the city."' },
        { zh: '「那種事問{role}沒用啦。」', en: '"No point asking a {role} that."' },
      ],
      mid: [
        { zh: '「最近原料價變了，連桶釘子都比上週貴。」', en: '"Raw materials shifted — even nails cost more than last week."' },
        { zh: '「山那邊老師傅說脈網在抖，做我這行的最先感覺出來。」', en: '"The mountain elders say the vein-net trembles — folks like us feel it first."' },
      ],
      high: [
        { zh: '「跟你說一句——下次潮汐節，我手上會有一張磨過底的紋卡。」', en: '"Honest tip — at the next festival I will have a card with the grain re-cut."' },
        { zh: '「廢墟那邊有人在收舊工具，價開得高。我替你問了。」', en: '"Someone at the ruins is buying old tools at a high price. I asked for you."' },
      ],
    },
    trade: {
      low: [{ zh: '「目前沒有可交易的物品，活還沒做完。」', en: '"Nothing to trade right now — work is not done."' }],
      mid: [{ zh: '「目前沒有可交易的物品，但下一批做出來，先給你看。」', en: '"Nothing to trade right now — next batch, you see it first."' }],
      high: [{ zh: '「目前沒有可交易的物品，下次成品給你挑，老朋友價。」', en: '"Nothing to trade — next time, first pick at a friend\'s price."' }],
    },
    leave: {
      low: [{ zh: '「走吧，別擋光。」', en: '"Go on — you are blocking my light."' }],
      mid: [{ zh: '「腳步輕點，地板才剛刨。」', en: '"Step soft — that floor is freshly planed."' }],
      high: [{ zh: '「保重。風大時記得繫好東西。」', en: '"Take care — tie things down when the wind picks up."' }],
    },
  },

  // --- 神祕者／占卜／靈感者 -------------------------------------------
  mystic: {
    greet: {
      low: [
        { zh: '「你身上沒有名字。先報一個，再進來。」', en: '"You carry no name. Speak one before stepping in."' },
        { zh: '「{name}。你的影子比你早到一刻。」', en: '"{name}. Your shadow arrived a beat before you."' },
      ],
      mid: [
        { zh: '「又是你。今晚的潮聲剛好在你的方向。」', en: '"You again — the tide-song points your way tonight."' },
        { zh: '「坐。茶溫過了，紋卡的氣也壓住了。」', en: '"Sit. Tea is warmed, the card-aura is settled."' },
      ],
      high: [
        { zh: '「你來得對。星圖把第三格留給你。」', en: '"You come at the right time — the star chart held the third slot for you."' },
        { zh: '「進殿吧，鈴會自己響。」', en: '"Enter — the bell will ring of its own accord."' },
      ],
    },
    ask: {
      low: [
        { zh: '「答問之前先問自己。沒準備好就走。」', en: '"Question yourself before me. Leave if you are not ready."' },
        { zh: '「{name} 不為陌生人解卦。先讓我看清你的影子。」', en: '"{name} does not read for strangers. Let me see your shadow first."' },
      ],
      mid: [
        { zh: '「下個潮汐節的第三刻，潮聲會變短。記住這個。」', en: '"At the third tick of the next festival, the tide-song shortens. Remember this."' },
        { zh: '「煙嵐山的鈴與湖心的水，本就是一段對話。」', en: '"The bell of Yanlan and the water of the lake-heart speak as one conversation."' },
      ],
      high: [
        { zh: '「告訴你——脈網在你身後輕輕點了一下，你還沒察覺。」', en: '"Hear this — the vein-net touched you lightly. You have not noticed yet."' },
        { zh: '「下一張稀有紋卡的線索，會浮在湖心，你來接。」', en: '"The next rare card\'s clue will surface at the lake-heart. You take it."' },
      ],
    },
    trade: {
      low: [{ zh: '「氣與聲音不交易。目前沒有可交易的物品。」', en: '"Breath and sound are not for sale. Nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品。但我可以替你的卡點一盞燈。」', en: '"Nothing to trade — but I can light a lamp for one of your cards."' }],
      high: [{ zh: '「目前沒有可交易的物品。若湖心開口，第一句留給你。」', en: '"Nothing to trade — if the lake speaks, its first line is yours."' }],
    },
    leave: {
      low: [{ zh: '「走。腳印自己掃。」', en: '"Go. Sweep your own footprints."' }],
      mid: [{ zh: '「燈會替你閃一下。那是允許。」', en: '"The lamp will dim once — that is permission."' }],
      high: [{ zh: '「願湖心記得你的名。」', en: '"May the lake-heart remember your name."' }],
    },
  },

  // --- 邊緣人／走私／拾荒 ---------------------------------------------
  outsider: {
    greet: {
      low: [
        { zh: '「你是誰？這條巷我管。」', en: '"Who are you? This alley is mine."' },
        { zh: '「{name}。看你不像條子，但也不是自己人。」', en: '"{name}. You are no patrol — but not one of us either."' },
      ],
      mid: [
        { zh: '「又見面了。你最近在哪混？」', en: '"We meet again. Where have you been hanging?"' },
        { zh: '「來啦。先把口袋翻一下我看，再說話。」', en: '"You came. Pockets out where I can see — then we talk."' },
      ],
      high: [
        { zh: '「老朋友！後巷我替你留位子。」', en: '"My friend — back alley\'s saved for you."' },
        { zh: '「進來吧。這條街我替你壓著，沒人會盯。」', en: '"Come in. The street is on me — no one is watching."' },
      ],
    },
    ask: {
      low: [
        { zh: '「情報？這玩意兒不是免費的。」', en: '"Info? Never free, friend."' },
        { zh: '「打聽事情的人，不是條子就是要被條子問的。{name} 兩種都不愛。」', en: '"People who ask too much are either patrol — or about to meet patrol. {name} likes neither."' },
      ],
      mid: [
        { zh: '「碼頭那條巷子，深夜有人搬箱，貨色不太合法。」', en: '"That dock alley — somebody hauls crates after dark, and the goods are not clean."' },
        { zh: '「廢墟最近多了陌生臉孔，潮獵會在打主意。」', en: '"More strange faces at the ruins — the Tide-Hunters are circling."' },
      ],
      high: [
        { zh: '「跟你掏底——下批黑市卡會走西緣，不走中央。」', en: '"Bare honest — the next black-market batch goes the western edge, not central."' },
        { zh: '「有人在收編號被磨掉的稀有卡，價開到你不敢相信。」', en: '"Someone is buying rare cards with serials scraped off — prices you would not believe."' },
      ],
    },
    trade: {
      low: [{ zh: '「目前沒有可交易的物品。要不要先壓點東西？」', en: '"Nothing to trade right now — fancy putting something down?"' }],
      mid: [{ zh: '「目前沒有可交易的物品。下批貨進來我捎你。」', en: '"Nothing right now — I will tip you when the next batch lands."' }],
      high: [{ zh: '「目前沒有可交易的物品，但下批先讓你挑，老主顧價。」', en: '"Nothing yet — but next batch, first pick, regular\'s rate."' }],
    },
    leave: {
      low: [{ zh: '「走啊，別擋我風。」', en: '"Off you go — out of my draft."' }],
      mid: [{ zh: '「夜深，當心錢包跟性命，順序我不挑。」', en: '"Late hour — wallet and skin both. Order does not matter."' }],
      high: [{ zh: '「老朋友，潮聲替你開路，順道幫我望點風。」', en: '"Old friend — tide-song clears your way. Watch a corner for me on the way out."' }],
    },
  },

  // --- 表演者／嚮導／報童／孩子 ---------------------------------------
  entertainer: {
    greet: {
      low: [
        { zh: '「欸欸——這位客人要不要聽一段？只收一個銅板。」', en: '"Hey hey — care to hear a piece? Just one copper."' },
        { zh: '「{name}！剛剛唱完，喉嚨還熱。」', en: '"{name}! Just finished my set — throat still warm."' },
      ],
      mid: [
        { zh: '「老粉絲又來啦！這一首是新編的，你聽聽看。」', en: '"My loyal listener returns — try this one, freshly arranged."' },
        { zh: '「嘿，要我帶你去夜市嗎？我熟。」', en: '"Hey — want me to lead you to the night-market? I know the way."' },
      ],
      high: [
        { zh: '「自己人！下一段我獻給你，潮聲做和聲。」', en: '"Family! Next song is for you, tide-song on harmony."' },
        { zh: '「老朋友！我留了最後一首沒唱，等你坐下。」', en: '"My friend — I held my last song. Sit down first."' },
      ],
    },
    ask: {
      low: [
        { zh: '「這城裡的事？我都唱出來了，你沒聽見？」', en: '"City news? I sang it already — you missed it?"' },
        { zh: '「{name} 唱歌是免費的，但情報要打賞。」', en: '"{name}\'s songs are free — the gossip is on the tip jar."' },
      ],
      mid: [
        { zh: '「我昨晚唱完，看到夜市出現一張臉，誰都不敢盯。」', en: '"After my set last night, a face showed at the night-market — no one dared stare."' },
        { zh: '「捷運站那條街最近有人發傳單，講潮汐節要鎖卡。」', en: '"Someone hands flyers near the transit station — claims cards lock at the festival."' },
      ],
      high: [
        { zh: '「跟你講喔——我在台上看到一個老人偷偷遞東西，肯定是潮獵會的人。」', en: '"On stage I caught an old man passing something — Tide-Hunters for sure."' },
        { zh: '「下一段我要唱的就是廢墟那張會自動發光的卡，故事我得先講給你。」', en: '"My next song is about that glowing ruin card — let me tell you the tale first."' },
      ],
    },
    trade: {
      low: [{ zh: '「我這只賣歌——目前沒有可交易的物品。」', en: '"I only sell songs. Nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品，但下次表演完，我替你喊一段。」', en: '"Nothing to trade — next show, I will call out a piece for you."' }],
      high: [{ zh: '「目前沒有可交易的物品，但下首歌算你預訂的。」', en: '"Nothing to trade — but the next song is yours."' }],
    },
    leave: {
      low: [{ zh: '「掰掰啊，別忘了給打賞。」', en: '"Bye-bye — do not forget the tip jar."' }],
      mid: [{ zh: '「下回來夜市找我，我替你開場。」', en: '"Find me at the night-market — I will open for you."' }],
      high: [{ zh: '「保重啦，唱歌這事我會想你。」', en: '"Take care — I will sing missing you."' }],
    },
  },
}

const TOKEN_PATTERN = /\{(name|role)\}/g

function fillTemplate(template: string, ctx: Readonly<Record<'name' | 'role', string>>): string {
  return template.replace(TOKEN_PATTERN, (_, key: 'name' | 'role') => ctx[key])
}

function fillLine(line: LocalizedLine, ctxByLocale: Readonly<Record<NpcLocale, Record<'name' | 'role', string>>>): LocalizedLine {
  return {
    zh: fillTemplate(line.zh, ctxByLocale.zh),
    en: fillTemplate(line.en, ctxByLocale.en),
  }
}

export function buildDailyLifeDialogPack(
  profile: NpcProfile,
  archetype: DailyLifeArchetype
): DialogPack {
  const template = TEMPLATES[archetype]
  const ctx: Readonly<Record<NpcLocale, Record<'name' | 'role', string>>> = {
    zh: { name: profile.name.zh, role: profile.role.zh },
    en: { name: profile.name.en, role: profile.role.en },
  }
  const intents: InteractIntent[] = ['greet', 'ask', 'trade', 'leave']
  const tiers: RelationshipTier[] = ['low', 'mid', 'high']
  const built = {} as Record<InteractIntent, Record<RelationshipTier, LocalizedLine[]>>
  for (const intent of intents) {
    built[intent] = { low: [], mid: [], high: [] }
    for (const tier of tiers) {
      built[intent][tier] = template[intent][tier].map((line) => fillLine(line, ctx))
    }
  }
  return {
    greet: { low: built.greet.low, mid: built.greet.mid, high: built.greet.high },
    ask: { low: built.ask.low, mid: built.ask.mid, high: built.ask.high },
    trade: { low: built.trade.low, mid: built.trade.mid, high: built.trade.high },
    leave: { low: built.leave.low, mid: built.leave.mid, high: built.leave.high },
  }
}

export function readArchetypeFromProfile(profile: NpcProfile): DailyLifeArchetype | null {
  const raw = profile.personality.archetype
  return isDailyLifeArchetype(raw) ? raw : null
}

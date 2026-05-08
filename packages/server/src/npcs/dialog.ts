// NPC dialog library. Lines are bilingual (zh/en) and bucketed by
// (intent × relationship tier). The interaction API picks a line
// deterministically from (tick + Math.floor(relationshipScore))
// modulo the bucket size, so the same player+NPC at the same tick
// always sees the same response.
//
// Hard-coding chat lines inside React components is forbidden (the
// frontend reads what the server emits). Add new NPC voices here.

export type InteractIntent = 'greet' | 'ask' | 'trade' | 'leave'
export type RelationshipTier = 'low' | 'mid' | 'high'

export const INTERACT_INTENTS: readonly InteractIntent[] = [
  'greet',
  'ask',
  'trade',
  'leave',
]

export type LocalizedLine = Readonly<{ zh: string; en: string }>

type IntentLines = Readonly<Record<RelationshipTier, readonly LocalizedLine[]>>

export type DialogPack = Readonly<Record<InteractIntent, IntentLines>>

const FALLBACK: DialogPack = {
  greet: {
    low: [
      {
        zh: '「……來潮鳴市做什麼？我跟你不熟。」',
        en: '"...What brings you to Tideway? I do not know you."',
      },
      {
        zh: '「站在那別動。我看一眼你身上的紋。」',
        en: '"Stand still. Let me read the runes on you."',
      },
    ],
    mid: [
      {
        zh: '「又是你。風裡有點味道，最近不太平。」',
        en: '"You again. The wind smells off — restless days."',
      },
      {
        zh: '「來了就坐一下，潮聲聽完再走。」',
        en: '"Sit a while. Let the tide finish before you leave."',
      },
    ],
    high: [
      {
        zh: '「終於來了，潮鳴市這幾天的事我得跟你講。」',
        en: '"You finally came. There is news from Tideway I owe you."',
      },
      {
        zh: '「自己人。坐這。茶剛溫過，紋卡也還熱。」',
        en: '"Family. Sit here. Tea is warm, the rune cards still hot."',
      },
    ],
  },
  ask: {
    low: [
      {
        zh: '「情報？這城裡情報是要拿東西換的。」',
        en: '"Information? In this city, you trade for it."',
      },
      {
        zh: '「我為什麼要告訴你？走開點。」',
        en: '"Why would I tell you? Step back."',
      },
    ],
    mid: [
      {
        zh: '「最近脈網有點亂，紋卡價也在飄。你自己當心。」',
        en: '"The vein-net has been jittery and rune-card prices float. Watch yourself."',
      },
      {
        zh: '「夜市那條街，問阿鬼，他什麼都聽得見。」',
        en: '"On the night-market street, ask Old Gui — he hears everything."',
      },
    ],
    high: [
      {
        zh: '「告訴你一個小事——下回潮汐節，碼頭區那條巷會開窗口。」',
        en: '"A small tip — at the next tide festival, a window opens in that dock alley."',
      },
      {
        zh: '「煙嵐山的厲叔最近收了一個新弟子，傳言他帶了一張稀有紋卡上山。」',
        en: '"Uncle Li on Yanlan took on a new pupil. Rumour says they brought a rare card up."',
      },
    ],
  },
  trade: {
    low: [
      {
        zh: '「你想交易？東西呢？我可不做空殼買賣。」',
        en: '"You want to trade? Where are the goods? I do not deal in air."',
      },
      {
        zh: '「目前沒有可交易的物品。等你帶得出像樣的紋卡再來。」',
        en: '"Nothing to trade right now. Come back when you carry something worth showing."',
      },
    ],
    mid: [
      {
        zh: '「目前沒有可交易的物品，但我這裡有貨——下次帶卡來。」',
        en: '"Nothing to trade right now, though I have stock. Bring cards next time."',
      },
      {
        zh: '「交易系統的櫃檯還沒架起來，等紋卡交易所那邊開。」',
        en: '"The trade counter is not up yet — wait for the rune-card exchange to open."',
      },
    ],
    high: [
      {
        zh: '「目前沒有可交易的物品。不過你來，東西先賒著也行。」',
        en: '"Nothing to trade right now. For you though, I would extend credit when there is."',
      },
      {
        zh: '「等紋卡交易所開單，我替你留位子。」',
        en: '"When the exchange opens its book, I will hold a slot for you."',
      },
    ],
  },
  leave: {
    low: [
      { zh: '「……走吧。別礙事。」', en: '"...Go. Stop blocking my view."' },
      { zh: '「下次別這麼貿然來。」', en: '"Do not show up unannounced next time."' },
    ],
    mid: [
      { zh: '「路上小心，潮鳴市夜裡不太乾淨。」', en: '"Mind the streets. Tideway is not clean at night."' },
      { zh: '「下次來，記得帶點消息給我。」', en: '"Next time, bring me news worth hearing."' },
    ],
    high: [
      { zh: '「走吧，潮聲會替你領路。」', en: '"Go on. The tide-song will guide you."' },
      { zh: '「等你回來，茶我替你溫著。」', en: '"Come back. I will keep the tea warm."' },
    ],
  },
}

const PACKS: Readonly<Record<string, DialogPack>> = {
  // ---- New Tideway-世界觀 NPCs ----------------------------------------
  'port.concierge.an_qing_an': {
    greet: {
      low: [
        { zh: '「欸欸欸——新住戶？來來來，先把名字寫在門口的板子上。」', en: '"Oh hi hi! New tenant? Sign the lobby board first, please."' },
        { zh: '「我是這棟海風公寓的小安，需要鑰匙嗎？」', en: '"I am An, the concierge here at Seabreeze. Need a spare key?"' },
      ],
      mid: [
        { zh: '「咦，又看到你了。今天潮聲特別清楚耶。」', en: '"You again — the tide-song is unusually clear today."' },
        { zh: '「快進來坐，剛收到隔壁老太太烤的鳳梨酥。」', en: '"Come in, come in. Auntie next door just baked pineapple cakes."' },
      ],
      high: [
        { zh: '「自己人不用敲門啦！剛剛還在跟管委會說起你呢。」', en: '"Family does not knock! I was just telling the residents council about you."' },
        { zh: '「你來得正好，三樓那家又在傳脈網的怪聲音。」', en: '"Perfect timing — the third floor is hearing odd vein-net sounds again."' },
      ],
    },
    ask: {
      low: [
        { zh: '「最近？嗯……海邊冷氣團來了，毛巾要多備一條。」', en: '"Lately? Cold front off the sea — keep a spare towel handy."' },
        { zh: '「八卦的話我這個人不太敢亂講啦。」', en: '"Gossip? I really should not pass that around."' },
      ],
      mid: [
        { zh: '「我聽說交易所沈所長最近壓了一張稀有紋卡，可能跟潮汐節有關。」', en: '"I heard Director Shen is sitting on a rare card — might tie into the festival."' },
        { zh: '「碼頭那邊小江每天五點下水，你要找他就那個時間。」', en: '"Down at the docks, Jiang paddles out at five — that is when to catch him."' },
      ],
      high: [
        { zh: '「跟你講，潮獵會的連博哥昨晚進公寓找人，看起來不單純。」', en: '"Between us — Master Lien of the Tide-Hunters came by last night. It did not feel routine."' },
        { zh: '「白薇姊三天沒下塔了，潮語塔那邊一定有事。」', en: '"Bai Wei has not come down from the tower in three days. Something is happening up there."' },
      ],
    },
    trade: {
      low: [
        { zh: '「我這裡只有信件包裹啦——目前沒有可交易的物品喔。」', en: '"All I have is mail and packages — no goods to trade right now."' },
      ],
      mid: [
        { zh: '「目前沒有可交易的物品，但我可以幫你問問住戶有沒有出讓的紋卡。」', en: '"Nothing to trade right now, but I can ask if any tenants are willing to sell a card."' },
      ],
      high: [
        { zh: '「目前沒有可交易的物品啦——不過老顧客我先記著，下次有貨第一個通知你。」', en: '"Nothing right now — but for a regular like you, I will ring you first when stock arrives."' },
      ],
    },
    leave: {
      low: [{ zh: '「慢走慢走，走廊燈會自己關，不用擔心。」', en: '"Take care. The hallway lights time out on their own."' }],
      mid: [{ zh: '「下次來坐久一點啦，茶水間有檸檬水。」', en: '"Stay longer next time — there is lemon water in the pantry."' }],
      high: [{ zh: '「我會幫你看著信箱，潮聲也會替你帶路。」', en: '"I will keep an eye on your mailbox. The tide-song will see you home."' }],
    },
  },

  'central.exchange.shen_ruo_yun': {
    greet: {
      low: [
        { zh: '「先把卡放在櫃檯上。我從不跟空手的人聊天。」', en: '"Place your card on the counter. I do not converse with empty hands."' },
        { zh: '「報你的紋卡序號，我才會抬頭。」', en: '"State your card serial. Only then will I look up."' },
      ],
      mid: [
        { zh: '「又見面了。最近脈網波動偏大，你的卡若要估價，得排一下。」', en: '"We meet again. The vein-net is volatile — appraisals are queued."' },
        { zh: '「你的眼神比上次穩。坐下談。」', en: '"Your gaze is steadier than last time. Sit."' },
      ],
      high: [
        { zh: '「你來了。我為你留了一張比對用的樣本卡。」', en: '"You came. I have set aside a calibration card for you."' },
        { zh: '「不必通報，內室有空位。」', en: '"No announcement needed. The inner room is open for you."' },
      ],
    },
    ask: {
      low: [
        { zh: '「資訊有價，沒有交易，沒有資訊。」', en: '"Information has a price. No trade, no information."' },
      ],
      mid: [
        { zh: '「市場最近偏好水紋卡，潮汐節前後波幅最大。記得避開連博哥的人。」', en: '"The market favours water-runes near the festival. Avoid Master Lien\'s people."' },
        { zh: '「碼頭那位安管理員的耳朵，比我的卡冊還靈。」', en: '"Concierge An by the docks hears more than my ledgers record."' },
      ],
      high: [
        { zh: '「告訴你一件未公開的——潮汐節期間，A 階以上的紋卡會被臨時管制。」', en: '"Off the record — A-rank cards or higher will be restricted during the festival."' },
        { zh: '「煙嵐山下個月會放一張稀有卡進市場，你有第一輪參與權。」', en: '"Yanlan will release a rare card next cycle. You hold first-round access."' },
      ],
    },
    trade: {
      low: [{ zh: '「你的條件不夠。目前沒有可交易的物品。」', en: '"Your terms fall short. Nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品。等紋卡交易所重開撮合，名單我會給你。」', en: '"Nothing to trade right now. I will share the list when matching reopens."' }],
      high: [{ zh: '「目前沒有可交易的物品。但你先來，第一張稀有貨我替你留。」', en: '"Nothing right now. The first rare lot is yours."' }],
    },
    leave: {
      low: [{ zh: '「下次來，請帶數字。」', en: '"Next time, bring numbers."' }],
      mid: [{ zh: '「保持紋卡乾燥，潮鳴市夜裡有海霧。」', en: '"Keep your cards dry — sea fog rolls through Tideway at night."' }],
      high: [{ zh: '「我會替你守著市場的那一格。」', en: '"I will keep that slot in the market reserved for you."' }],
    },
  },

  'mountain.abbot.li_shu': {
    greet: {
      low: [
        { zh: '「煙嵐山不是觀光地。下山去。」', en: '"Yanlan is no tourist spot. Down the mountain."' },
        { zh: '「……哼。」', en: '"...Hmph."' },
      ],
      mid: [
        { zh: '「再來一次。腳步輕點，地有靈。」', en: '"Once more. Lighter steps — the ground listens."' },
        { zh: '「你還站著，沒被風吹下去，算你過了第一道。」', en: '"You still stand. The wind did not blow you off. That is one trial passed."' },
      ],
      high: [
        { zh: '「進殿。脫鞋。話留到坐下再說。」', en: '"Inside. Shoes off. Speak only after you sit."' },
        { zh: '「你來得遲了，但茶還在。」', en: '"You come late, but the tea is still warm."' },
      ],
    },
    ask: {
      low: [
        { zh: '「問道之前，先問自己。下山。」', en: '"Question yourself before you question me. Leave."' },
      ],
      mid: [
        { zh: '「潮鳴紀的脈，從山這頭走到海那頭。你只看到一段。」', en: '"The vein-net runs from mountain to sea. You only see one stretch."' },
        { zh: '「碼頭那邊近日多起空潮事件，根在山上，不在水裡。」', en: '"The recent empty-tides at the docks are rooted on the mountain, not in the water."' },
      ],
      high: [
        { zh: '「告訴你一句：紋卡不是力量，是約束。我教你的，永遠是約束。」', en: '"Hear this: rune cards are not power — they are restraint. That is what I teach."' },
        { zh: '「下次潮汐節，山頂會開一道短窗。我會等你。」', en: '"At the next tide festival, a brief window opens atop the mountain. I will wait."' },
      ],
    },
    trade: {
      low: [{ zh: '「煙嵐山不交易。下山。」', en: '"Yanlan does not trade. Leave."' }],
      mid: [{ zh: '「目前沒有可交易的物品。山中之物不入市。」', en: '"Nothing to trade. What the mountain holds does not enter the market."' }],
      high: [{ zh: '「目前沒有可交易的物品。若有，也只贈，不賣。」', en: '"Nothing to trade. Anything I had would be a gift, never sold."' }],
    },
    leave: {
      low: [{ zh: '「走。腳印自己掃。」', en: '"Go. Sweep your own footprints."' }],
      mid: [{ zh: '「下山時，左側那條岔路勿走。」', en: '"On your way down, do not take the left fork."' }],
      high: [{ zh: '「行。山會記得你今日來。」', en: '"Go. The mountain remembers this visit."' }],
    },
  },

  'central.broker.gui': {
    greet: {
      low: [
        { zh: '「喲——生面孔啊？看你臉，不像來吃宵夜的。」', en: '"Oh-ho, a new face? You do not look like the late-night-snack crowd."' },
        { zh: '「先把口袋翻給我看，再講話也不遲。」', en: '"Empty those pockets first — talk comes after."' },
      ],
      mid: [
        { zh: '「老朋友！這條街我罩你，但帳還是要算。」', en: '"My friend! This street is mine to watch — but the tab still runs."' },
        { zh: '「來來來，老地方，我留了張椅子給你。」', en: '"This way — usual spot, I saved you a chair."' },
      ],
      high: [
        { zh: '「老主顧到了！我這裡有一條剛上市的，先給你聽前三句。」', en: '"My patron arrives! Fresh intel — first three lines on the house."' },
        { zh: '「你來得真巧，今晚的潮聲比平常雜。」', en: '"Perfect timing — the tide-song is unusually noisy tonight."' },
      ],
    },
    ask: {
      low: [
        { zh: '「情報？這玩意兒不是免費的，朋友。先押點什麼。」', en: '"Info? Not free, friend — put something down first."' },
        { zh: '「你問這個，問題比答案還貴。」', en: '"That question is worth more than the answer."' },
      ],
      mid: [
        { zh: '「最近啊，碼頭那條巷子有人深夜搬箱，貨色不像合法的。」', en: '"Recently, somebody has been hauling crates down that dock alley after dark — the goods do not look legal."' },
        { zh: '「白薇上次下塔的時候，跟煙嵐山的厲叔講過悄悄話，這就有意思了吧？」', en: '"Last time Bai Wei left the tower, she whispered with Uncle Li of Yanlan. Interesting, right?"' },
      ],
      high: [
        { zh: '「跟你掏底的——潮獵會在挑下一個目標，名單上有交易所的人。」', en: '"Honest tip — the Tide-Hunters are picking their next target. The exchange is on the list."' },
        { zh: '「廢墟那邊三天前出現一張被磨掉編號的稀有卡，你猜誰拿走的？」', en: '"At the ruins, a rare card with the serial scraped off appeared three days ago. Guess who took it."' },
      ],
    },
    trade: {
      low: [{ zh: '「目前沒有可交易的物品啦——不過你身上若有，我可以開盤。」', en: '"Nothing in stock right now. Bring something though, and I will open a price."' }],
      mid: [{ zh: '「目前沒有可交易的物品。等夜市那批貨進來，我捎你一聲。」', en: '"Nothing right now. When the night-market shipment lands, I will tip you off."' }],
      high: [{ zh: '「目前沒有可交易的物品。等下批進來，先讓你挑，老主顧價。」', en: '"Nothing yet. Next batch — first pick, regular\'s price."' }],
    },
    leave: {
      low: [{ zh: '「走啊，別擋我桌子。」', en: '"Off you go — stop blocking my booth."' }],
      mid: [{ zh: '「夜市夜深，當心錢包跟性命，順序我不挑。」', en: '"Night-market hour. Mind your wallet and your skin — order does not matter."' }],
      high: [{ zh: '「老朋友，潮聲替你開路，順道幫我望點風。」', en: '"Old friend — tide-song clears your path. Watch a corner for me on the way out."' }],
    },
  },

  'dock.surfer.jiang_bo_ran': {
    greet: {
      low: [
        { zh: '「你這身打扮不像衝浪的——要租板還是看看？」', en: '"You do not look like a surfer — renting or just looking?"' },
        { zh: '「店長不在喔，我先幫你應對一下。」', en: '"Boss is out — I am covering the counter."' },
      ],
      mid: [
        { zh: '「欸是你！剛剛那道浪超級漂亮你看到沒？」', en: '"Hey, you! Did you catch that last set? Beautiful."' },
        { zh: '「下次帶你下水好不好？我教你看潮。」', en: '"Next time you come, paddle out with me — I will teach you to read the tide."' },
      ],
      high: [
        { zh: '「兄弟！我板子幫你蠟好了，海上見！」', en: '"Brother! Your board is waxed — see you out there!"' },
        { zh: '「你來得剛好，今天有六呎，要不要走？」', en: '"Right on time — six-foot today. Going out?"' },
      ],
    },
    ask: {
      low: [
        { zh: '「我？我只負責看浪啦，城裡的事我不太懂。」', en: '"Me? I just watch the waves — city stuff is over my head."' },
      ],
      mid: [
        { zh: '「潮鳴市這幾天浪高很怪，老師傅說脈網不太對勁。」', en: '"Wave heights have been weird — the old hands say the vein-net is off."' },
        { zh: '「碼頭最近多了幾個新面孔，看起來不是來衝浪的。」', en: '"Some new faces around the docks lately — definitely not here to surf."' },
      ],
      high: [
        { zh: '「我跟你講啦，深夜時分，西緣那邊潮語塔的燈會閃三長兩短，超怪。」', en: '"Late at night, the Tide-Tongue Tower flashes three-long-two-short. Super weird."' },
        { zh: '「上次潮汐節，我看到連博哥的人在離岸三百米打撈東西。」', en: '"Last festival, I saw Master Lien\'s crew dredging something three hundred meters off shore."' },
      ],
    },
    trade: {
      low: [{ zh: '「我這只賣板蠟跟泳褲啦，紋卡那種高級貨——目前沒有可交易的物品。」', en: '"I only sell wax and trunks. Rune cards — nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品啦，但下次出海撈到什麼好東西先給你看。」', en: '"Nothing to trade right now — but if I haul up anything cool, I will show you first."' }],
      high: [{ zh: '「目前沒有可交易的物品，不過你想要哪片浪我幫你預約一下？」', en: '"Nothing in stock — but I can hold a wave slot for you if you want."' }],
    },
    leave: {
      low: [{ zh: '「掰掰啊，下次想衝浪再來。」', en: '"Later — come back if you want to actually surf."' }],
      mid: [{ zh: '「路上小心，今天路面有點濕。」', en: '"Mind the wet pavement out there."' }],
      high: [{ zh: '「兄弟保重！明天五點海邊不見不散。」', en: '"Take care, brother! Five a.m. tomorrow — beach, no excuses."' }],
    },
  },

  'desert.keeper.bai_wei': {
    greet: {
      low: [
        { zh: '「……塔上的燈剛好往你那邊歪了一下。你知道為什麼嗎？」', en: '"...The tower lamp tilted toward you just now. Do you know why?"' },
        { zh: '「我在等一個聲音，不是你。」', en: '"I am waiting for a voice — not yours."' },
      ],
      mid: [
        { zh: '「又是你。風裡有你的名字。」', en: '"You again. The wind carries your name."' },
        { zh: '「上來吧，潮語塔今晚對你開窗。」', en: '"Come up. The tower opens its window for you tonight."' },
      ],
      high: [
        { zh: '「燈替你留了位置。坐下，我們聽潮。」', en: '"The lamp held your place. Sit — let us listen to the tide."' },
        { zh: '「你來得對。今晚的潮聲說你的名。」', en: '"You came at the right time. Tonight the tide-song says your name."' },
      ],
    },
    ask: {
      low: [{ zh: '「潮聲不是給人問的，它自己會說。」', en: '"The tide-song is not for asking — it speaks of its own accord."' }],
      mid: [
        { zh: '「下次潮汐節，潮聲會在第三刻變短。記住這個。」', en: '"At the next festival, the tide-song shortens at the third tick. Remember this."' },
        { zh: '「煙嵐山的鈴與這裡的燈，本是一對。」', en: '"The bell on Yanlan and this lamp were once a pair."' },
      ],
      high: [
        { zh: '「告訴你——脈網有一處正在乾涸，就在西緣以南。」', en: '"Hear this — the vein-net is drying somewhere south of the western edge."' },
        { zh: '「上一個聽得懂潮語的人，已經很久沒出現。我想，現在是你了。」', en: '"The last who could hear the tide-song has long been absent. I think it is you now."' },
      ],
    },
    trade: {
      low: [{ zh: '「光與聲音不能交易。目前沒有可交易的物品。」', en: '"Light and sound cannot be traded. Nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品。但我可以替你的紋卡點一盞燈。」', en: '"Nothing to trade. But I can light a lamp for one of your cards."' }],
      high: [{ zh: '「目前沒有可交易的物品。當潮聲再次開口，我會把第一句留給你。」', en: '"Nothing to trade. When the tide speaks again, the first line is yours."' }],
    },
    leave: {
      low: [{ zh: '「下塔小心。風大。」', en: '"Mind the descent. The wind is strong."' }],
      mid: [{ zh: '「燈會在你身後熄一下，再亮起。那是允許。」', en: '"The lamp will dim, then return. That is permission."' }],
      high: [{ zh: '「走吧，潮聲替你看路。」', en: '"Go. The tide-song watches your road."' }],
    },
  },

  'forest.guildmaster.lian_bo_wen': {
    greet: {
      low: [
        { zh: '「你不是潮獵會的人。請說明來意。」', en: '"You are not of the Tide-Hunter Guild. State your purpose."' },
        { zh: '「我在忙。簡短點。」', en: '"I am occupied. Be brief."' },
      ],
      mid: [
        { zh: '「久等了。我這邊剛收完一份名單。」', en: '"You waited — I just finished reviewing a list."' },
        { zh: '「請坐。茶不好但乾淨。」', en: '"Be seated. The tea is plain, but clean."' },
      ],
      high: [
        { zh: '「你終於肯來總部一趟。我有件事得親自交代。」', en: '"You finally came to headquarters. I owe you a matter in person."' },
        { zh: '「進來吧，門我替你關上。」', en: '"Come in. I will shut the door behind you."' },
      ],
    },
    ask: {
      low: [
        { zh: '「潮獵會的事不對外談。請見諒。」', en: '"Guild matters do not leave the lodge. My regrets."' },
      ],
      mid: [
        { zh: '「最近霓港區某些『生意』我們在留意。建議你晚上不要往鏽灣區走。」', en: '"We are watching certain businesses near Niport docks. Avoid Xiu-Wan after dark."' },
        { zh: '「沈所長那邊資訊比我多，但你得拿得起她的條件。」', en: '"Director Shen knows more than I — but her terms are not easy to meet."' },
      ],
      high: [
        { zh: '「一句話——潮獵會這次的目標，與紋卡黑市直接相關。我可以替你開一扇門。」', en: '"In one line — our current target ties directly to the black market for rune cards. I can open a door for you."' },
        { zh: '「下次潮汐節結束後，我會在夜潮區等你，名單上有你。」', en: '"After the next festival, I will await you in Ye-Chao — your name is on the list."' },
      ],
    },
    trade: {
      low: [{ zh: '「目前沒有可交易的物品。潮獵會不公開買賣。」', en: '"Nothing to trade. The Guild does not deal in the open."' }],
      mid: [{ zh: '「目前沒有可交易的物品。但若你有合適的卡，我可以代為估價。」', en: '"Nothing to trade now — if you carry a suitable card, I can have it appraised."' }],
      high: [{ zh: '「目前沒有可交易的物品。下一批潮獵會的徵召名額，我為你保留一個。」', en: '"Nothing to trade. I will reserve a slot in the next Guild call for you."' }],
    },
    leave: {
      low: [{ zh: '「請走前門。後門不對外開放。」', en: '"Use the front door. The back is closed to outsiders."' }],
      mid: [{ zh: '「路上小心。城裡近日不太平。」', en: '"Take care — the city is restive these days."' }],
      high: [{ zh: '「我送你到門口。潮獵會記得每一位朋友。」', en: '"I will see you to the door. The Guild remembers its friends."' }],
    },
  },

  // ---- Pre-existing NPCs (kept compatible, voiced for Tideway) ---------
  'port.merchant.anton': {
    greet: {
      low: [{ zh: '「外地客？這裡是潮鳴市，買賣有規矩。」', en: '"From out of town? Tideway has its own market rules."' }],
      mid: [{ zh: '「風行的腳步從來不只是船的事。要看貨嗎？」', en: '"Wind-walking is never just about ships. Care to see the wares?"' }],
      high: [{ zh: '「老主顧來了！後櫃今天有新進的東西。」', en: '"My regular! New stock just arrived in the back."' }],
    },
    ask: {
      low: [{ zh: '「碼頭最近多了一些奇怪的訂單，你不像會懂。」', en: '"Strange orders moving through the docks — you do not seem the type to understand."' }],
      mid: [{ zh: '「碼頭最近多了一些奇怪的訂單，你聽說了嗎？」', en: '"There have been odd orders coming through the docks lately. Heard about them?"' }],
      high: [{ zh: '「跟你說，下批貨直接從煙嵐山下來，不走交易所。」', en: '"Honest word — the next shipment comes straight off Yanlan, bypassing the exchange."' }],
    },
    trade: {
      low: [{ zh: '「目前沒有可交易的物品。沒貨，免談。」', en: '"Nothing to trade right now. No goods, no talk."' }],
      mid: [{ zh: '「目前沒有可交易的物品。等下一艘風行船入港。」', en: '"Nothing in right now — wait for the next wind-runner to dock."' }],
      high: [{ zh: '「目前沒有可交易的物品，但下批貨第一張紋卡是你的。」', en: '"Nothing in stock — but the first card from the next shipment is yours."' }],
    },
    leave: {
      low: [{ zh: '「走慢點，別撞到我的箱子。」', en: '"Step careful — do not knock my crates."' }],
      mid: [{ zh: '「下次帶點消息來。」', en: '"Bring news next time."' }],
      high: [{ zh: '「順風。風行船會替你帶路。」', en: '"Fair winds. The wind-runner will see you home."' }],
    },
  },

  'forest.hunter.lyra': {
    greet: {
      low: [{ zh: '「噓——別出聲。北方的鹿群今晚會走那條死路。」', en: '"Quiet — the northern deer take the dead trail tonight."' }],
      mid: [{ zh: '「你身上有森林沒見過的氣味。」', en: '"You carry a scent the forest does not recognise."' }],
      high: [{ zh: '「你來得正好，我剛掃出一條只有自己人知道的路。」', en: '"Right on time — I just scouted a trail only insiders know."' }],
    },
    ask: {
      low: [{ zh: '「林子裡的事，問林子去。」', en: '"Ask the forest itself."' }],
      mid: [{ zh: '「想跟我交易一張，還是兩張紋卡？」', en: '"Want to trade for one card — or two?"' }],
      high: [{ zh: '「告訴你——廢墟那條地下水道，連潮獵會都還沒摸清。」', en: '"Hear this — even the Tide-Hunters have not mapped that ruin aqueduct."' }],
    },
    trade: {
      low: [{ zh: '「目前沒有可交易的物品。回頭再說。」', en: '"Nothing to trade right now. Later."' }],
      mid: [{ zh: '「目前沒有可交易的物品。我這趟還沒回來。」', en: '"Nothing yet — I have not returned from this run."' }],
      high: [{ zh: '「目前沒有可交易的物品，但下次找到，第一張歸你。」', en: '"Nothing in hand — but the next find is yours."' }],
    },
    leave: {
      low: [{ zh: '「腳印自己抹掉。」', en: '"Erase your footprints yourself."' }],
      mid: [{ zh: '「林子會替我看著你。」', en: '"The forest will keep an eye on you for me."' }],
      high: [{ zh: '「走吧，鹿群替你開路。」', en: '"Go — the deer will lead you."' }],
    },
  },

  'temple.cleric.sela': {
    greet: {
      low: [{ zh: '「湖會選人。它選了你嗎？」', en: '"The lake chooses. Did it choose you?"' }],
      mid: [{ zh: '「你踏進來的時候，鈴自己響了一下。」', en: '"The bell rang on its own when you stepped in."' }],
      high: [{ zh: '「水替你開了一道路。請進。」', en: '"The water parted a way for you. Please enter."' }],
    },
    ask: {
      low: [{ zh: '「典開不是力量，是責任。記住這一點。」', en: '"Unsealing is not power. It is responsibility. Remember that."' }],
      mid: [{ zh: '「煙嵐山的鈴與潮語塔的燈本是一對，你會明白。」', en: '"The bell of Yanlan and the lamp of the Tide-Tongue were once paired — you will understand."' }],
      high: [{ zh: '「告訴你——下次潮汐節，湖心會浮起一張新的紋卡。」', en: '"Hear this — at the next festival, a new card will surface from the lake heart."' }],
    },
    trade: {
      low: [{ zh: '「神殿不交易。目前沒有可交易的物品。」', en: '"The temple does not trade. Nothing to trade right now."' }],
      mid: [{ zh: '「目前沒有可交易的物品。神殿之物不易主。」', en: '"Nothing to trade. Temple goods do not change hands."' }],
      high: [{ zh: '「目前沒有可交易的物品。若有，便是水的選擇，不是我的。」', en: '"Nothing to trade. If there were, it would be the water\'s choice, not mine."' }],
    },
    leave: {
      low: [{ zh: '「鈴會記得你。」', en: '"The bell will remember you."' }],
      mid: [{ zh: '「水會替你帶路。」', en: '"The water will guide you."' }],
      high: [{ zh: '「願湖心永遠記得你的名。」', en: '"May the lake heart hold your name forever."' }],
    },
  },
}

const EXTRA_PACKS = new Map<string, DialogPack>()

/**
 * Extend the in-memory dialog registry. Used at boot by the NPC
 * loader to register archetype-derived packs for the daily-life NPC
 * set. Explicit packs in `PACKS` take precedence over registered
 * extras so the hand-written named NPCs cannot be silently overwritten
 * by an archetype generator.
 */
export function registerDialogPack(npcId: string, pack: DialogPack): void {
  EXTRA_PACKS.set(npcId, pack)
}

export function getDialogPack(npcId: string): DialogPack {
  return PACKS[npcId] ?? EXTRA_PACKS.get(npcId) ?? FALLBACK
}

export function tierForRelationship(relationshipScore: number): RelationshipTier {
  if (relationshipScore >= 60) return 'high'
  if (relationshipScore >= 30) return 'mid'
  return 'low'
}

export function pickLine(
  npcId: string,
  intent: InteractIntent,
  tier: RelationshipTier,
  rotationSeed: number
): LocalizedLine {
  const pack = getDialogPack(npcId)
  const lines = pack[intent][tier]
  const fallbackLines = pack[intent].mid.length > 0 ? pack[intent].mid : FALLBACK[intent].mid
  const pool = lines.length > 0 ? lines : fallbackLines
  const safeSeed = Number.isFinite(rotationSeed) ? Math.floor(rotationSeed) : 0
  const idx = ((safeSeed % pool.length) + pool.length) % pool.length
  return pool[idx]!
}

export function isInteractIntent(value: unknown): value is InteractIntent {
  return (
    typeof value === 'string' &&
    (INTERACT_INTENTS as readonly string[]).includes(value)
  )
}

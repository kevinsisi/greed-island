import type { Locale } from '../i18n'
import type { MapTile } from './types'

interface LoreEntry {
  glyph: string
  scene: { zh: string; en: string }
  whisper: { zh: string; en: string }
}

const FALLBACK: LoreEntry = {
  glyph: '◇',
  scene: {
    zh: '一處潮鳴市的尚未命名之地。風從各個方向吹來，帶著海與石的氣味。',
    en: 'An unnamed corner of Tideway. The wind comes from every direction, smelling of salt and stone.'
  },
  whisper: {
    zh: '此處尚無故事。',
    en: 'No stories logged here yet.'
  }
}

// 潮鳴市八方街區。Tile IDs are kept stable (t_dock, t_central, ...) for
// server compatibility even though the displayed district names changed
// in the Tideway rebrand. `t_dimai` (地脈層) is the only new tile.
const LORE: Record<string, LoreEntry> = {
  t_desert: {
    glyph: '▦',
    scene: {
      zh: '潮聲區。灰色老公寓貼著海風的鹽分。鐵門鏽斑、晾衣繩、收音機裡舊年代的潮汐預報——這裡的時間比城裡慢了一拍。',
      en: 'Chao-Sheng District. Gray walk-ups stained by sea salt: rusted gates, sagging laundry lines, old radios still reading last year’s tide forecasts. Time runs a beat slower here.'
    },
    whisper: {
      zh: '走私販凱德常從這裡的後巷出發。',
      en: 'Kade the smuggler is often seen slipping out of these back lanes.'
    }
  },
  t_forest: {
    glyph: '♣',
    scene: {
      zh: '潮見丘。綠樹掩映的住宅階梯，從丘頂可以看見整片潮鳴市。占卜師米拉的星圖小屋就在第三層的轉角。',
      en: 'Tideview Heights. Green stairs of low-rise houses; from the top you can see all of Tideway. Mira’s star-chart cottage sits on the third terrace bend.'
    },
    whisper: {
      zh: '據說從丘頂望下去，能看見哪一條街道今晚會出事。',
      en: 'They say from the crest, you can tell which street tonight’s trouble will land on.'
    }
  },
  t_mountain: {
    glyph: '▲',
    scene: {
      zh: '煙嵐山。深綠色的山林永遠纏著薄霧，獵人萊拉熟悉每一條鹿徑，也知道哪些地方不可以再往裡走。',
      en: 'Yan-Lan Range. Dark-green forests ringed in mist; Lyra the hunter knows every deer trail — and which ones not to push past.'
    },
    whisper: {
      zh: '深處傳說有一張會自己選主人的紋卡。',
      en: 'Deeper in, a rune card is said to choose its own owner.'
    }
  },
  t_temple: {
    glyph: '◈',
    scene: {
      zh: '霓港區。藍色玻璃帷幕大樓沿岸聳立。夜裡電子招牌與貨櫃燈把港口照得像一張高解析度的星圖。商人安東在這裡盤點他的契紙。',
      en: 'Niport District. Blue glass towers run along the docks. At night, neon signs and container lamps render the harbor like a high-res star chart. Anton the merchant tallies his contracts here.'
    },
    whisper: {
      zh: '潮汐節的窗口最先在這片海岸打開。',
      en: 'The tide festival’s first window always opens along this shore.'
    }
  },
  t_central: {
    glyph: '✦',
    scene: {
      zh: '夜潮區。紅色霓虹從中下街區一路漫到主幹道。傭兵團長奧林的據點在背街第三家，門口永遠亮著一盞發黃的招牌。',
      en: 'Ye-Chao District. Red neon spills from the inner blocks all the way out to the main road. Orin’s mercenary outpost is the third doorway down a side alley, its yellow sign always lit.'
    },
    whisper: {
      zh: '六十秒法則據傳是在這裡的賭桌上被反覆驗證的。',
      en: 'The sixty-second rule, they say, was hammered out at the gambling tables here.'
    }
  },
  t_ruin: {
    glyph: '✧',
    scene: {
      zh: '鏽灣區。棕色廢墟之間，斷掉的起重機與半淹的貨櫃。廢場領班波爾在斷柱間做生意，空氣裡有乾燥的鐵鏽味。',
      en: 'Xiu-Wan District. Broken cranes and half-submerged containers among brown rubble. Foreman Borr brokers deals between toppled columns; the air carries dry rust.'
    },
    whisper: {
      zh: '所有被禁的紋卡，最後都會回到這裡。',
      en: 'Every forbidden rune card eventually finds its way back here.'
    }
  },
  t_dock: {
    glyph: '⌇',
    scene: {
      zh: '浪花區。淺藍色的海灘和退潮後的礁石。詩人優娜常坐在木棧道的盡頭，把潮聲寫成短歌。',
      en: 'Lang-Hua District. Pale-blue beaches and reefs at low tide. Yuna the bard often sits at the end of the boardwalk, turning the surf into short songs.'
    },
    whisper: {
      zh: '據說每一張關於航行的紋卡都曾在這片海邊被典開過。',
      en: 'Every rune card about voyaging is said to have first been unsealed by this shoreline.'
    }
  },
  t_dimai: {
    glyph: '✶',
    scene: {
      zh: '地脈層。潮鳴市中央地底的入口，紫色光從石縫間透出。祭司瑟拉守在第一層的拱門前，水滴聲是這裡唯一的時鐘。',
      en: 'The Ley-Strata. Beneath the heart of Tideway, violet light seeps through the stones. Cleric Sela keeps watch at the first archway; dripping water is the only clock here.'
    },
    whisper: {
      zh: '神殿的鈴只為被地脈選中的人響起。',
      en: 'The shrine bell rings only for those the ley-line chooses.'
    }
  }
}

const BIOME_LABEL_ZH: Record<MapTile['biome'], string> = {
  grass: '街心',
  forest: '丘陵',
  mountain: '山林',
  desert: '老街',
  water: '臨海',
  ruin: '廢墟'
}

const BIOME_LABEL_EN: Record<MapTile['biome'], string> = {
  grass: 'inner city',
  forest: 'hillside',
  mountain: 'highlands',
  desert: 'old quarter',
  water: 'coastal',
  ruin: 'ruin'
}

export function loreFor(tileId: string): LoreEntry {
  return LORE[tileId] ?? FALLBACK
}

export function biomeLabel(biome: MapTile['biome'], locale: Locale): string {
  return locale === 'zh' ? BIOME_LABEL_ZH[biome] : BIOME_LABEL_EN[biome]
}

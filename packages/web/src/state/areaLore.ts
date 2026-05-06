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

const LORE: Record<string, LoreEntry> = {
  t_dock: {
    glyph: '⚓',
    scene: {
      zh: '碼頭區。木板被海鹽蝕得發白，鐵環叮叮作響。商人和水手在這裡交換消息，潮汐節的窗口會率先在此地開啟。',
      en: 'The dockside. Bleached planks creak underfoot and rusty rings clatter. Merchants and sailors trade rumours here, and the tide festival opens its first window over these waters.'
    },
    whisper: {
      zh: '據說每一張關於航行的紋卡都曾在這裡被典開過。',
      en: 'Every rune card about voyaging is said to have first been unsealed here.'
    }
  },
  t_central: {
    glyph: '◈',
    scene: {
      zh: '中央城。潮鳴市的心臟。公會大廳的巨鐘掛在主廣場上方，永遠以六十秒為單位敲擊一聲。',
      en: 'The central city, the heart of Tideway. The guild bell hangs above the main square, striking once every sixty seconds without fail.'
    },
    whisper: {
      zh: '六十秒法則據傳是從這口鐘開始流傳的。',
      en: 'The sixty-second rule is said to have begun with this very bell.'
    }
  },
  t_temple: {
    glyph: '✶',
    scene: {
      zh: '湖心神殿。湖面如鏡，神殿的倒影比實體更清晰。潮感者會在此進行典開的儀式。',
      en: 'The lake-heart shrine. The water is glass-still and the shrine reflects sharper than it stands. Tide-readers perform unsealing rites here.'
    },
    whisper: {
      zh: '神殿的鈴只為被湖選中的人響起。',
      en: 'The shrine bell rings only for those the lake chooses.'
    }
  },
  t_forest: {
    glyph: '♣',
    scene: {
      zh: '北方森林。樹冠濃密如夜，鳥鳴極少。獵人們知道這裡的每一條鹿徑，也知道哪些路不可走。',
      en: 'The northern forest. Canopies thick as night, almost no birdsong. Hunters know every deer trail here — and which trails should never be taken.'
    },
    whisper: {
      zh: '深處傳說有一張會自己選主人的紋卡。',
      en: 'Deeper in, a rune card is said to choose its own owner.'
    }
  },
  t_ruin: {
    glyph: '✦',
    scene: {
      zh: '南方廢墟。崩塌的城牆下，走私販在斷柱間做生意。空氣帶著乾燥的鐵鏽味。',
      en: 'The southern ruins. Smugglers strike bargains between toppled columns; the air tastes of dry rust.'
    },
    whisper: {
      zh: '所有被禁的紋卡，最後都會回到這裡。',
      en: 'Every forbidden rune card eventually finds its way back here.'
    }
  },
  t_mountain: {
    glyph: '▲',
    scene: {
      zh: '東方山脈。礦坑深入岩層，叮鏘聲穿過冷霧。礦工說這裡聽得見潮鳴市真正的脈搏。',
      en: 'The eastern range. Mines bore deep into the rock; hammer-strikes ring through cold mist. Miners say you can hear Tideway’s real heartbeat down there.'
    },
    whisper: {
      zh: '據說定序欄的概念是從礦坑挖掘的節奏裡誕生的。',
      en: 'The very idea of sequencing slots, they say, was born from the rhythm of the mines.'
    }
  },
  t_desert: {
    glyph: '◬',
    scene: {
      zh: '西緣荒地。風沙永遠朝同一個方向吹。占卜師在這裡擺出星圖，等一個從沙裡走出來的旅人。',
      en: 'The western badlands. The wind always blows the same way. A diviner lays out a star chart and waits for a traveler to emerge from the sand.'
    },
    whisper: {
      zh: '此處沒有夜晚，只有更深的黃。',
      en: 'There is no night here — only a deeper shade of ochre.'
    }
  }
}

const BIOME_LABEL_ZH: Record<MapTile['biome'], string> = {
  grass: '草原',
  forest: '森林',
  mountain: '山脈',
  desert: '荒地',
  water: '水域',
  ruin: '廢墟'
}

const BIOME_LABEL_EN: Record<MapTile['biome'], string> = {
  grass: 'grassland',
  forest: 'forest',
  mountain: 'mountain',
  desert: 'badlands',
  water: 'water',
  ruin: 'ruin'
}

export function loreFor(tileId: string): LoreEntry {
  return LORE[tileId] ?? FALLBACK
}

export function biomeLabel(biome: MapTile['biome'], locale: Locale): string {
  return locale === 'zh' ? BIOME_LABEL_ZH[biome] : BIOME_LABEL_EN[biome]
}

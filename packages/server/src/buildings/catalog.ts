// Building catalog — 每個 tile 至少 2 棟可互動建築。numbers 是 area
// scene (15x10) cell 座標，跟前端 web/src/game/decorations.ts 對齊。

import type { BuildingDef, InteriorLayout } from './types.js'

function smallHomeInterior(): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '🛋', label: '沙發' },
      { col: 3, row: 1, glyph: '🪟', label: '窗戶' },
      { col: 6, row: 1, glyph: '📺', label: '電視' },
      { col: 8, row: 1, glyph: '🛏', label: '床' },
      { col: 1, row: 4, glyph: '🪴', label: '盆栽' },
      { col: 4, row: 4, glyph: '🍵', label: '茶几' },
      { col: 8, row: 4, glyph: '🪜', label: '樓梯' }
    ]
  }
}

function shopInterior(label: string): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '📦', label: '貨架' },
      { col: 3, row: 1, glyph: '📦', label: '貨架' },
      { col: 5, row: 1, glyph: '📦', label: '貨架' },
      { col: 7, row: 1, glyph: '📦', label: '貨架' },
      { col: 1, row: 3, glyph: '📦' },
      { col: 3, row: 3, glyph: '📦' },
      { col: 6, row: 3, glyph: '📦' },
      { col: 8, row: 4, glyph: '🪙', label: '收銀台' },
      { col: 4, row: 4, glyph: '🛒', label }
    ]
  }
}

function restaurantInterior(label: string): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '🍳', label: '廚房' },
      { col: 3, row: 1, glyph: '🥘', label },
      { col: 5, row: 1, glyph: '🔥' },
      { col: 7, row: 1, glyph: '🍵' },
      { col: 1, row: 3, glyph: '🪑' },
      { col: 3, row: 3, glyph: '🪑' },
      { col: 5, row: 3, glyph: '🪑' },
      { col: 7, row: 3, glyph: '🪑' },
      { col: 9, row: 4, glyph: '🪙', label: '收銀' }
    ]
  }
}

function officeInterior(): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '🖥', label: '工作站' },
      { col: 3, row: 1, glyph: '🖥' },
      { col: 5, row: 1, glyph: '🖥' },
      { col: 7, row: 1, glyph: '📋' },
      { col: 9, row: 1, glyph: '🗂' },
      { col: 1, row: 3, glyph: '🪑' },
      { col: 3, row: 3, glyph: '🪑' },
      { col: 5, row: 3, glyph: '🪑' },
      { col: 7, row: 3, glyph: '🪑' },
      { col: 4, row: 4, glyph: '☕' }
    ]
  }
}

function factoryInterior(): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '⚙', label: '齒輪組' },
      { col: 3, row: 1, glyph: '🔥' },
      { col: 5, row: 1, glyph: '🔨', label: '工作台' },
      { col: 7, row: 1, glyph: '📦' },
      { col: 9, row: 1, glyph: '📦' },
      { col: 1, row: 4, glyph: '🛠' },
      { col: 4, row: 4, glyph: '🪛' },
      { col: 7, row: 4, glyph: '⚒' }
    ]
  }
}

function libraryInterior(): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '📚', label: '書架' },
      { col: 3, row: 1, glyph: '📚' },
      { col: 5, row: 1, glyph: '📚' },
      { col: 7, row: 1, glyph: '📚' },
      { col: 9, row: 1, glyph: '📚' },
      { col: 2, row: 3, glyph: '🪑' },
      { col: 5, row: 3, glyph: '📖', label: '閱覽桌' },
      { col: 8, row: 3, glyph: '🪑' },
      { col: 4, row: 4, glyph: '🕯' },
      { col: 6, row: 4, glyph: '🕯' }
    ]
  }
}

function exchangeInterior(): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 1, row: 1, glyph: '🪙', label: '櫃台' },
      { col: 3, row: 1, glyph: '🪙' },
      { col: 5, row: 1, glyph: '🪙' },
      { col: 7, row: 1, glyph: '🪙' },
      { col: 9, row: 1, glyph: '🛡', label: '保險箱' },
      { col: 2, row: 3, glyph: '📃' },
      { col: 5, row: 3, glyph: '📃' },
      { col: 8, row: 3, glyph: '📃' },
      { col: 4, row: 4, glyph: '✦', label: '紋卡展示' },
      { col: 6, row: 4, glyph: '✧' }
    ]
  }
}

function templeInterior(): InteriorLayout {
  return {
    cols: 10,
    rows: 6,
    props: [
      { col: 4, row: 1, glyph: '🛕', label: '神龕' },
      { col: 6, row: 1, glyph: '⛩' },
      { col: 1, row: 3, glyph: '🪔' },
      { col: 9, row: 3, glyph: '🪔' },
      { col: 4, row: 4, glyph: '🕯' },
      { col: 6, row: 4, glyph: '🕯' }
    ]
  }
}

const ALL_BUILDINGS: BuildingDef[] = [
  // ── t_forest 潮見丘
  {
    id: 'b_forest_house',
    tileId: 't_forest',
    nameZh: '丘上小屋',
    nameEn: 'Hilltop Cottage',
    descriptionZh: '一棟綠樹掩映的住家，木門上刻著潮符。占卜師米拉常在這裡看星圖。',
    type: 'residential',
    placement: { col: 1, row: 3, glyph: '🏠', size: 22 },
    interior: smallHomeInterior(),
    ownerNpcId: null,
    hiring: [],
    enterable: true,
    restorative: true
  },
  {
    id: 'b_forest_lookout',
    tileId: 't_forest',
    nameZh: '丘頂瞭望台',
    nameEn: 'Hillcrest Lookout',
    descriptionZh: '從這裡能俯瞰整個潮鳴市，據說能看出今晚哪條街要出事。',
    type: 'landmark',
    placement: { col: 13, row: 3, glyph: '🏠', size: 22 },
    interior: { cols: 8, rows: 5, props: [
      { col: 3, row: 1, glyph: '🔭', label: '望遠鏡' },
      { col: 5, row: 2, glyph: '🗺', label: '潮鳴市地圖' }
    ] },
    ownerNpcId: null,
    hiring: [],
    enterable: true,
    restorative: false
  },
  // ── t_mountain 煙嵐山
  {
    id: 'b_mountain_lodge',
    tileId: 't_mountain',
    nameZh: '山中道場',
    nameEn: 'Mountain Dojo',
    descriptionZh: '霧氣纏繞的木造道場，厲叔（山中僧）在這裡帶徒弟練氣。',
    type: 'temple',
    placement: { col: 4, row: 1, glyph: '🏔', size: 24 },
    interior: templeInterior(),
    ownerNpcId: 'mountain.abbot.li_shu',
    hiring: [
      { shift: 'morning', capacity: 2, wage: 12, taskZh: '清掃道場、打掃禪院' }
    ],
    enterable: true,
    restorative: true
  },
  // ── t_temple 霓港區
  {
    id: 'b_temple_shrine',
    tileId: 't_temple',
    nameZh: '霓港神社',
    nameEn: 'Niport Shrine',
    descriptionZh: '藍色玻璃帷幕大樓間的神社，潮汐節的窗口最先在這片海岸打開。',
    type: 'temple',
    placement: { col: 2, row: 0, glyph: '⛩', size: 24 },
    interior: templeInterior(),
    ownerNpcId: null,
    hiring: [],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_temple_apartment',
    tileId: 't_temple',
    nameZh: '海風公寓',
    nameEn: 'Seabreeze Apartments',
    descriptionZh: '你住的公寓樓。管理員小安總是站在大廳裡跟人寒暄。',
    type: 'residential',
    placement: { col: 9, row: 3, glyph: '🏠', size: 22 },
    interior: smallHomeInterior(),
    ownerNpcId: 'port.concierge.an_qing_an',
    hiring: [],
    enterable: true,
    restorative: true
  },
  {
    id: 'b_temple_pier_cafe',
    tileId: 't_temple',
    nameZh: '港邊咖啡店',
    nameEn: 'Pierside Café',
    descriptionZh: '木地板與藍色座椅，鄭婉婷（店長）今晚開放免費奶茶給「身上有故事」的客人。',
    type: 'restaurant',
    placement: { col: 5, row: 3, glyph: '🏪', size: 22 },
    interior: restaurantInterior('奶茶'),
    ownerNpcId: null,
    hiring: [
      { shift: 'morning', capacity: 2, wage: 10, taskZh: '招呼客人、泡奶茶' },
      { shift: 'night', capacity: 2, wage: 14, taskZh: '夜班吧台、收店面' }
    ],
    enterable: true,
    restorative: false
  },
  // ── t_dimai 地脈層
  {
    id: 'b_dimai_archway',
    tileId: 't_dimai',
    nameZh: '地脈拱門',
    nameEn: 'Ley-Strata Archway',
    descriptionZh: '紫色光從石縫間透出，水滴聲是這裡唯一的時鐘。神殿守護者元若言守在第一層拱門前。',
    type: 'temple',
    placement: { col: 7, row: 0, glyph: '◈', size: 28 },
    interior: templeInterior(),
    ownerNpcId: null,
    hiring: [],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_dimai_archive',
    tileId: 't_dimai',
    nameZh: '潮語塔',
    nameEn: 'Tide-Tongue Tower',
    descriptionZh: '白薇姊在這裡解析地脈訊號，三天沒下塔的傳聞每月都有一次。',
    type: 'library',
    placement: { col: 12, row: 1, glyph: '✧', size: 28 },
    interior: libraryInterior(),
    ownerNpcId: 'desert.keeper.bai_wei',
    hiring: [
      { shift: 'afternoon', capacity: 1, wage: 18, taskZh: '抄寫脈網文獻' }
    ],
    enterable: true,
    restorative: false
  },
  // ── t_desert 潮聲區
  {
    id: 'b_desert_walkup',
    tileId: 't_desert',
    nameZh: '潮聲老公寓',
    nameEn: 'Chao-Sheng Walk-up',
    descriptionZh: '鐵門鏽斑、晾衣繩、舊收音機。時間在這裡比城裡慢一拍。',
    type: 'residential',
    placement: { col: 2, row: 3, glyph: '🏚', size: 22 },
    interior: smallHomeInterior(),
    ownerNpcId: null,
    hiring: [],
    enterable: true,
    restorative: true
  },
  {
    id: 'b_desert_workshop',
    tileId: 't_desert',
    nameZh: '潮聲鐵工坊',
    nameEn: 'Chao-Sheng Forge',
    descriptionZh: '走私販凱德常在這裡的後巷出貨。爐火終年不熄。',
    type: 'factory',
    placement: { col: 9, row: 3, glyph: '🏚', size: 22 },
    interior: factoryInterior(),
    ownerNpcId: null,
    hiring: [
      { shift: 'morning', capacity: 2, wage: 16, taskZh: '搬貨、上料' },
      { shift: 'afternoon', capacity: 2, wage: 16, taskZh: '熔爐看火' }
    ],
    enterable: true,
    restorative: false
  },
  // ── t_central 夜潮區
  {
    id: 'b_central_grocer',
    tileId: 't_central',
    nameZh: '林家雜貨店',
    nameEn: 'Lin Family Grocer',
    descriptionZh: '林菲煙的雜貨店，街口貼出黃紙：今夜八折。',
    type: 'shop',
    placement: { col: 4, row: 1, glyph: '🏪', size: 22 },
    interior: shopInterior('日用品'),
    ownerNpcId: 'central.grocer.lin_fei_yan',
    hiring: [
      { shift: 'morning', capacity: 1, wage: 10, taskZh: '招呼客人、補貨' },
      { shift: 'afternoon', capacity: 1, wage: 10, taskZh: '清點存貨' }
    ],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_central_exchange',
    tileId: 't_central',
    nameZh: '紋卡交易所',
    nameEn: 'Rune Exchange',
    descriptionZh: '沈所長親自坐鎮的紋卡交易所，A 階以上必須登記發行人。',
    type: 'exchange',
    placement: { col: 9, row: 8, glyph: '🏪', size: 22 },
    interior: exchangeInterior(),
    ownerNpcId: 'central.exchange.shen_ruo_yun',
    hiring: [
      { shift: 'morning', capacity: 1, wage: 22, taskZh: '紋卡鑑定書記' },
      { shift: 'afternoon', capacity: 1, wage: 22, taskZh: '櫃台收件' }
    ],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_central_night_market_stall',
    tileId: 't_central',
    nameZh: '夜市滷味攤',
    nameEn: 'Night-Market Braising Stall',
    descriptionZh: '阿鬼的地盤，一鍋老滷與情報交換中心。「身上有故事」就能蹭一塊豆乾。',
    type: 'restaurant',
    placement: { col: 4, row: 8, glyph: '🪧', size: 20 },
    interior: restaurantInterior('滷味'),
    ownerNpcId: 'central.broker.gui',
    hiring: [
      { shift: 'night', capacity: 2, wage: 14, taskZh: '夜市備料、跑單' }
    ],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_central_guildhall',
    tileId: 't_central',
    nameZh: '公會大廳',
    nameEn: 'Guild Hall',
    descriptionZh: '紋卡公會的中央據點。新規律每月貼一次，門口常有抗議靜坐。',
    type: 'office',
    placement: { col: 1, row: 8, glyph: '🏠', size: 22 },
    interior: officeInterior(),
    ownerNpcId: 'forest.guildmaster.lian_bo_wen',
    hiring: [
      { shift: 'morning', capacity: 2, wage: 18, taskZh: '公會檔案歸檔' }
    ],
    enterable: true,
    restorative: false
  },
  // ── t_ruin 鏽灣區
  {
    id: 'b_ruin_archive',
    tileId: 't_ruin',
    nameZh: '廢墟資料室',
    nameEn: 'Ruin Archive',
    descriptionZh: '卓敏在這裡免費鑑定一張舊卡的傳言，廢墟入口排起二十人長隊。',
    type: 'library',
    placement: { col: 7, row: 3, glyph: '🏚', size: 22 },
    interior: libraryInterior(),
    ownerNpcId: null,
    hiring: [
      { shift: 'afternoon', capacity: 1, wage: 16, taskZh: '舊卡編目' }
    ],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_ruin_blacksmith',
    tileId: 't_ruin',
    nameZh: '鏽灣鍛場',
    nameEn: 'Rust-Bay Forge',
    descriptionZh: '波爾的廢場領班據點，半淹的貨櫃旁有一座斷續燒著的爐子。',
    type: 'factory',
    placement: { col: 1, row: 8, glyph: '🏚', size: 22 },
    interior: factoryInterior(),
    ownerNpcId: null,
    hiring: [
      { shift: 'morning', capacity: 1, wage: 18, taskZh: '撿料、整理廢鐵' }
    ],
    enterable: true,
    restorative: false
  },
  // ── t_dock 碼頭區
  {
    id: 'b_dock_pier',
    tileId: 't_dock',
    nameZh: '浪花棧橋',
    nameEn: 'Dockside Pier',
    descriptionZh: '退潮後的礁石和木棧道。詩人優娜常坐在棧道盡頭把潮聲寫成短歌。',
    type: 'landmark',
    placement: { col: 2, row: 3, glyph: '⚓', size: 22 },
    interior: { cols: 8, rows: 5, props: [
      { col: 1, row: 1, glyph: '🪑' },
      { col: 4, row: 1, glyph: '🐚' },
      { col: 6, row: 2, glyph: '🪝' },
      { col: 3, row: 3, glyph: '⛵' }
    ] },
    ownerNpcId: 'dock.surfer.jiang_bo_ran',
    hiring: [],
    enterable: true,
    restorative: false
  },
  {
    id: 'b_dock_warehouse',
    tileId: 't_dock',
    nameZh: '碼頭倉庫',
    nameEn: 'Dock Warehouse',
    descriptionZh: '一整排被海風磨白的倉庫。跳電那晚一整條商業街黑掉，只有這裡的招牌還亮著。',
    type: 'factory',
    placement: { col: 12, row: 3, glyph: '🪝', size: 22 },
    interior: factoryInterior(),
    ownerNpcId: null,
    hiring: [
      { shift: 'morning', capacity: 3, wage: 12, taskZh: '搬貨上船' },
      { shift: 'afternoon', capacity: 3, wage: 12, taskZh: '整理貨櫃' }
    ],
    enterable: true,
    restorative: false
  }
]

const BUILDINGS_BY_TILE: Map<string, BuildingDef[]> = (() => {
  const map = new Map<string, BuildingDef[]>()
  for (const b of ALL_BUILDINGS) {
    const arr = map.get(b.tileId) ?? []
    arr.push(b)
    map.set(b.tileId, arr)
  }
  return map
})()

const BUILDING_BY_ID: Map<string, BuildingDef> = (() => {
  const map = new Map<string, BuildingDef>()
  for (const b of ALL_BUILDINGS) {
    if (map.has(b.id)) throw new Error(`Duplicate building id: ${b.id}`)
    map.set(b.id, b)
  }
  return map
})()

export function listAllBuildings(): readonly BuildingDef[] {
  return ALL_BUILDINGS
}

export function listBuildingsForTile(tileId: string): readonly BuildingDef[] {
  return BUILDINGS_BY_TILE.get(tileId) ?? []
}

export function findBuildingById(id: string): BuildingDef | null {
  return BUILDING_BY_ID.get(id) ?? null
}

export function findOwnerBuilding(npcId: string): BuildingDef | null {
  for (const b of ALL_BUILDINGS) {
    if (b.ownerNpcId === npcId) return b
  }
  return null
}

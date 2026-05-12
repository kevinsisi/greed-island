// 潮鳴市八方街區的視覺定義 (Phaser prototype 用色塊和幾何圖形)。
// 每個 district id 都對應 fixtureMap.tiles[].id，這樣玩家踩進去
// 觸發的 area:enter 事件可以直接帶到 /area/:tileId。

export const TILE_SIZE = 40
export const GRID_COLS = 20
export const GRID_ROWS = 15
export const CANVAS_WIDTH = TILE_SIZE * GRID_COLS // 800
export const CANVAS_HEIGHT = TILE_SIZE * GRID_ROWS // 600

export type DistrictId =
  | 't_forest'   // 潮見丘
  | 't_mountain' // 煙嵐山
  | 't_temple'   // 霓港區
  | 't_dimai'    // 地脈層
  | 't_desert'   // 潮聲區
  | 't_central'  // 夜潮區
  | 't_ruin'     // 鏽灣區
  | 't_dock'     // 碼頭區
  | 't_salt_marsh' // 鹽沼外環
  | 't_road'     // 中性連通帶 (不是「街區」，純粹給玩家走的路)

export interface DistrictDef {
  id: DistrictId
  /** 顯示名稱 (繁中)。英文版透過 i18n 提供。*/
  nameZh: string
  nameEn: string
  /** 背景主色 */
  color: number
  /** 較深的紋理色 (用作棋盤格紋路) */
  shade: number
  /** 邊界色 (描邊讓街區界線清楚) */
  border: number
  /** 區域中心 (cell 座標)，給 NPC sprite 落點和標籤用 */
  anchor: { col: number; row: number }
  /** 不可走動 (true 代表單純背景，例如 t_road 視為可走) */
  walkable: boolean
}

export const DISTRICTS: Readonly<Record<DistrictId, DistrictDef>> = {
  t_forest: {
    id: 't_forest',
    nameZh: '潮見丘',
    nameEn: 'Tideview',
    color: 0x4f8c5a,
    shade: 0x3d6e47,
    border: 0x2b5234,
    anchor: { col: 2, row: 2 },
    walkable: true
  },
  t_mountain: {
    id: 't_mountain',
    nameZh: '煙嵐山',
    nameEn: 'Yan-Lan',
    color: 0x2f5d3a,
    shade: 0x244730,
    border: 0x183020,
    anchor: { col: 9, row: 2 },
    walkable: true
  },
  t_temple: {
    id: 't_temple',
    nameZh: '霓港區',
    nameEn: 'Niport',
    color: 0x3878c4,
    shade: 0x2b609d,
    border: 0x1d4476,
    anchor: { col: 16, row: 2 },
    walkable: true
  },
  t_dimai: {
    id: 't_dimai',
    nameZh: '地脈層',
    nameEn: 'Ley-Strata',
    color: 0x6e3fa0,
    shade: 0x542f7c,
    border: 0x331b4c,
    anchor: { col: 9, row: 6 },
    walkable: true
  },
  t_desert: {
    id: 't_desert',
    nameZh: '潮聲區',
    nameEn: 'Chao-Sheng',
    color: 0x8a8a8a,
    shade: 0x6b6b6b,
    border: 0x484848,
    anchor: { col: 2, row: 11 },
    walkable: true
  },
  t_central: {
    id: 't_central',
    nameZh: '夜潮區',
    nameEn: 'Ye-Chao',
    color: 0xc23f54,
    shade: 0x9a3045,
    border: 0x66202d,
    anchor: { col: 9, row: 11 },
    walkable: true
  },
  t_ruin: {
    id: 't_ruin',
    nameZh: '鏽灣區',
    nameEn: 'Xiu-Wan',
    color: 0x8a5a32,
    shade: 0x6e4624,
    border: 0x462c14,
    anchor: { col: 16, row: 11 },
    walkable: true
  },
  t_dock: {
    id: 't_dock',
    nameZh: '碼頭區',
    nameEn: 'Dockside',
    color: 0x6fb8d7,
    shade: 0x559cba,
    border: 0x356a80,
    anchor: { col: 9, row: 13 },
    walkable: true
  },
  t_salt_marsh: {
    id: 't_salt_marsh',
    nameZh: '鹽沼外環',
    nameEn: 'Salt-Marsh Rim',
    color: 0x789a9a,
    shade: 0x5e7c7c,
    border: 0x3c5555,
    anchor: { col: 17, row: 14 },
    walkable: true
  },
  t_road: {
    id: 't_road',
    nameZh: '街道',
    nameEn: 'street',
    color: 0x2a2e36,
    shade: 0x23272e,
    border: 0x1a1d22,
    anchor: { col: 0, row: 0 },
    walkable: true
  }
}

/** 街區裡的 NPC 顯示用標籤色 (跟主色互補，讓 NPC sprite 在底色上跳出來) */
export const NPC_BADGE_COLOR = 0xf6c560
export const NPC_BADGE_TEXT = '#1c1300'

/** 玩家 sprite 顏色 */
export const PLAYER_COLOR = 0xfff5b8
export const PLAYER_OUTLINE = 0x1a1a1a

/**
 * 20x15 的格子地圖。每個格子代表一個 40x40 px 的 tile，內容是
 * district id。`r` 表示街道 (中性連通帶)。地圖刻意用幾何方塊區隔
 * 八個街區，留下街道形成主要動線。
 */
export const DISTRICT_GRID: DistrictId[][] = (() => {
  const G = GRID_COLS
  const R = GRID_ROWS
  const grid: DistrictId[][] = []
  for (let row = 0; row < R; row += 1) {
    const line: DistrictId[] = []
    for (let col = 0; col < G; col += 1) {
      line.push(districtAt(col, row))
    }
    grid.push(line)
  }
  return grid
})()

function inRect(col: number, row: number, c0: number, r0: number, c1: number, r1: number) {
  return col >= c0 && col <= c1 && row >= r0 && row <= r1
}

function districtAt(col: number, row: number): DistrictId {
  // 上方街區
  if (inRect(col, row, 0, 0, 4, 4)) return 't_forest'      // 潮見丘 左上
  if (inRect(col, row, 5, 0, 13, 3)) return 't_mountain'   // 煙嵐山 上方中
  if (inRect(col, row, 14, 0, 19, 4)) return 't_temple'    // 霓港區 右上
  // 中央地脈層
  if (inRect(col, row, 7, 5, 11, 8)) return 't_dimai'      // 地脈層 中央
  // 下方街區
  if (inRect(col, row, 0, 9, 4, 12)) return 't_desert'     // 潮聲區 左下
  if (inRect(col, row, 6, 9, 12, 12)) return 't_central'   // 夜潮區 中下
  if (inRect(col, row, 14, 9, 19, 12)) return 't_ruin'     // 鏽灣區 右下
  if (inRect(col, row, 15, 13, 19, 14)) return 't_salt_marsh' // 鹽沼外環 擴張區
  if (inRect(col, row, 0, 13, 14, 14)) return 't_dock'     // 碼頭區 最下
  // 其他空隙都是街道
  return 't_road'
}

/**
 * 八個 (非街道) 街區的 ID 順序，給 React 端遍歷使用。
 */
export const DISTRICT_IDS: DistrictId[] = [
  't_forest',
  't_mountain',
  't_temple',
  't_dimai',
  't_desert',
  't_central',
  't_ruin',
  't_dock',
  't_salt_marsh'
]

export function isDistrict(id: DistrictId): boolean {
  return id !== 't_road'
}

export function districtAtCell(col: number, row: number): DistrictId {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return 't_road'
  return DISTRICT_GRID[row]![col]!
}

export function districtAtPixel(x: number, y: number): DistrictId {
  return districtAtCell(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))
}

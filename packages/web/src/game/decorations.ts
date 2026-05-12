// 環境裝飾物：城市地圖 (MapScene) 與單一街區地圖 (AreaScene) 都用得到。
// Prototype 階段使用 emoji / unicode 字符當佔位視覺，等美術資產進來再
// 替換成 sprite 圖層。所有座標都是 cell (col, row) 而非像素，方便
// 兩個 scene 用各自的 TILE_SIZE 直接乘出像素位置。

import type { DistrictId } from './districts'

export interface CellDecoration {
  col: number
  row: number
  glyph: string
  /** 字體大小 (px)，依 tile 大小調整 */
  size: number
}

/**
 * 城市地圖 (20x15) 的街區擺設。每個街區內依 deterministic 配置散佈
 * 4-7 個建築 / 樹 / 地標，讓街區看起來不再是純色塊。
 *
 * 座標都在 districtAt 那個矩形範圍內，一定不會擋到「街道」連通帶。
 */
export const CITY_DECORATIONS: Readonly<Record<DistrictId, readonly CellDecoration[]>> = {
  // 潮見丘 0..4, 0..4 — 森林丘陵
  t_forest: [
    { col: 1, row: 1, glyph: '🌳', size: 22 },
    { col: 3, row: 1, glyph: '🌲', size: 22 },
    { col: 1, row: 3, glyph: '🌲', size: 22 },
    { col: 3, row: 3, glyph: '🌳', size: 22 },
    { col: 2, row: 4, glyph: '🏠', size: 22 },
  ],
  // 煙嵐山 5..13, 0..3 — 山地
  t_mountain: [
    { col: 6, row: 1, glyph: '⛰', size: 24 },
    { col: 9, row: 0, glyph: '🏔', size: 24 },
    { col: 12, row: 1, glyph: '⛰', size: 24 },
    { col: 7, row: 3, glyph: '🌲', size: 22 },
    { col: 11, row: 3, glyph: '🌲', size: 22 },
  ],
  // 霓港區 14..19, 0..4 — 神社 / 城市混合
  t_temple: [
    { col: 15, row: 1, glyph: '⛩', size: 24 },
    { col: 18, row: 1, glyph: '🏯', size: 24 },
    { col: 14, row: 3, glyph: '🏠', size: 22 },
    { col: 17, row: 3, glyph: '🪔', size: 20 },
    { col: 19, row: 4, glyph: '🏠', size: 22 },
  ],
  // 地脈層 7..11, 5..8 — 神祕能量
  t_dimai: [
    { col: 8, row: 5, glyph: '✦', size: 28 },
    { col: 10, row: 6, glyph: '◈', size: 28 },
    { col: 8, row: 7, glyph: '✧', size: 28 },
    { col: 10, row: 8, glyph: '✦', size: 24 },
  ],
  // 潮聲區 0..4, 9..12 — 灰色廢渣 / 工業
  t_desert: [
    { col: 1, row: 9, glyph: '🪨', size: 22 },
    { col: 3, row: 9, glyph: '🌵', size: 22 },
    { col: 1, row: 11, glyph: '🪨', size: 22 },
    { col: 3, row: 11, glyph: '🪨', size: 22 },
    { col: 2, row: 12, glyph: '🏚', size: 22 },
  ],
  // 夜潮區 6..12, 9..12 — 紅色都市 / 店鋪
  t_central: [
    { col: 7, row: 9, glyph: '🏪', size: 22 },
    { col: 10, row: 9, glyph: '🏠', size: 22 },
    { col: 12, row: 10, glyph: '🪧', size: 20 },
    { col: 7, row: 11, glyph: '🏠', size: 22 },
    { col: 9, row: 11, glyph: '🏪', size: 22 },
    { col: 11, row: 12, glyph: '🏠', size: 22 },
  ],
  // 鏽灣區 14..19, 9..12 — 廢墟
  t_ruin: [
    { col: 15, row: 9, glyph: '🏚', size: 22 },
    { col: 18, row: 9, glyph: '🪨', size: 22 },
    { col: 14, row: 11, glyph: '🏚', size: 22 },
    { col: 17, row: 11, glyph: '🪨', size: 22 },
    { col: 19, row: 12, glyph: '🏚', size: 22 },
  ],
  // 碼頭區 0..19, 13..14 — 碼頭 / 海
  t_dock: [
    { col: 2, row: 13, glyph: '⚓', size: 22 },
    { col: 5, row: 13, glyph: '⛵', size: 22 },
    { col: 9, row: 13, glyph: '⚓', size: 22 },
    { col: 13, row: 13, glyph: '⛵', size: 22 },
    { col: 17, row: 13, glyph: '⚓', size: 22 },
    { col: 7, row: 14, glyph: '🪝', size: 20 },
    { col: 15, row: 14, glyph: '🪝', size: 20 },
  ],
  t_salt_marsh: [
    { col: 16, row: 13, glyph: '🌾', size: 22 },
    { col: 18, row: 13, glyph: '🛖', size: 22 },
    { col: 17, row: 14, glyph: '🪵', size: 20 },
  ],
  t_road: [],
}

export interface AreaDecorationSet {
  /** 灑在 area 地圖內的環境物件。座標是 area cell (15 cols x 10 rows)。 */
  props: readonly CellDecoration[]
  /** 在 area 地圖中要被標成「主要道路」的 cell 列表 (cobblestone 色)。 */
  roadCells: ReadonlyArray<{ col: number; row: number }>
}

/**
 * 在 (col0, row0) -- (col1, row1) (含端點) 之間畫一條直線道路。col 與 row
 * 若同時變動則畫斜線；通常給單一方向的水平 / 垂直。
 */
function lineCells(
  col0: number,
  row0: number,
  col1: number,
  row1: number
): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = []
  const dx = Math.sign(col1 - col0)
  const dy = Math.sign(row1 - row0)
  let c = col0
  let r = row0
  out.push({ col: c, row: r })
  while (c !== col1 || r !== row1) {
    if (c !== col1) c += dx
    if (r !== row1) r += dy
    out.push({ col: c, row: r })
  }
  return out
}

/**
 * 區域內地圖 (15 cols x 10 rows) 的環境物件擺設。每個街區依其主題
 * 散佈 6-12 個物件 + 一條穿過區域的主要道路。
 */
export const AREA_DECORATIONS: Readonly<Record<DistrictId, AreaDecorationSet>> = {
  // 潮見丘 — 森林與小屋
  t_forest: {
    props: [
      { col: 1, row: 1, glyph: '🌳', size: 22 },
      { col: 3, row: 0, glyph: '🌲', size: 22 },
      { col: 5, row: 1, glyph: '🌳', size: 22 },
      { col: 9, row: 0, glyph: '🌳', size: 22 },
      { col: 12, row: 1, glyph: '🌲', size: 22 },
      { col: 1, row: 3, glyph: '🏠', size: 22 },
      { col: 13, row: 3, glyph: '🏠', size: 22 },
      { col: 2, row: 8, glyph: '🌲', size: 22 },
      { col: 5, row: 8, glyph: '🌳', size: 22 },
      { col: 9, row: 9, glyph: '🌳', size: 22 },
      { col: 12, row: 8, glyph: '🌲', size: 22 },
      { col: 14, row: 9, glyph: '🪵', size: 20 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 0, 7, 9),
    ],
  },
  // 煙嵐山 — 岩石與松樹
  t_mountain: {
    props: [
      { col: 1, row: 0, glyph: '⛰', size: 24 },
      { col: 4, row: 1, glyph: '🏔', size: 24 },
      { col: 8, row: 0, glyph: '⛰', size: 24 },
      { col: 11, row: 1, glyph: '🏔', size: 24 },
      { col: 13, row: 0, glyph: '⛰', size: 24 },
      { col: 2, row: 3, glyph: '🌲', size: 22 },
      { col: 6, row: 3, glyph: '🌲', size: 22 },
      { col: 12, row: 3, glyph: '🌲', size: 22 },
      { col: 1, row: 8, glyph: '🪨', size: 22 },
      { col: 4, row: 9, glyph: '🌲', size: 22 },
      { col: 10, row: 8, glyph: '🪨', size: 22 },
      { col: 13, row: 9, glyph: '🪨', size: 22 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 5, 7, 9),
    ],
  },
  // 霓港區 — 神社、燈籠、店鋪
  t_temple: {
    props: [
      { col: 2, row: 0, glyph: '⛩', size: 24 },
      { col: 7, row: 0, glyph: '🏯', size: 24 },
      { col: 12, row: 0, glyph: '⛩', size: 24 },
      { col: 1, row: 3, glyph: '🪔', size: 20 },
      { col: 5, row: 3, glyph: '🏪', size: 22 },
      { col: 9, row: 3, glyph: '🏠', size: 22 },
      { col: 13, row: 3, glyph: '🪔', size: 20 },
      { col: 1, row: 8, glyph: '🪧', size: 20 },
      { col: 4, row: 8, glyph: '🏠', size: 22 },
      { col: 10, row: 8, glyph: '🏪', size: 22 },
      { col: 13, row: 8, glyph: '🪔', size: 20 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(3, 0, 3, 9),
      ...lineCells(11, 0, 11, 9),
    ],
  },
  // 地脈層 — 能量結晶 / 神秘
  t_dimai: {
    props: [
      { col: 2, row: 1, glyph: '✦', size: 28 },
      { col: 7, row: 0, glyph: '◈', size: 28 },
      { col: 12, row: 1, glyph: '✧', size: 28 },
      { col: 4, row: 3, glyph: '✦', size: 24 },
      { col: 10, row: 3, glyph: '✧', size: 24 },
      { col: 1, row: 6, glyph: '◈', size: 24 },
      { col: 7, row: 7, glyph: '✦', size: 28 },
      { col: 13, row: 6, glyph: '◈', size: 24 },
      { col: 4, row: 8, glyph: '✧', size: 22 },
      { col: 10, row: 8, glyph: '✦', size: 22 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 0, 7, 9),
    ],
  },
  // 潮聲區 — 廢渣、工業、灰
  t_desert: {
    props: [
      { col: 1, row: 0, glyph: '🪨', size: 22 },
      { col: 4, row: 1, glyph: '🌵', size: 22 },
      { col: 8, row: 0, glyph: '🪨', size: 22 },
      { col: 12, row: 1, glyph: '🪨', size: 22 },
      { col: 2, row: 3, glyph: '🏚', size: 22 },
      { col: 9, row: 3, glyph: '🏚', size: 22 },
      { col: 13, row: 3, glyph: '🪨', size: 22 },
      { col: 1, row: 8, glyph: '🌵', size: 22 },
      { col: 5, row: 8, glyph: '🪨', size: 22 },
      { col: 11, row: 8, glyph: '🌵', size: 22 },
      { col: 13, row: 9, glyph: '🪨', size: 22 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 0, 7, 9),
    ],
  },
  // 夜潮區 — 紅色都市、店鋪、攤販
  t_central: {
    props: [
      { col: 1, row: 0, glyph: '🏠', size: 22 },
      { col: 4, row: 1, glyph: '🏪', size: 22 },
      { col: 8, row: 0, glyph: '🏠', size: 22 },
      { col: 11, row: 1, glyph: '🪧', size: 20 },
      { col: 13, row: 0, glyph: '🏠', size: 22 },
      { col: 2, row: 3, glyph: '🏪', size: 22 },
      { col: 6, row: 3, glyph: '🪧', size: 20 },
      { col: 12, row: 3, glyph: '🏠', size: 22 },
      { col: 1, row: 8, glyph: '🏠', size: 22 },
      { col: 4, row: 8, glyph: '🪧', size: 20 },
      { col: 9, row: 8, glyph: '🏪', size: 22 },
      { col: 13, row: 8, glyph: '🏠', size: 22 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(3, 0, 3, 9),
      ...lineCells(7, 0, 7, 9),
      ...lineCells(11, 0, 11, 9),
    ],
  },
  // 鏽灣區 — 廢墟、銹蝕
  t_ruin: {
    props: [
      { col: 1, row: 0, glyph: '🏚', size: 22 },
      { col: 5, row: 1, glyph: '🪨', size: 22 },
      { col: 9, row: 0, glyph: '🏚', size: 22 },
      { col: 13, row: 1, glyph: '🪨', size: 22 },
      { col: 2, row: 3, glyph: '🪨', size: 22 },
      { col: 7, row: 3, glyph: '🏚', size: 22 },
      { col: 12, row: 3, glyph: '🏚', size: 22 },
      { col: 1, row: 8, glyph: '🏚', size: 22 },
      { col: 6, row: 8, glyph: '🪨', size: 22 },
      { col: 11, row: 8, glyph: '🪨', size: 22 },
      { col: 13, row: 9, glyph: '🏚', size: 22 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 0, 7, 9),
    ],
  },
  // 碼頭區 — 碼頭、船、水
  t_dock: {
    props: [
      { col: 1, row: 0, glyph: '⚓', size: 24 },
      { col: 4, row: 1, glyph: '⛵', size: 24 },
      { col: 8, row: 0, glyph: '⚓', size: 24 },
      { col: 11, row: 1, glyph: '⛵', size: 24 },
      { col: 13, row: 0, glyph: '⚓', size: 24 },
      { col: 2, row: 3, glyph: '🪝', size: 22 },
      { col: 7, row: 3, glyph: '🛟', size: 22 },
      { col: 12, row: 3, glyph: '🪝', size: 22 },
      { col: 1, row: 8, glyph: '🐟', size: 22 },
      { col: 5, row: 8, glyph: '⛵', size: 22 },
      { col: 9, row: 9, glyph: '🐚', size: 22 },
      { col: 13, row: 8, glyph: '🪝', size: 22 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 0, 7, 9),
    ],
  },
  t_salt_marsh: {
    props: [
      { col: 1, row: 1, glyph: '🌾', size: 22 },
      { col: 3, row: 2, glyph: '🌿', size: 22 },
      { col: 6, row: 1, glyph: '🛖', size: 24 },
      { col: 9, row: 3, glyph: '📦', size: 22 },
      { col: 12, row: 2, glyph: '🪵', size: 22 },
      { col: 2, row: 8, glyph: '🐚', size: 20 },
      { col: 8, row: 8, glyph: '🌾', size: 22 },
      { col: 13, row: 7, glyph: '🪧', size: 20 },
    ],
    roadCells: [
      ...lineCells(0, 5, 14, 5),
      ...lineCells(7, 0, 7, 9),
    ],
  },
  t_road: { props: [], roadCells: [] },
}

/** 道路鋪面色 (棋盤格交替的兩色)。AreaScene 用來標主要動線。 */
export const AREA_ROAD_COLOR = 0x6a5a44
export const AREA_ROAD_SHADE = 0x584a38

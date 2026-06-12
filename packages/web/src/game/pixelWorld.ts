// 8-bit 像素世界材質 — 全程序化生成，不需要任何外部圖檔。
//
// 兩個用途：
//   1. 地形「體素感」：每個 cell 疊一層確定性 dither 雜訊 + 斜角 bevel
//      （上/左亮、下/右暗），配 pixelArt renderer 直接得到 8-bit 方塊地。
//   2. 像素道具：以邏輯像素（PX=5 實際 px）手繪的樹/岩/屋/燈籠/神社等
//      sprite，取代 prototype 的 emoji 佔位字符。道具比 tile 高（向上
//      突出 + 落影），畫面立刻有 2.5D 立體層次。
//
// 所有 texture 以 generateTexture 進 TextureManager，同 key 不重複生成；
// AreaScene / MapScene 共用。

import Phaser from 'phaser'

/** 邏輯像素大小：40px tile = 8×8 邏輯像素。 */
export const PX = 5

const NOISE_VARIANTS = 4

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 確定性挑 noise variant，讓相鄰 cell 不重複同一張噪點圖。 */
export function noiseVariantFor(col: number, row: number): number {
  return ((col * 31 + row * 17) ^ (col + row)) % NOISE_VARIANTS
}

export function ensurePixelTerrainOverlays(scene: Phaser.Scene, tileSize: number): void {
  const tag = `t${tileSize}`
  if (scene.textures.exists(`px-bevel-${tag}`)) return
  const units = Math.max(4, Math.round(tileSize / PX))
  const u = tileSize / units

  // bevel：上/左亮、下/右暗 — 每個 cell 變成一塊浮起的 8-bit 磚。
  const bevel = scene.add.graphics()
  bevel.fillStyle(0xffffff, 0.10)
  bevel.fillRect(0, 0, tileSize, u)
  bevel.fillRect(0, 0, u, tileSize)
  bevel.fillStyle(0x000000, 0.16)
  bevel.fillRect(0, tileSize - u, tileSize, u)
  bevel.fillRect(tileSize - u, 0, u, tileSize)
  bevel.generateTexture(`px-bevel-${tag}`, tileSize, tileSize)
  bevel.destroy()

  // dither 雜訊：每 variant 一張，亮/暗各 ~12% 的邏輯像素。
  for (let v = 0; v < NOISE_VARIANTS; v += 1) {
    const rng = mulberry32(0x9e3779b9 ^ (v * 2654435761))
    const g = scene.add.graphics()
    for (let py = 0; py < units; py += 1) {
      for (let pxi = 0; pxi < units; pxi += 1) {
        const roll = rng()
        if (roll < 0.12) {
          g.fillStyle(0xffffff, 0.07)
          g.fillRect(pxi * u, py * u, u, u)
        } else if (roll < 0.24) {
          g.fillStyle(0x000000, 0.09)
          g.fillRect(pxi * u, py * u, u, u)
        }
      }
    }
    g.generateTexture(`px-noise-${tag}-${v}`, tileSize, tileSize)
    g.destroy()
  }

  // 水面波光：兩格亮點，水 cell 疊上後用 alpha tween 閃爍。
  const sp = scene.add.graphics()
  sp.fillStyle(0xd8f2ff, 0.85)
  sp.fillRect(u * 2, u * 2, u * 2, u)
  sp.fillRect(u * 5, u * 5, u, u)
  sp.generateTexture(`px-sparkle-${tag}`, tileSize, tileSize)
  sp.destroy()
}

/** 在一個 cell 上鋪 8-bit 質感（dither + bevel）。回傳建立的 images。 */
export function addPixelCellOverlay(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileSize: number,
  col: number,
  row: number,
  depth: number
): Phaser.GameObjects.Image[] {
  const tag = `t${tileSize}`
  const noise = scene.add.image(x, y, `px-noise-${tag}-${noiseVariantFor(col, row)}`).setOrigin(0).setDepth(depth)
  const bevel = scene.add.image(x, y, `px-bevel-${tag}`).setOrigin(0).setDepth(depth)
  return [noise, bevel]
}

// ---------------------------------------------------------------------------
// 像素道具
// ---------------------------------------------------------------------------

export type PixelPropName =
  | 'tree'
  | 'pine'
  | 'cactus'
  | 'reed'
  | 'grain'
  | 'log'
  | 'rock'
  | 'boulder'
  | 'snowpeak'
  | 'ruin'
  | 'house'
  | 'shop'
  | 'hut'
  | 'lantern'
  | 'shrine'
  | 'castle'
  | 'crystal'
  | 'anchor'
  | 'boat'
  | 'hook'
  | 'sign'
  | 'fungus'

/** emoji 佔位字符 → 像素道具。沒對應到的 glyph 維持原 text 呈現。 */
export const GLYPH_TO_PROP: Readonly<Record<string, PixelPropName>> = {
  '🌲': 'pine',
  '🌳': 'tree',
  '🌵': 'cactus',
  '🌿': 'reed',
  '🌾': 'grain',
  '🪵': 'log',
  '🪨': 'rock',
  '⛰': 'boulder',
  '🏔': 'snowpeak',
  '🏚': 'ruin',
  '🏠': 'house',
  '🏪': 'shop',
  '🛖': 'hut',
  '🪔': 'lantern',
  '⛩': 'shrine',
  '🏯': 'castle',
  '✦': 'crystal',
  '✧': 'crystal',
  '◈': 'crystal',
  '⚓': 'anchor',
  '⛵': 'boat',
  '🪝': 'hook',
  '🪧': 'sign',
}

export function propTextureKey(name: PixelPropName): string {
  return `pxp-${name}`
}

type Px = (x: number, y: number, w: number, h: number, color: number, alpha?: number) => void

/**
 * 生成所有像素道具 texture。每個道具畫在邏輯像素網格上（1 邏輯 px = PX 實際
 * px），底部中心對齊 cell 中心使用：image.setOrigin(0.5, 1) 放在 cell 底邊。
 */
export function ensurePixelPropTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(propTextureKey('tree'))) return

  const make = (name: PixelPropName, wUnits: number, hUnits: number, draw: (px: Px) => void): void => {
    const g = scene.add.graphics()
    const px: Px = (x, y, w, h, color, alpha = 1) => {
      g.fillStyle(color, alpha)
      g.fillRect(x * PX, y * PX, w * PX, h * PX)
    }
    draw(px)
    g.generateTexture(propTextureKey(name), wUnits * PX, hUnits * PX)
    g.destroy()
  }

  const OUT = 0x1a140a // 輪廓

  // 闊葉樹：三層樹冠 + 樹幹，右側暗一階。
  make('tree', 8, 10, (px) => {
    px(2, 0, 4, 1, OUT)
    px(1, 1, 6, 3, 0x4f8f3a)
    px(5, 1, 2, 3, 0x3c6f2c)
    px(0, 3, 8, 3, 0x5aa344)
    px(6, 3, 2, 3, 0x447f33)
    px(1, 6, 6, 1, 0x3c6f2c)
    px(3, 6, 2, 4, 0x6e4a26)
    px(4, 6, 1, 4, 0x553a1e)
  })

  // 針葉樹：階梯三角。
  make('pine', 8, 11, (px) => {
    px(3, 0, 2, 1, OUT)
    px(3, 1, 2, 2, 0x2f6e3e)
    px(2, 3, 4, 2, 0x357c46)
    px(4, 3, 2, 2, 0x28593a)
    px(1, 5, 6, 2, 0x3b8a4e)
    px(5, 5, 2, 2, 0x2c6840)
    px(0, 7, 8, 2, 0x2f6e3e)
    px(3, 9, 2, 2, 0x5e3f20)
  })

  // 仙人掌
  make('cactus', 7, 9, (px) => {
    px(2, 0, 2, 9, 0x4f9a4f)
    px(3, 0, 1, 9, 0x3e7c3e)
    px(0, 2, 2, 1, 0x4f9a4f)
    px(0, 0, 1, 3, 0x4f9a4f)
    px(5, 3, 2, 1, 0x4f9a4f)
    px(6, 1, 1, 3, 0x4f9a4f)
  })

  // 蘆葦/濕地植被
  make('reed', 7, 8, (px) => {
    px(1, 0, 1, 8, 0x6fae57)
    px(3, 1, 1, 7, 0x86c468)
    px(5, 0, 1, 8, 0x5c9648)
    px(0, 0, 1, 2, 0x9a7b4f)
    px(4, 0, 1, 2, 0x9a7b4f)
  })

  // 穀草
  make('grain', 7, 7, (px) => {
    px(0, 2, 1, 5, 0xc9a85a)
    px(2, 1, 1, 6, 0xd9bc6e)
    px(4, 2, 1, 5, 0xc9a85a)
    px(6, 1, 1, 6, 0xd9bc6e)
    px(0, 0, 1, 2, 0xe8d088)
    px(2, 0, 1, 1, 0xe8d088)
    px(4, 0, 1, 2, 0xe8d088)
    px(6, 0, 1, 1, 0xe8d088)
  })

  // 木材堆
  make('log', 8, 5, (px) => {
    px(0, 2, 8, 2, 0x7a5530)
    px(0, 3, 8, 1, 0x5e3f20)
    px(1, 0, 6, 2, 0x8a6238)
    px(1, 1, 6, 1, 0x6e4a26)
    px(0, 2, 1, 2, 0xb08a55)
    px(1, 0, 1, 2, 0xb08a55)
  })

  // 岩石
  make('rock', 7, 6, (px) => {
    px(1, 0, 4, 1, 0x8d8d96)
    px(0, 1, 6, 4, 0x7b7b85)
    px(4, 1, 2, 4, 0x60606a)
    px(0, 5, 7, 1, 0x55555e)
    px(1, 1, 2, 1, 0xa3a3ac)
  })

  // 山岩
  make('boulder', 10, 9, (px) => {
    px(4, 0, 2, 1, 0x9a9aa3)
    px(3, 1, 4, 2, 0x82828c)
    px(2, 3, 6, 2, 0x74747e)
    px(1, 5, 8, 2, 0x666670)
    px(0, 7, 10, 2, 0x585862)
    px(6, 2, 2, 6, 0x4d4d57, 0.8)
    px(4, 1, 1, 1, 0xb5b5bd)
  })

  // 雪峰
  make('snowpeak', 10, 10, (px) => {
    px(4, 0, 2, 1, 0xf2f6fa)
    px(3, 1, 4, 2, 0xe2eaf2)
    px(2, 3, 6, 2, 0x8a93a6)
    px(1, 5, 8, 2, 0x767f93)
    px(0, 7, 10, 3, 0x646d80)
    px(6, 3, 2, 6, 0x565f72, 0.8)
    px(4, 1, 1, 2, 0xffffff)
  })

  // 遺跡殘屋：缺角牆 + 破屋頂
  make('ruin', 9, 9, (px) => {
    px(0, 4, 7, 5, 0x6a6258)
    px(5, 4, 2, 5, 0x534d45)
    px(0, 2, 3, 2, 0x6a6258)
    px(5, 3, 3, 1, 0x534d45)
    px(2, 6, 2, 3, 0x2c2620)
    px(7, 6, 2, 1, 0x6a6258)
    px(1, 1, 1, 1, 0x6a6258)
  })

  // 民居：牆 + 屋頂（正面+頂面雙色 = 立體）
  make('house', 9, 9, (px) => {
    px(1, 4, 7, 5, 0xb89a6e)
    px(6, 4, 2, 5, 0x96794f)
    px(0, 1, 9, 2, 0x8a4a3a)
    px(1, 0, 7, 1, 0xa45a46)
    px(0, 3, 9, 1, 0x6e392c)
    px(3, 6, 2, 3, 0x4a3320)
    px(6, 5, 1, 1, 0xffe9a8)
  })

  // 商鋪：遮陽棚條紋 + 櫥窗
  make('shop', 10, 9, (px) => {
    px(1, 3, 8, 6, 0xa0875e)
    px(7, 3, 2, 6, 0x826b48)
    px(0, 1, 10, 2, 0xc4452e)
    px(0, 1, 2, 2, 0xe8e2d4)
    px(4, 1, 2, 2, 0xe8e2d4)
    px(8, 1, 2, 2, 0xe8e2d4)
    px(0, 3, 10, 1, 0x8a2f1e)
    px(2, 5, 2, 2, 0x8ad0e8)
    px(6, 5, 2, 4, 0x4a3320)
  })

  // 棚屋
  make('hut', 8, 8, (px) => {
    px(1, 3, 6, 5, 0x9a7b4f)
    px(5, 3, 2, 5, 0x7b6240)
    px(0, 0, 8, 3, 0xb7a36a)
    px(0, 2, 8, 1, 0x8d7c4e)
    px(3, 5, 2, 3, 0x4a3320)
  })

  // 燈籠
  make('lantern', 5, 8, (px) => {
    px(2, 0, 1, 1, 0x3a2f1a)
    px(1, 1, 3, 4, 0xe8a23c)
    px(2, 1, 1, 4, 0xffd27a)
    px(1, 5, 3, 1, 0x3a2f1a)
    px(2, 6, 1, 2, 0x3a2f1a)
  })

  // 神社鳥居
  make('shrine', 10, 9, (px) => {
    px(0, 0, 10, 1, 0xc4452e)
    px(1, 1, 8, 1, 0xa3361f)
    px(1, 2, 1, 7, 0xc4452e)
    px(8, 2, 1, 7, 0xc4452e)
    px(2, 3, 6, 1, 0xa3361f)
    px(1, 8, 2, 1, 0x7d2818)
    px(7, 8, 2, 1, 0x7d2818)
  })

  // 城樓
  make('castle', 10, 11, (px) => {
    px(2, 5, 6, 6, 0xd8d2c4)
    px(6, 5, 2, 6, 0xb3ac9c)
    px(1, 3, 8, 2, 0x4a5568)
    px(0, 4, 10, 1, 0x39404f)
    px(3, 1, 4, 2, 0xd8d2c4)
    px(2, 0, 6, 1, 0x4a5568)
    px(4, 8, 2, 3, 0x39404f)
  })

  // 脈網水晶
  make('crystal', 6, 9, (px) => {
    px(2, 0, 2, 1, 0xd8f0ff)
    px(1, 1, 4, 4, 0x7ad0f0)
    px(3, 1, 2, 4, 0x4ba8d4)
    px(2, 5, 2, 3, 0x3a86b0)
    px(2, 1, 1, 2, 0xffffff)
    px(0, 8, 6, 1, 0x2a5470, 0.7)
  })

  // 錨
  make('anchor', 7, 8, (px) => {
    px(3, 0, 1, 6, 0x5a6470)
    px(2, 0, 3, 1, 0x5a6470)
    px(1, 5, 5, 1, 0x5a6470)
    px(0, 4, 1, 2, 0x5a6470)
    px(6, 4, 1, 2, 0x5a6470)
    px(2, 1, 3, 1, 0x434c57)
    px(1, 6, 1, 1, 0x434c57)
    px(5, 6, 1, 1, 0x434c57)
  })

  // 小帆船
  make('boat', 9, 9, (px) => {
    px(4, 0, 1, 6, 0x6e4a26)
    px(5, 1, 3, 4, 0xe8e2d4)
    px(5, 2, 2, 2, 0xcfc8b8)
    px(1, 6, 7, 2, 0x8a6238)
    px(1, 7, 7, 1, 0x6e4a26)
    px(0, 6, 1, 1, 0x8a6238)
  })

  // 吊鉤
  make('hook', 5, 7, (px) => {
    px(2, 0, 1, 4, 0x707a86)
    px(1, 4, 3, 1, 0x707a86)
    px(1, 5, 1, 2, 0x707a86)
    px(3, 5, 1, 1, 0x707a86)
  })

  // 洞穴菌
  make('fungus', 6, 6, (px) => {
    px(1, 0, 4, 2, 0xb86a4a)
    px(2, 0, 2, 1, 0xd88a64)
    px(1, 1, 1, 1, 0xe8d0c0)
    px(4, 1, 1, 1, 0xe8d0c0)
    px(2, 2, 2, 4, 0xe0d8c8)
    px(3, 2, 1, 4, 0xc0b8a8)
  })

  // 告示牌
  make('sign', 7, 8, (px) => {
    px(0, 0, 7, 4, 0x9a7b4f)
    px(0, 3, 7, 1, 0x7b6240)
    px(3, 4, 1, 4, 0x6e4a26)
    px(1, 1, 5, 1, 0x5e4a30)
    px(1, 2, 3, 1, 0x5e4a30)
  })
}

/**
 * 在 cell 放一個像素道具（底邊貼 cell 底、向上突出）+ 橢圓落影。
 * 回傳 [shadow, image]；呼叫端負責 depth 管理與動畫。
 */
export function addPixelProp(
  scene: Phaser.Scene,
  name: PixelPropName,
  cellCenterX: number,
  cellBottomY: number,
  depth: number
): { shadow: Phaser.GameObjects.Ellipse; image: Phaser.GameObjects.Image } {
  const shadow = scene.add.ellipse(cellCenterX, cellBottomY - 2, 26, 8, 0x000000, 0.25)
  shadow.setDepth(depth - 1)
  const image = scene.add.image(cellCenterX, cellBottomY, propTextureKey(name))
  image.setOrigin(0.5, 1)
  image.setDepth(depth)
  return { shadow, image }
}

// WorldMapSvg pure-logic tests (no DOM — project uses vitest without jsdom).
// Covers: coordinate mapping, colour utilities, district rect coverage.

import { describe, expect, it } from 'vitest'
import { npcPixelPos, numToHex, darkenNum, DISTRICT_RECTS } from './WorldMapSvg'
import { DISTRICTS, DISTRICT_IDS, TILE_SIZE } from '../../game/districts'
import type { MapNpc } from '../../game/MapScene'

// ── Helpers ────────────────────────────────────────────────────────────────

function mkNpc(
  overrides: Pick<MapNpc, 'id' | 'districtId'> & Partial<MapNpc>,
): MapNpc {
  return {
    name:      'Test NPC',
    shortName: 'T',
    ...overrides,
  }
}

const VIEW_W = 800
const VIEW_H = 600

// ── numToHex ──────────────────────────────────────────────────────────────

describe('numToHex', () => {
  it('converts tide colour', () => {
    expect(numToHex(0x4db8c8)).toBe('#4db8c8')
  })

  it('converts ember colour', () => {
    expect(numToHex(0xf39c20)).toBe('#f39c20')
  })

  it('pads short values with leading zeros', () => {
    expect(numToHex(0x0000ff)).toBe('#0000ff')
  })

  it('handles black', () => {
    expect(numToHex(0x000000)).toBe('#000000')
  })
})

// ── darkenNum ─────────────────────────────────────────────────────────────

describe('darkenNum', () => {
  it('darkens white by 30%', () => {
    // 255 * 0.7 = 178.5 → Math.round = 179 = 0xb3
    expect(darkenNum(0xffffff, 0.7)).toBe('#b3b3b3')
  })

  it('keeps black as black', () => {
    expect(darkenNum(0x000000, 0.7)).toBe('#000000')
  })

  it('clamps to 0 with factor=0', () => {
    expect(darkenNum(0xffffff, 0)).toBe('#000000')
  })
})

// ── npcPixelPos: static NPC ────────────────────────────────────────────────

describe('npcPixelPos — static NPC', () => {
  it('returns district anchor center when no subCol/subRow', () => {
    const npc = mkNpc({ id: 'a', districtId: 't_forest' })
    const def = DISTRICTS['t_forest']
    const [x, y] = npcPixelPos(npc)
    expect(x).toBe(def.anchor.col * TILE_SIZE + TILE_SIZE / 2)
    expect(y).toBe(def.anchor.row * TILE_SIZE + TILE_SIZE / 2)
  })

  it('applies near-zero offset when subCol/subRow are centred', () => {
    const npc = mkNpc({ id: 'b', districtId: 't_central', subCol: 7, subRow: 4 })
    const def = DISTRICTS['t_central']
    const anchorX = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
    const anchorY = def.anchor.row * TILE_SIZE + TILE_SIZE / 2
    const [x, y] = npcPixelPos(npc)
    // subCol=7 is exactly centre → zero x offset
    expect(x).toBeCloseTo(anchorX, 0)
    // subRow formula centres at 4.5; subRow=4 yields ≈8px upward shift — still well within half a tile
    expect(Math.abs(y - anchorY)).toBeLessThan(TILE_SIZE / 2)
  })

  it('offsets left when subCol=0', () => {
    const npc = mkNpc({ id: 'c', districtId: 't_dimai', subCol: 0, subRow: 4 })
    const def = DISTRICTS['t_dimai']
    const anchorX = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
    const [x] = npcPixelPos(npc)
    expect(x).toBeLessThan(anchorX)
  })

  it('offsets right when subCol=14', () => {
    const npc = mkNpc({ id: 'd', districtId: 't_dimai', subCol: 14, subRow: 4 })
    const def = DISTRICTS['t_dimai']
    const anchorX = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
    const [x] = npcPixelPos(npc)
    expect(x).toBeGreaterThan(anchorX)
  })
})

// ── npcPixelPos: travelling NPC ────────────────────────────────────────────

describe('npcPixelPos — travelling NPC', () => {
  it('places NPC at midpoint between from and to district anchors', () => {
    const npc = mkNpc({
      id: 'e',
      districtId: 't_central',
      travelRoute: {
        fromDistrictId: 't_central',
        toDistrictId: 't_dock',
        targetDistrictId: 't_dock',
      },
    })
    const from = DISTRICTS['t_central']
    const to   = DISTRICTS['t_dock']
    const fx = from.anchor.col * TILE_SIZE + TILE_SIZE / 2
    const fy = from.anchor.row * TILE_SIZE + TILE_SIZE / 2
    const tx = to.anchor.col   * TILE_SIZE + TILE_SIZE / 2
    const ty = to.anchor.row   * TILE_SIZE + TILE_SIZE / 2
    const [x, y] = npcPixelPos(npc)
    expect(x).toBeCloseTo((fx + tx) / 2)
    expect(y).toBeCloseTo((fy + ty) / 2)
  })
})

// ── All positions in bounds ────────────────────────────────────────────────

describe('npcPixelPos — SVG bounds', () => {
  it('returns positions within SVG viewport for all districts', () => {
    for (const id of DISTRICT_IDS) {
      const npc = mkNpc({ id: `npc-${id}`, districtId: id })
      const [x, y] = npcPixelPos(npc)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(VIEW_W)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(VIEW_H)
    }
  })
})

// ── DISTRICT_RECTS coverage ────────────────────────────────────────────────

describe('DISTRICT_RECTS', () => {
  it('covers all DISTRICT_IDS', () => {
    for (const id of DISTRICT_IDS) {
      expect(DISTRICT_RECTS[id]).toBeDefined()
    }
  })

  it('each rect has valid pixel dimensions', () => {
    for (const id of DISTRICT_IDS) {
      const dr = DISTRICT_RECTS[id]
      if (!dr) continue
      const [c0, r0, c1, r1] = dr
      const w = (c1 - c0 + 1) * TILE_SIZE
      const h = (r1 - r0 + 1) * TILE_SIZE
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
      expect(c0 * TILE_SIZE + w).toBeLessThanOrEqual(VIEW_W)
      expect(r0 * TILE_SIZE + h).toBeLessThanOrEqual(VIEW_H)
    }
  })

  it('district anchors fall within their rect bounds', () => {
    for (const id of DISTRICT_IDS) {
      const dr  = DISTRICT_RECTS[id]
      const def = DISTRICTS[id]
      if (!dr) continue
      const [c0, r0, c1, r1] = dr
      expect(def.anchor.col).toBeGreaterThanOrEqual(c0)
      expect(def.anchor.col).toBeLessThanOrEqual(c1)
      expect(def.anchor.row).toBeGreaterThanOrEqual(r0)
      expect(def.anchor.row).toBeLessThanOrEqual(r1)
    }
  })
})

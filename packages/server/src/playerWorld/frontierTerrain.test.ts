import { describe, expect, it } from 'vitest'
import { FRONTIER_TERRAIN } from '../sim/frontierTerrain.js'
import { frontierStep, getAreaTerrainMask } from '../sim/npcEngine.js'
import { canStand, computeMove, getRegionGeometry } from './geometry.js'
import { FRONTIER_ZONES } from '../sim/mapGraph.js'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function browserMask(tileId: string): string[] {
  const source = ts.createSourceFile('terrainMask.ts', readFileSync(new URL('../../../web/src/game/terrainMask.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true)
  let result: string[] | undefined
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === tileId && ts.isArrayLiteralExpression(node.initializer)) {
      result = node.initializer.elements.map(element => { if (!ts.isStringLiteral(element)) throw new Error('Expected authored mask literal'); return element.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(source); if (!result) throw new Error(`Missing 2D district terrain: ${tileId}`); return result
}
describe('authored frontier masks across server, NPC and area presentation', () => {
  it.each(FRONTIER_ZONES.map(tile => tile.id))('%s has exact 15×10 masks and no traversable rock or deep-water cells', tileId => {
    const mask = FRONTIER_TERRAIN[tileId]!, geometry = getRegionGeometry(tileId)!
    expect(mask).toHaveLength(10); expect(mask.every(row => row.length === 15)).toBe(true)
    expect(getAreaTerrainMask(tileId)).toEqual(mask); expect(geometry.terrain).toEqual(mask)
    expect(browserMask(tileId)).toEqual(mask)
    const cells: { col: number; row: number }[] = []
    mask.forEach((row, z) => [...row].forEach((glyph, x) => {
      const blocked = glyph === 'X' || glyph === '.'
      expect(canStand({ x, z }, geometry)).toBe(!blocked)
      if (!blocked) cells.push({ col: x, row: z })
    }))
    for (const cell of cells) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let point = { x: cell.col, z: cell.row }
        for (let i = 0; i < 5; i++) { point = computeMove(point, dx!, dz!, geometry); expect(canStand(point, geometry)).toBe(true) }
      }
      // Every target is reachable with safe cardinal steps, not a straight-line teleport through rock.
      let current = { col: geometry.spawn.x, row: geometry.spawn.z }
      for (let step = 0; step < 150 && (current.col !== cell.col || current.row !== cell.row); step++) {
        const next = frontierStep(tileId, current, cell, cells)
        expect(Math.abs(next.col - current.col) + Math.abs(next.row - current.row)).toBe(1)
        expect(canStand({ x: next.col, z: next.row }, geometry)).toBe(true)
        current = next
      }
      expect(current).toEqual(cell)
    }
  })
})

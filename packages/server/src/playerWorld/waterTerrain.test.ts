import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { getAuthoredWaterTerrainMask } from './waterTerrain.js'
import { canStand, getRegionGeometry } from './geometry.js'

function originalAuthoredMask(tileId: string): string[] {
  // Parse source literals with TypeScript's AST; do not evaluate the frontend module.
  const content = readFileSync(new URL('../../../web/src/game/terrainMask.ts', import.meta.url), 'utf8')
  const source = ts.createSourceFile('terrainMask.ts', content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  let mask: string[] | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'RAW_MASKS'
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) if (ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === tileId
        && ts.isArrayLiteralExpression(property.initializer)) {
        mask = property.initializer.elements.map(element => {
          if (!ts.isStringLiteral(element)) throw new Error('Authored mask must be literal strings.')
          return element.text
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source); if (!mask) throw new Error(`Original authored mask missing: ${tileId}`); return mask
}
describe('exact existing authored water-mask promotion', () => {
  it.each(['t_temple', 't_salt_marsh'])('preserves %s source parity and blocks every existing open-water cell', tileId => {
    const mask = getAuthoredWaterTerrainMask(tileId), world = getRegionGeometry(tileId)!
    expect(mask).toEqual(originalAuthoredMask(tileId)); expect(mask).toHaveLength(10); expect(mask.every(row => row.length === 15)).toBe(true)
    expect(Object.isFrozen(mask)).toBe(true)
    mask.forEach((row, z) => [...row].forEach((cell, x) => { if (cell === '.') expect(canStand({ x, z }, world)).toBe(false) }))
  })
})

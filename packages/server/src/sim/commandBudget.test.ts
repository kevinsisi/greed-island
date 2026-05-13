import { describe, expect, it } from 'vitest'
import { applyCommandHardCap, type CommandLike } from './commandBudget.js'

function cmd(id: string): CommandLike {
  return { commandId: id }
}

describe('applyCommandHardCap', () => {
  it('returns input unchanged when under or equal to cap', () => {
    const cs = [cmd('a'), cmd('b'), cmd('c')]
    const result = applyCommandHardCap(cs, 5)
    expect(result.kept).toBe(cs) // identity preserved
    expect(result.rejected).toEqual([])
  })

  it('at exact cap keeps everything', () => {
    const cs = [cmd('z'), cmd('a'), cmd('m')]
    const result = applyCommandHardCap(cs, 3)
    expect(result.kept.length).toBe(3)
    expect(result.rejected.length).toBe(0)
  })

  it('sorts by commandId and slices first N when over cap', () => {
    // Built in non-sorted order; expected sorted ascending by commandId.
    const cs = [cmd('z'), cmd('a'), cmd('m'), cmd('b'), cmd('x')]
    const result = applyCommandHardCap(cs, 3)
    expect(result.kept.map((c) => c.commandId)).toEqual(['a', 'b', 'm'])
    expect(result.rejected.map((c) => c.commandId)).toEqual(['x', 'z'])
  })

  it('partition is deterministic across runtime collection order', () => {
    // Same set of commandIds, two different collection orders.
    const orderA = [cmd('5'), cmd('3'), cmd('9'), cmd('1'), cmd('7')]
    const orderB = [cmd('7'), cmd('1'), cmd('9'), cmd('3'), cmd('5')]
    const a = applyCommandHardCap(orderA, 3)
    const b = applyCommandHardCap(orderB, 3)
    expect(a.kept.map((c) => c.commandId)).toEqual(b.kept.map((c) => c.commandId))
    expect(a.rejected.map((c) => c.commandId)).toEqual(b.rejected.map((c) => c.commandId))
  })

  it('returns frozen kept/rejected arrays', () => {
    const cs = [cmd('z'), cmd('a'), cmd('m'), cmd('b')]
    const result = applyCommandHardCap(cs, 2)
    expect(Object.isFrozen(result.kept)).toBe(true)
    expect(Object.isFrozen(result.rejected)).toBe(true)
  })

  it('throws on invalid hardCap', () => {
    expect(() => applyCommandHardCap([cmd('a')], 0)).toThrow()
    expect(() => applyCommandHardCap([cmd('a')], -1)).toThrow()
    expect(() => applyCommandHardCap([cmd('a')], 1.5)).toThrow()
  })

  it('handles empty input', () => {
    const result = applyCommandHardCap<CommandLike>([], 5)
    expect(result.kept).toEqual([])
    expect(result.rejected).toEqual([])
  })
})

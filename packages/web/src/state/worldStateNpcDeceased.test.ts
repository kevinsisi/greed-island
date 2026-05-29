// v0.87.3 — front-end propagation of NPC death state.
// Spec: openspec/changes/deceased-npc-leaves-active-world/specs/deceased-npc-isolation/spec.md

import { describe, expect, it } from 'vitest'
import type { ServerNpc } from '../api/client'
import { __testHooks__ } from './WorldStateContext'

const baseServerNpc: ServerNpc = {
  id: 'npc.test',
  name: { zh: '測試者', en: 'Tester' },
  role: { zh: '測試員', en: 'Tester' },
  location: 't_central',
  relationshipScore: 50,
  lastActedTick: 0,
  internalState: {},
}

describe('toNpcSummary deceased propagation', () => {
  it('passes deceased: true through unchanged', () => {
    const summary = __testHooks__.toNpcSummary({ ...baseServerNpc, deceased: true }, 'zh')
    expect(summary.deceased).toBe(true)
  })

  it('passes deceased: false through unchanged', () => {
    const summary = __testHooks__.toNpcSummary({ ...baseServerNpc, deceased: false }, 'zh')
    expect(summary.deceased).toBe(false)
  })

  it('defaults to deceased: false when the server omits the field (legacy back-compat)', () => {
    const summary = __testHooks__.toNpcSummary(baseServerNpc, 'zh')
    expect(summary.deceased).toBe(false)
  })
})

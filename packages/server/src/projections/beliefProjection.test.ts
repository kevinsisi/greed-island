import { describe, it, expect } from 'vitest'
import { BeliefProjection } from './beliefProjection.js'

describe('BeliefProjection', () => {
  it('getBeliefs returns empty array for unknown npc', () => {
    const proj = new BeliefProjection()
    expect(proj.getBeliefs('npc-x')).toEqual([])
  })
})

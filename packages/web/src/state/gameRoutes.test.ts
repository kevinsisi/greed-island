import { describe, expect, it } from 'vitest'
import { canonicalGamePath } from './gameRoutes'

describe('one-game preserved bookmark aliases', () => {
  it('keeps every concrete gameplay/account view reachable inside /game', () => {
    for (const path of ['/profile', '/codex', '/timeline', '/social', '/ecology', '/market', '/properties', '/settings', '/admin', '/admin/world', '/admin/npcs', '/admin/cards', '/admin/lineage', '/area/t_dock', '/building/test']) expect(canonicalGamePath(path)).toBe(`/game${path}`)
  })
  it('unifies entry/account aliases but never invents a view for unknown paths', () => {
    for (const path of ['/', '/account', '/prototype-3d', '/multiplayer-3d']) expect(canonicalGamePath(path)).toBe('/game')
    expect(canonicalGamePath('/reset-password')).toBe('/reset-password')
    expect(canonicalGamePath('/unknown')).toBeNull()
  })
})

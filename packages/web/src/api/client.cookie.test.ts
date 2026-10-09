import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, authHeaders } from './client'
import { profileFixture } from '../multiplayer3d/testFixtures'
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())
describe('preserved feature API cookie boundary', () => {
  it('sends the displayed numeric context without bearer tokens', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ walletInitialized: false, wallet: null, jobs: [], currentTick: 3, currentShift: null }))
    vi.stubGlobal('fetch', fetcher)
    await api.wallet(1)
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/wallet')
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-Greed-Account-Id')).toBe('1')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false)
    expect(authHeaders(null)).toEqual({}); expect(authHeaders(-1)).toEqual({})
  })
  it('accepts nullable-email own profile but rejects another account response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ profile: profileFixture() }))
    vi.stubGlobal('fetch', fetcher)
    expect((await api.updateProfile(1, { nickname: null, avatar: 'tide' })).profile.email).toBeNull()
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH')
    fetcher.mockResolvedValueOnce(response({ profile: { ...profileFixture(), accountId: 2 } }))
    await expect(api.profile(1)).rejects.toThrow('profile response mismatch')
  })
  it('never forwards local/persisted player coordinates to legacy presence', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({}))
    vi.stubGlobal('fetch', fetcher)
    await api.socialPresence(1, 't_other', { x: 999, y: 999, z: 9 })
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({})
  })
  it('keeps unknown owned-card energy null and rejects contradictions or foreign region responses', async () => {
    const state = { tick: 3, energy: null, walletInitialized: false, drops: [] }
    const fetcher = vi.fn<typeof fetch>(async () => response(state)); vi.stubGlobal('fetch', fetcher)
    expect(await api.cardsHeld(1)).toEqual(state)
    fetcher.mockResolvedValueOnce(response({ ...state, tileId: 't_dock' }))
    expect((await api.cardsActive(1, 't_dock')).energy).toBeNull()
    fetcher.mockResolvedValueOnce(response({ ...state, walletInitialized: true }))
    await expect(api.cardsHeld(1)).rejects.toThrow('readiness')
    fetcher.mockResolvedValueOnce(response({ ...state, tileId: 't_central' }))
    await expect(api.cardsActive(1, 't_dock')).rejects.toThrow('region response mismatch')
    fetcher.mockResolvedValueOnce(response({ ...state, energy: 0, walletInitialized: true }))
    expect((await api.cardsHeld(1)).energy).toBe(0)
  })
})

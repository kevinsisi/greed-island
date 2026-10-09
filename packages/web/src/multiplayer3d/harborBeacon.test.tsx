import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HarborBeaconPanel } from './HarborBeaconPanel'
import { beaconRemainingSeconds, harborBeaconVisual, harborContributionStatus, harborProgressText } from './harborBeacon'
import { isHarborBeacon, isHarborProgress, isPlayerWorldSnapshot } from './protocol'
import { snapshotFixture } from './testFixtures'
import type { HarborProgress } from './types'

const nearBeacon = () => {
  const state = snapshotFixture()
  state.players[0]!.z = state.beacon.z
  return state
}
function withProgress(progress: HarborProgress) {
  const state = nearBeacon(); state.harborProgress = progress; state.players[0]!.harborProgress = progress
  return state
}
describe('canonical original harbor projection', () => {
  it('requires complete exact beacon and own/peer progress, with null legacy counters', () => {
    const state = withProgress({ status: 'legacy-review-required', supplies: null, rewards: null })
    expect(isPlayerWorldSnapshot(state)).toBe(true)
    expect(isPlayerWorldSnapshot({ ...state, beacon: undefined })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...state, harborProgress: undefined })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...state, players: state.players.map(p => ({ ...p, harborProgress: undefined })) })).toBe(false)
    expect(isPlayerWorldSnapshot({ ...state, harborProgress: { status: 'ready', supplies: 1, rewards: 0 } })).toBe(false)
    for (const progress of [{ status: 'ready', supplies: null, rewards: 0 }, { status: 'ready', supplies: -1, rewards: 0 },
      { status: 'ready', supplies: 1, rewards: 0.1 }, { status: 'legacy-review-required', supplies: 0, rewards: 0 }, { status: ['ready'], supplies: 1, rewards: 0 }]) expect(isHarborProgress(progress)).toBe(false)
  })
  it('rejects invalid beacon identities, clocks, phases and duplicated/foreign reward claims', () => {
    const { beacon } = snapshotFixture()
    for (const change of [{ id: 'other' }, { tileId: 't_central' }, { x: NaN }, { radius: 0 }, { required: 1 },
      { tickMs: 5000 }, { tick: -1 }, { participationWindowTicks: 0 }, { closesAtTick: 1.2 }, { phase: ['gathering'] },
      { contributors: [1, 1] }, { contributors: ['1'] }, { awardedAccountIds: [1] }, { completed: true },
      { phase: 'collecting' }, { phase: 'completed', closesAtTick: 100, completed: false }]) expect(isHarborBeacon({ ...beacon, ...change })).toBe(false)
    const completed = { ...beacon, contributors: [1, 2], awardedAccountIds: [1, 2], closesAtTick: 300, tick: 300, completed: true, phase: 'completed' as const }
    expect(isHarborBeacon(completed)).toBe(true)
    for (const change of [{ tick: 299 }, { awardedAccountIds: [1] }, { contributors: [1], awardedAccountIds: [1] }]) expect(isHarborBeacon({ ...completed, ...change })).toBe(false)
    expect(isHarborBeacon({ ...beacon, contributors: [1, 2] })).toBe(false)
    const collecting = { ...beacon, phase: 'collecting', closesAtTick: 310, tick: 10, contributors: [1, 2] }
    expect(isHarborBeacon(collecting)).toBe(true)
    for (const change of [{ tick: 9 }, { tick: 310 }, { closesAtTick: 299 }, { contributors: [1] }, { awardedAccountIds: [1] }]) expect(isHarborBeacon({ ...collecting, ...change })).toBe(false)
    const state = nearBeacon(); state.beacon = completed
    expect(isPlayerWorldSnapshot(state)).toBe(false)
    state.players.forEach(p => { p.harborProgress = { status: 'ready', supplies: 0, rewards: 1 } }); state.harborProgress = state.players[0]!.harborProgress
    expect(isPlayerWorldSnapshot(state)).toBe(true)
  })
  it('uses the server beacon clock without an NPC/movement clock or local countdown', () => {
    const state = nearBeacon()
    expect(beaconRemainingSeconds(state)).toBeNull()
    state.beacon = { ...state.beacon, tick: 101, closesAtTick: 400, phase: 'collecting', contributors: [2] }
    expect(beaconRemainingSeconds(state)).toBe(30)
    state.worldTick = 999999; state.movementStep = 999999
    expect(beaconRemainingSeconds(state)).toBe(30)
    state.beacon.tick = 400; expect(beaconRemainingSeconds(state)).toBe(0)
    state.beacon.tick = 500; expect(beaconRemainingSeconds(state)).toBe(0)
  })
  it('allows one supply at the exact dock radius; closes on disconnect, foreign region and no supplies', () => {
    const state = nearBeacon()
    state.players[0]!.x = state.beacon.radius
    expect(harborContributionStatus(state, true).ready).toBe(true)
    expect(harborContributionStatus(state, false).ready).toBe(false)
    state.players[0]!.x += .01; expect(harborContributionStatus(state, true).ready).toBe(false)
    state.players[0]!.x = 0; state.players[0]!.online = false; expect(harborContributionStatus(state, true).ready).toBe(false)
    state.players[0]!.online = true; state.tileId = 't_central'; expect(harborContributionStatus(state, true).text).toContain('返回碼頭')
    expect(harborBeaconVisual(state)).toBeNull()
    expect(harborContributionStatus(withProgress({ status: 'ready', supplies: 0, rewards: 7 }), true).ready).toBe(false)
  })
  it('gates repeat/cutoff/completed contributions on authoritative facts', () => {
    const state = nearBeacon(); state.beacon.contributors = [1]
    expect(harborContributionStatus(state, true).text).toContain('已交付')
    state.beacon = { ...state.beacon, contributors: [2], closesAtTick: 10, tick: 10, phase: 'collecting' }
    expect(harborContributionStatus(state, true).text).toContain('截止')
    state.beacon = { ...state.beacon, contributors: [1, 2], completed: true, phase: 'completed', awardedAccountIds: [1] }
    expect(harborContributionStatus(state, true).text).toContain('徽記已由伺服器保存')
    expect(harborBeaconVisual(state)).toBe(state.beacon)
  })
  it('renders ready counters from the server and an explicit unresolved state without fabricated zeros', () => {
    const unresolved = withProgress({ status: 'legacy-review-required', supplies: null, rewards: null })
    const html = renderToStaticMarkup(<HarborBeaconPanel snapshot={unresolved} online client={null} stopMovement={() => {}} />)
    expect(html).toContain('舊港口進度待核實'); expect(html).toContain('帳號關聯待核實'); expect(html).toContain('disabled=""')
    expect(html).not.toContain('物資 0'); expect(html).not.toContain('潮汐徽記 0')
    expect(harborProgressText({ status: 'ready', supplies: 8, rewards: 4 })).toBe('物資 8 · 潮汐徽記 4')
    const ready = withProgress({ status: 'ready', supplies: 8, rewards: 4 })
    expect(renderToStaticMarkup(<HarborBeaconPanel snapshot={ready} online client={null} stopMovement={() => {}} />)).toContain('物資 8 · 潮汐徽記 4')
  })
})

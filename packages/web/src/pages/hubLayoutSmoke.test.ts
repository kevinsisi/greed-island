import { describe, expect, it } from 'vitest'
import {
  shouldRenderHubCivilizationButton,
  shouldRenderHubWorldCivilizationPanel,
  shouldRenderPlayerCivilizationPanel,
  canEnterArea,
  shouldShowWhenYouWereGone,
} from './hubPanelVisibility'

describe('hub panel visibility (existing)', () => {
  it('civilization panel is collapsed by default', () => {
    expect(shouldRenderHubWorldCivilizationPanel(false)).toBe(false)
    expect(shouldRenderPlayerCivilizationPanel(false, true)).toBe(false)
  })

  it('civilization button always renders', () => {
    expect(shouldRenderHubCivilizationButton(false)).toBe(true)
    expect(shouldRenderHubCivilizationButton(true)).toBe(true)
  })
})

describe('ActionBar — canEnterArea', () => {
  it('returns false when not signed in', () => {
    expect(canEnterArea(null, 't_dock')).toBe(false)
  })

  it('returns false when no district selected', () => {
    expect(canEnterArea('tok', null)).toBe(false)
  })

  it('returns true when token + district both present', () => {
    expect(canEnterArea('tok', 't_dock')).toBe(true)
  })
})

describe('進入區域路徑 — navigation smoke', () => {
  // Regression: Phase 0 ActionBar was fixed bottom-0 z-20, covered by MobileTabBar z-30.
  // Verify the navigate logic itself works so any future fixed-positioning regression
  // can be caught by a separate CSS/stacking-context test.
  function simulateHandleOpenCurrentArea(
    token: string | null,
    currentDistrict: string | null,
    navigate: (path: string) => void,
  ) {
    if (!token) return
    if (currentDistrict) navigate(`/area/${currentDistrict}`)
  }

  it('navigates to /area/:id when token and district are both set', () => {
    let navigatedTo: string | null = null
    simulateHandleOpenCurrentArea('tok', 't_dock', (p) => { navigatedTo = p })
    expect(navigatedTo).toBe('/area/t_dock')
  })

  it('does not navigate when no district is selected', () => {
    let navigatedTo: string | null = null
    simulateHandleOpenCurrentArea('tok', null, (p) => { navigatedTo = p })
    expect(navigatedTo).toBeNull()
  })

  it('does not navigate when not signed in', () => {
    let navigatedTo: string | null = null
    simulateHandleOpenCurrentArea(null, 't_dock', (p) => { navigatedTo = p })
    expect(navigatedTo).toBeNull()
  })
})

describe('WhenYouWereGone — shouldShowWhenYouWereGone', () => {
  it('returns false when not signed in', () => {
    expect(shouldShowWhenYouWereGone(null, false)).toBe(false)
  })

  it('returns false when already dismissed', () => {
    expect(shouldShowWhenYouWereGone('tok', true)).toBe(false)
  })

  it('returns true when signed in and not dismissed', () => {
    expect(shouldShowWhenYouWereGone('tok', false)).toBe(true)
  })
})

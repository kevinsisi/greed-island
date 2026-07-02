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

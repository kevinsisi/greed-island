import { describe, expect, it } from 'vitest'
import {
  shouldRenderHubCivilizationButton,
  shouldRenderHubWorldCivilizationPanel,
  shouldRenderPlayerCivilizationPanel,
} from './hubPanelVisibility'

describe('hub panel visibility', () => {
  it('keeps civilization/world-goal panels collapsed on initial hub render', () => {
    expect(shouldRenderHubWorldCivilizationPanel(false)).toBe(false)
    expect(shouldRenderPlayerCivilizationPanel(false, true)).toBe(false)
  })

  it('lets both guests and signed-in players open the civilization panel explicitly', () => {
    expect(shouldRenderHubCivilizationButton(false)).toBe(true)
    expect(shouldRenderHubCivilizationButton(true)).toBe(true)
    expect(shouldRenderHubWorldCivilizationPanel(true)).toBe(true)
    expect(shouldRenderPlayerCivilizationPanel(true, true)).toBe(true)
    expect(shouldRenderPlayerCivilizationPanel(true, false)).toBe(false)
  })
})

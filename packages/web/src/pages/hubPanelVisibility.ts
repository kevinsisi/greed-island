export function shouldRenderHubCivilizationButton(_isSignedIn: boolean): boolean {
  return true
}

export function shouldRenderHubWorldCivilizationPanel(showCivPanel: boolean): boolean {
  return showCivPanel
}

export function shouldRenderPlayerCivilizationPanel(showCivPanel: boolean, isSignedIn: boolean): boolean {
  return showCivPanel && isSignedIn
}

/** ActionBar: the enter-area button is active only when signed in and a district is selected. */
export function canEnterArea(accountId: number | null, districtId: string | null): boolean {
  return !!accountId && !!districtId
}

/** WhenYouWereGone: the card mount guard — signed-in and not yet dismissed this session. */
export function shouldShowWhenYouWereGone(accountId: number | null, dismissed: boolean): boolean {
  return !!accountId && !dismissed
}

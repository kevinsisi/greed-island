export function shouldRenderHubCivilizationButton(_isSignedIn: boolean): boolean {
  return true
}

export function shouldRenderHubWorldCivilizationPanel(showCivPanel: boolean): boolean {
  return showCivPanel
}

export function shouldRenderPlayerCivilizationPanel(showCivPanel: boolean, isSignedIn: boolean): boolean {
  return showCivPanel && isSignedIn
}

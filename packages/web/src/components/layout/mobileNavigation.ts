const PRIMARY_PATHS = ['/game', '/game/codex', '/game/timeline', '/game/ecology'] as const

type Item = { to: string; icon: string }

/** Keep the guest account alias out of the four primary tabs. */
export function mobileNavigation<T extends Item>(items: T[], pathname: string) {
  const primaryItems = PRIMARY_PATHS.flatMap(path => {
    const item = items.find(candidate => candidate.to === path && candidate.icon !== 'account')
    return item ? [item] : []
  })
  const profileItem = items.find(item => item.to === '/game/profile')
    ?? items.find(item => item.to === '/game' && item.icon === 'account')
  const overflowItems = items.filter(item => !primaryItems.includes(item) && item !== profileItem)
  const hasOverflow = overflowItems.length > 0
  const moreItems = hasOverflow ? [...(profileItem ? [profileItem] : []), ...overflowItems] : []
  // A shared /game prefix must not highlight More on unrelated primary routes.
  const moreActive = moreItems.some(item => item.to === pathname)
  return { primaryItems, profileItem, hasOverflow, moreItems, moreActive }
}

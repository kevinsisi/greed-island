/** Old bookmarks remain aliases for views inside the one canonical game. */
export const LEGACY_GAME_PATHS = ['profile', 'codex', 'timeline', 'social', 'ecology', 'market', 'properties', 'settings', 'admin', 'area', 'building'] as const
export function canonicalGamePath(pathname: string): string | null {
  if (pathname === '/' || pathname === '/account' || pathname === '/prototype-3d' || pathname === '/multiplayer-3d') return '/game'
  if (pathname === '/forgot-password') return '/game/forgot-password'
  if (pathname === '/reset-password') return '/reset-password'
  const first = pathname.split('/')[1]
  return LEGACY_GAME_PATHS.some(path => path === first) ? `/game${pathname}` : null
}

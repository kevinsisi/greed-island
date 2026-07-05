// Consistent line-icon set (24×24, currentColor, stroke 1.6) replacing the
// Unicode-glyph placeholders that read as "unfinished". One stroke style across
// the whole nav so the chrome looks intentionally designed.

export type IconName =
  | 'hub'
  | 'codex'
  | 'timeline'
  | 'ecology'
  | 'market'
  | 'social'
  | 'profile'
  | 'account'
  | 'gmWorld'
  | 'admin'
  | 'settings'
  | 'more'
  | 'properties'

const PATHS: Record<IconName, JSX.Element> = {
  // compass — the hub / world map
  hub: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" />
    </>
  ),
  // stacked cards — the codex
  codex: (
    <>
      <rect x="4" y="5" width="11" height="14" rx="1" />
      <path d="M8 5 17 7v12" />
      <path d="M7 9h5M7 12h5" />
    </>
  ),
  // clock — the timeline / chronicle
  timeline: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  // leaf — ecology
  ecology: (
    <>
      <path d="M5 19c0-7 5-12 14-13 0 9-5 14-13 14-1 0-1-1-1-1z" />
      <path d="M9 15c2-2 4-3 7-4" />
    </>
  ),
  // price tag — the market
  market: (
    <>
      <path d="M4 11.5 11.5 4H19a1 1 0 0 1 1 1v7.5L12.5 20a1.5 1.5 0 0 1-2 0l-6.5-6.5a1.5 1.5 0 0 1 0-2z" />
      <circle cx="15.5" cy="8.5" r="1.2" />
    </>
  ),
  // speech bubbles — social
  social: (
    <>
      <path d="M4 6h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9l-4 3v-3a1 1 0 0 1-1-1z" />
      <path d="M18 9h2a1 1 0 0 1 1 1v5l-2-1.5" />
    </>
  ),
  // user — profile
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  // key — account / sign-in
  account: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H20M17 12v3M20 12v2.5" />
    </>
  ),
  // globe — GM world tools
  gmWorld: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
    </>
  ),
  // shield + star — admin
  admin: (
    <>
      <path d="M12 3 19 6v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="m12 9 1 2 2 .2-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 11.2 11 11z" />
    </>
  ),
  // gear — settings
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" />
    </>
  ),
  // overflow — more
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  properties: (
    <>
      <path d="M4 21V9l8-6 8 6v12H4Z" />
      <path d="M9 21V13h6v8" />
    </>
  ),
}

export function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: IconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

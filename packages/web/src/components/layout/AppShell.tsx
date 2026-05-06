import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useDeviceTier } from '../../state/deviceTier'
import { useWorldState } from '../../state/WorldStateContext'
import { useI18n } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { APP_VERSION } from '../../version'

interface NavItem {
  to: string
  labelKey: TranslationKey
  descKey: TranslationKey
  glyph: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',       labelKey: 'nav.dashboard', descKey: 'nav.dashboard.desc', glyph: '◆' },
  { to: '/since',  labelKey: 'nav.since',     descKey: 'nav.since.desc',     glyph: '↺' },
  { to: '/map',    labelKey: 'nav.map',       descKey: 'nav.map.desc',       glyph: '▲' },
  { to: '/npcs',   labelKey: 'nav.npcs',      descKey: 'nav.npcs.desc',      glyph: '◇' },
  { to: '/events', labelKey: 'nav.events',    descKey: 'nav.events.desc',    glyph: '≡' },
  { to: '/cards',  labelKey: 'nav.cards',     descKey: 'nav.cards.desc',     glyph: '☷' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { tier, override, setOverride } = useDeviceTier()
  const { world, liveConnected, source } = useWorldState()

  return (
    <div className="min-h-full flex flex-col bg-ground-900 text-ground-100">
      <TopBar
        tick={world.tick}
        liveConnected={liveConnected}
        source={source}
        tier={tier}
        override={override}
        onOverride={setOverride}
      />

      <div className="flex-1 flex flex-col lg:flex-row">
        {tier === 'desktop' && <DesktopRail />}

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 pt-4 lg:pt-8 pb-32 lg:pb-12">
          {children}
        </main>
      </div>

      {tier === 'mobile' && <MobileTabBar />}

      <Footer tier={tier} />
    </div>
  )
}

function TopBar(props: {
  tick: number
  liveConnected: boolean
  source: 'fixture' | 'server'
  tier: 'mobile' | 'desktop'
  override: 'mobile' | 'desktop' | null
  onOverride: (tier: 'mobile' | 'desktop' | null) => void
}) {
  const { tick, liveConnected, source, tier, override, onOverride } = props
  const { t } = useI18n()
  const otherTier = tier === 'mobile' ? 'desktop' : 'mobile'
  const otherSurfaceLabel = t(otherTier === 'mobile' ? 'status.surface.mobile' : 'status.surface.desktop')

  return (
    <header className="sticky top-0 z-20 border-b border-ground-700 bg-ground-900/95 backdrop-blur supports-[backdrop-filter]:bg-ground-900/70">
      <div className="px-4 sm:px-6 lg:px-10 h-14 flex items-center gap-3">
        <BrandMark />
        <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[11px] font-display uppercase tracking-tightest text-ground-400 truncate">
          <span className="text-ember-500">{t('status.tick', { tick: tick.toLocaleString() })}</span>
          <span className="text-ground-600">·</span>
          <span className={liveConnected ? 'text-moss-400' : 'text-ground-500'}>
            {liveConnected ? t('status.live') : t('status.idle')}
          </span>
          {source === 'fixture' && (
            <>
              <span className="text-ground-600">·</span>
              <span className="text-rust-500">{t('status.fixture')}</span>
            </>
          )}
        </div>
        <LanguageToggle />
        <button
          type="button"
          onClick={() => onOverride(override === otherTier ? null : otherTier)}
          className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-300 border border-ground-700 hover:border-ember-600 hover:text-ember-400 transition-colors rounded-sharp"
        >
          {t('status.switchTo', { surface: otherSurfaceLabel })}
        </button>
      </div>
    </header>
  )
}

function LanguageToggle() {
  const { locale, setLocale, supportedLocales, localeLabel, t } = useI18n()
  return (
    <div
      className="hidden sm:inline-flex items-center border border-ground-700 rounded-sharp overflow-hidden"
      role="group"
      aria-label={t('language.label')}
    >
      {supportedLocales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc)}
          aria-pressed={loc === locale}
          className={[
            'gi-touch px-3 text-[11px] font-display uppercase tracking-tightest transition-colors',
            loc === locale
              ? 'bg-ember-500/10 text-ember-400'
              : 'text-ground-400 hover:text-ground-100',
          ].join(' ')}
        >
          {loc === 'zh' ? '中' : 'EN'}
          <span className="sr-only">{localeLabel[loc]}</span>
        </button>
      ))}
    </div>
  )
}

function BrandMark() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-6 w-6">
        <path
          d="M6 22 L16 6 L26 22 Z"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.5"
          strokeLinejoin="miter"
        />
        <circle cx="16" cy="18" r="2" fill="#f59e0b" />
      </svg>
      <div className="leading-none">
        <div className="font-display font-extrabold tracking-tightest text-ground-100 text-[15px]">
          {t('brand.title')}
        </div>
        <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
          {t('brand.subtitle')}
        </div>
      </div>
    </div>
  )
}

function DesktopRail() {
  const { t } = useI18n()
  return (
    <nav className="hidden lg:flex flex-col w-56 shrink-0 border-r border-ground-800 bg-ground-900 px-3 py-6 gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            [
              'group flex items-start gap-3 px-3 py-2.5 rounded-sharp border transition-colors',
              isActive
                ? 'border-ember-600/60 bg-ember-500/5 text-ember-400'
                : 'border-transparent text-ground-300 hover:bg-ground-800 hover:text-ground-100',
            ].join(' ')
          }
        >
          <span className="font-display text-base leading-none mt-0.5">{item.glyph}</span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{t(item.labelKey)}</span>
            <span className="text-[11px] text-ground-500">{t(item.descKey)}</span>
          </span>
        </NavLink>
      ))}
      <div className="mt-auto pt-6 text-[10px] font-display uppercase tracking-tightest text-ground-600">
        v{APP_VERSION} · {t('footer.tagline')}
      </div>
    </nav>
  )
}

function MobileTabBar() {
  const { t } = useI18n()
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ground-800 bg-ground-900/95 backdrop-blur">
      <ul className="grid grid-cols-6">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'gi-touch flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors',
                  isActive ? 'text-ember-400' : 'text-ground-400 hover:text-ground-100',
                ].join(' ')
              }
            >
              <span className="font-display text-base leading-none">{item.glyph}</span>
              <span className="text-[10px] font-display uppercase tracking-tightest">
                {t(item.labelKey)}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Footer({ tier }: { tier: 'mobile' | 'desktop' }) {
  const { t } = useI18n()
  if (tier === 'mobile') return null
  return (
    <footer className="hidden lg:block border-t border-ground-800 bg-ground-900 px-10 py-3 text-[11px] font-display uppercase tracking-tightest text-ground-600 flex-row justify-between">
      <span>{t('footer.tagline')}</span>
      <span className="ml-auto float-right">v{APP_VERSION}</span>
    </footer>
  )
}

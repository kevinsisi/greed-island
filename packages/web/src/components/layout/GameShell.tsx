import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext'
import { useI18n, type TranslationKey } from '../../i18n'
import { AtmosphereBar } from '../game/AtmosphereBar'
import { EventTicker, EventTickerStrip } from '../game/EventTicker'
import { WorldEventsBanner } from '../game/WorldEventsBanner'
import { APP_VERSION } from '../../version'

interface NavItem {
  to: string
  labelKey: TranslationKey
  glyph: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',         labelKey: 'nav.hub',      glyph: '◈' },
  { to: '/codex',    labelKey: 'nav.codex',    glyph: '☷' },
  { to: '/timeline', labelKey: 'nav.timeline', glyph: '≡' },
  { to: '/account',  labelKey: 'nav.account',  glyph: '◐' }
]

export function GameShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col bg-ground-900 text-ground-100">
      <Brandbar />
      <AtmosphereBar />
      <WorldEventsBanner />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <DesktopRail />

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 pt-5 lg:pt-8 pb-32 lg:pb-12">
          {children}
        </main>

        <EventTicker />
      </div>

      <EventTickerStrip />
      <MobileTabBar />
      <DesktopFooter />
    </div>
  )
}

function Brandbar() {
  const { t } = useI18n()
  const { account } = useAuth()
  return (
    <header className="sticky top-0 z-20 border-b border-ground-800 bg-ground-900/95 backdrop-blur supports-[backdrop-filter]:bg-ground-900/70">
      <div className="px-4 sm:px-6 lg:px-10 h-14 flex items-center gap-3">
        <BrandMark />
        <div className="flex-1" />
        <LanguageToggle />
        <NavLink
          to="/account"
          className={({ isActive }) =>
            [
              'gi-touch px-3 hidden sm:inline-flex items-center text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
              isActive
                ? 'border-ember-600 text-ember-400 bg-ember-500/5'
                : account
                  ? 'border-moss-600 text-moss-400 hover:bg-moss-500/10'
                  : 'border-ground-700 text-ground-300 hover:border-ember-600 hover:text-ember-400'
            ].join(' ')
          }
        >
          {account ? account.email.split('@')[0] : t('account.signin')}
        </NavLink>
      </div>
    </header>
  )
}

function BrandMark() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="16" r="13" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        <path
          d="M4 18 Q10 12 16 18 T28 18"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M4 22 Q10 16 16 22 T28 22"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
      <div className="leading-none">
        <div className="font-display font-extrabold tracking-tightest text-ground-100 text-[16px]">
          {t('brand.title')}
        </div>
        <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
          {t('brand.subtitle')}
        </div>
      </div>
    </div>
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
              : 'text-ground-400 hover:text-ground-100'
          ].join(' ')}
        >
          {loc === 'zh' ? '中' : 'EN'}
          <span className="sr-only">{localeLabel[loc]}</span>
        </button>
      ))}
    </div>
  )
}

function DesktopRail() {
  const { t } = useI18n()
  return (
    <nav className="hidden lg:flex flex-col w-48 shrink-0 border-r border-ground-800 bg-ground-900 px-3 py-6 gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            [
              'group flex items-center gap-3 px-3 py-3 rounded-sharp border transition-colors',
              isActive
                ? 'border-ember-600/60 bg-ember-500/5 text-ember-400'
                : 'border-transparent text-ground-300 hover:bg-ground-800 hover:text-ground-100'
            ].join(' ')
          }
        >
          <span className="font-display text-lg leading-none">{item.glyph}</span>
          <span className="text-sm font-medium">{t(item.labelKey)}</span>
        </NavLink>
      ))}
      <div className="mt-auto pt-6 text-[10px] font-display uppercase tracking-tightest text-ground-600">
        v{APP_VERSION}
      </div>
    </nav>
  )
}

function MobileTabBar() {
  const { t } = useI18n()
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ground-800 bg-ground-900/95 backdrop-blur">
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'gi-touch flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors',
                  isActive ? 'text-ember-400' : 'text-ground-400 hover:text-ground-100'
                ].join(' ')
              }
            >
              <span className="font-display text-lg leading-none">{item.glyph}</span>
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

function DesktopFooter() {
  const { t } = useI18n()
  return (
    <footer className="hidden lg:flex border-t border-ground-800 bg-ground-900 px-10 py-3 text-[11px] font-display uppercase tracking-tightest text-ground-600 items-center justify-between">
      <span>{t('footer.tagline')}</span>
      <span>v{APP_VERSION}</span>
    </footer>
  )
}

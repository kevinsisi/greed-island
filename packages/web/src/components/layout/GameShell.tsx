import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext'
import { useI18n, type TranslationKey } from '../../i18n'
import { AtmosphereBar } from '../game/AtmosphereBar'
import { EventTicker, EventTickerStrip } from '../game/EventTicker'
import { WorldEventsBanner } from '../game/WorldEventsBanner'
import { Avatar } from '../common/Avatar'
import { APP_VERSION } from '../../version'
import { api, type ServerAccount } from '../../api/client'

interface NavItem {
  to: string
  labelKey: TranslationKey
  glyph: string
  visibleWhen?: (account: ServerAccount | null) => boolean
}

// Three nav buckets are split by audience:
//   /profile  every signed-in player (nickname / avatar / password / language)
//   /settings GM + admin only (manage Gemini API keys)
//   /admin    admin only (role management + issue password resets)
// /account is the gate for guests and the sign-in / sign-out hub.
const NAV_ITEMS: NavItem[] = [
  { to: '/',         labelKey: 'nav.hub',      glyph: '◈' },
  { to: '/codex',    labelKey: 'nav.codex',    glyph: '☷' },
  { to: '/timeline', labelKey: 'nav.timeline', glyph: '≡' },
  { to: '/social',   labelKey: 'nav.social',   glyph: '☍' },
  {
    to: '/profile',
    labelKey: 'nav.profile',
    glyph: '◑',
    visibleWhen: (account) => account !== null,
  },
  {
    to: '/account',
    labelKey: 'nav.account',
    glyph: '◐',
    visibleWhen: (account) => account === null,
  },
  {
    to: '/admin',
    labelKey: 'nav.admin',
    glyph: '✶',
    visibleWhen: (account) => account?.role === 'admin',
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    glyph: '⚙',
    visibleWhen: (account) => account?.role === 'gm' || account?.role === 'admin',
  },
]

function visibleNavItems(account: ServerAccount | null): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.visibleWhen || item.visibleWhen(account))
}

export function GameShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col bg-ground-900 text-ground-100">
      <Brandbar />
      <AtmosphereBar />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <DesktopRail />

        {/* 行動裝置底部從上到下：WorldEventsBanner (預設收合) + EventTickerStrip
            (fixed bottom-[60px], ~36px) + MobileTabBar (fixed bottom-0, ~56px)。
            main 必須留至少 ~96px padding，才能完整捲到底不被遮。pb-28 = 112px。
            v0.9.1：WorldEventsBanner 從「main 上面」搬到「main 下面」，地圖
            才是主要視覺空間。 */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 pt-5 lg:pt-8 pb-28 lg:pb-12">
          {children}
          <div className="mt-4">
            <WorldEventsBanner />
          </div>
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
        <VersionTag />
        <div className="flex-1" />
        <LanguageToggle />
        <NavLink
          to={account ? '/profile' : '/account'}
          className={({ isActive }) =>
            [
              'gi-touch px-3 hidden sm:inline-flex items-center gap-2 text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
              isActive
                ? 'border-ember-600 text-ember-400 bg-ember-500/5'
                : account
                  ? 'border-moss-600 text-moss-400 hover:bg-moss-500/10'
                  : 'border-ground-700 text-ground-300 hover:border-ember-600 hover:text-ember-400'
            ].join(' ')
          }
        >
          {account ? (
            <>
              <Avatar avatar={account.avatar} size="sm" />
              <span className="truncate max-w-[8rem]">{account.displayName}</span>
            </>
          ) : (
            t('account.signin')
          )}
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

function useServerVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .version()
      .then((res) => {
        if (!cancelled) setVersion(res.version)
      })
      .catch(() => {
        // server unreachable — fall back to bundled APP_VERSION
      })
    return () => {
      cancelled = true
    }
  }, [])
  return version
}

function VersionTag() {
  const serverVersion = useServerVersion()
  const display = serverVersion ?? APP_VERSION
  const mismatched = serverVersion !== null && serverVersion !== APP_VERSION
  return (
    <span
      title={mismatched ? `client v${APP_VERSION} ↔ server v${serverVersion}` : `v${display}`}
      className={[
        'font-display text-[10px] uppercase tracking-tightest',
        mismatched ? 'text-rust-400' : 'text-ground-600'
      ].join(' ')}
    >
      v{display}
      {mismatched && <span className="ml-1 text-rust-400">·!</span>}
    </span>
  )
}

function DesktopRail() {
  const { t } = useI18n()
  const { account } = useAuth()
  const items = visibleNavItems(account ?? null)
  return (
    <nav className="hidden lg:flex flex-col w-48 shrink-0 border-r border-ground-800 bg-ground-900 px-3 py-6 gap-1">
      {items.map((item) => (
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
      <div className="mt-auto pt-6">
        <VersionTag />
      </div>
    </nav>
  )
}

function MobileTabBar() {
  const { t } = useI18n()
  const { account } = useAuth()
  const items = visibleNavItems(account ?? null)
  // Cap mobile nav at 5 columns to keep tap targets large enough; admin
  // users see /admin and /settings via the profile/account page when the
  // list overflows.
  const visible = items.slice(0, 5)
  const colsClass =
    visible.length === 4 ? 'grid-cols-4' : visible.length === 5 ? 'grid-cols-5' : 'grid-cols-6'
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ground-800 bg-ground-900/95 backdrop-blur">
      <ul className={`grid ${colsClass}`}>
        {visible.map((item) => (
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
      <VersionTag />
    </footer>
  )
}

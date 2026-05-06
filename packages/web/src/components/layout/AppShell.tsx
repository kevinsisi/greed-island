import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useDeviceTier } from '../../state/deviceTier'
import { useWorldState } from '../../state/WorldStateContext'
import { APP_VERSION } from '../../version'

interface NavItem {
  to: string
  label: string
  glyph: string
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '總覽', glyph: '◆', description: '世界當前的脈搏' },
  { to: '/since', label: '回顧', glyph: '↺', description: '你不在的時候發生了什麼' },
  { to: '/map', label: '地圖', glyph: '▲', description: '島嶼空間與駐點' },
  { to: '/npcs', label: 'NPC', glyph: '◇', description: '島民、信任與意圖' },
  { to: '/events', label: '事件', glyph: '≡', description: '世界的時間軸' },
  { to: '/cards', label: '卡片', glyph: '☷', description: '一百張的收藏' },
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
  const otherTier = tier === 'mobile' ? 'desktop' : 'mobile'
  const otherLabel = otherTier === 'mobile' ? '輕量模式' : '深度模式'

  return (
    <header className="sticky top-0 z-20 border-b border-ground-700 bg-ground-900/95 backdrop-blur supports-[backdrop-filter]:bg-ground-900/70">
      <div className="px-4 sm:px-6 lg:px-10 h-14 flex items-center gap-3">
        <BrandMark />
        <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[11px] font-display uppercase tracking-tightest text-ground-400 truncate">
          <span className="text-ember-500">TICK {tick.toLocaleString()}</span>
          <span className="text-ground-600">·</span>
          <span className={liveConnected ? 'text-moss-400' : 'text-ground-500'}>
            {liveConnected ? 'LIVE · SSE' : 'IDLE · waiting on /api/events/stream'}
          </span>
          {source === 'fixture' && (
            <>
              <span className="text-ground-600">·</span>
              <span className="text-rust-500">FIXTURE</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOverride(override === otherTier ? null : otherTier)}
          className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-300 border border-ground-700 hover:border-ember-600 hover:text-ember-400 transition-colors rounded-sharp"
        >
          切到 {otherLabel}
        </button>
      </div>
    </header>
  )
}

function BrandMark() {
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
          貪婪之島
        </div>
        <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
          Greed Island
        </div>
      </div>
    </div>
  )
}

function DesktopRail() {
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
            <span className="text-sm font-medium">{item.label}</span>
            <span className="text-[11px] text-ground-500">{item.description}</span>
          </span>
        </NavLink>
      ))}
      <div className="mt-auto pt-6 text-[10px] font-display uppercase tracking-tightest text-ground-600">
        v{APP_VERSION} · OBSERVATION CLIENT
      </div>
    </nav>
  )
}

function MobileTabBar() {
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
                {item.label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Footer({ tier }: { tier: 'mobile' | 'desktop' }) {
  if (tier === 'mobile') return null
  return (
    <footer className="hidden lg:block border-t border-ground-800 bg-ground-900 px-10 py-3 text-[11px] font-display uppercase tracking-tightest text-ground-600 flex-row justify-between">
      <span>greed-island · observation client</span>
      <span className="ml-auto float-right">v{APP_VERSION}</span>
    </footer>
  )
}

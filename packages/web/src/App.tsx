import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './state/AuthContext'
import { WorldStateProvider } from './state/WorldStateContext'
import { I18nProvider } from './i18n'
import { GameShell } from './components/layout/GameShell'
import { canonicalGamePath } from './state/gameRoutes'

const GamePage = lazy(() => import('./multiplayer3d/Multiplayer3DPage'))
const ResetPasswordPage = lazy(() => import('./multiplayer3d/ResetPasswordPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })))
const HubPage = lazy(() => import('./pages/HubPage').then(module => ({ default: module.HubPage })))
const AreaPage = lazy(() => import('./pages/AreaPage').then(module => ({ default: module.AreaPage })))
const BuildingPage = lazy(() => import('./pages/BuildingPage').then(module => ({ default: module.BuildingPage })))
const CodexPage = lazy(() => import('./pages/CodexPage').then(module => ({ default: module.CodexPage })))
const TimelinePage = lazy(() => import('./pages/TimelinePage').then(module => ({ default: module.TimelinePage })))
const SocialPage = lazy(() => import('./pages/SocialPage').then(module => ({ default: module.SocialPage })))
const EcologyPage = lazy(() => import('./pages/EcologyPage').then(module => ({ default: module.EcologyPage })))
const MarketPage = lazy(() => import('./pages/MarketPage').then(module => ({ default: module.MarketPage })))
const PropertiesPage = lazy(() => import('./pages/PropertyBrowserPage').then(module => ({ default: module.PropertyBrowserPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })))
const AdminWorldPage = lazy(() => import('./pages/AdminWorldPage').then(module => ({ default: module.AdminWorldPage })))
const AdminNpcsPage = lazy(() => import('./pages/AdminNpcsPage').then(module => ({ default: module.AdminNpcsPage })))
const AdminLineagePage = lazy(() => import('./pages/AdminLineagePage').then(module => ({ default: module.AdminLineagePage })))
const AdminCardsPage = lazy(() => import('./pages/AdminCardsPage').then(module => ({ default: module.AdminCardsPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(module => ({ default: module.ForgotPasswordPage })))

function AccountView({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-ground-900 text-ground-100 p-5 flex flex-col gap-5"><nav className="flex flex-wrap gap-4"><Link to="/game">共同世界</Link><Link to="/game/profile">個人資料</Link><Link to="/game/admin">帳號管理</Link></nav>{children}</main>
}
function WorldView({ children }: { children: ReactNode }) { return <WorldStateProvider><GameShell>{children}</GameShell></WorldStateProvider> }
function MissingView() { return <main className="gi-panel p-5"><p>找不到這個頁面。</p><Link to="/game">返回共同世界</Link></main> }
function ExistingAlias() { const location = useLocation(); const path = canonicalGamePath(location.pathname); return path ? <Navigate to={path + location.search + location.hash} replace /> : <MissingView /> }
function GameRoutes() {
  return <Routes>
    <Route index element={<GamePage />} />
    <Route path="account" element={<Navigate to="/game" replace />} />
    <Route path="profile" element={<AccountView><ProfilePage /></AccountView>} />
    <Route path="admin" element={<AccountView><AdminPage /></AccountView>} />
    <Route path="forgot-password" element={<AccountView><ForgotPasswordPage /></AccountView>} />
    <Route path="hub" element={<WorldView><HubPage /></WorldView>} />
    <Route path="area/:tileId" element={<WorldView><AreaPage /></WorldView>} />
    <Route path="building/:buildingId" element={<WorldView><BuildingPage /></WorldView>} />
    <Route path="codex" element={<WorldView><CodexPage /></WorldView>} />
    <Route path="timeline" element={<WorldView><TimelinePage /></WorldView>} />
    <Route path="social" element={<WorldView><SocialPage /></WorldView>} />
    <Route path="ecology" element={<WorldView><EcologyPage /></WorldView>} />
    <Route path="market" element={<WorldView><MarketPage /></WorldView>} />
    <Route path="properties" element={<WorldView><PropertiesPage /></WorldView>} />
    <Route path="settings" element={<AccountView><SettingsPage /></AccountView>} />
    <Route path="admin/world" element={<WorldView><AdminWorldPage /></WorldView>} />
    <Route path="admin/npcs" element={<AccountView><AdminNpcsPage /></AccountView>} />
    <Route path="admin/lineage" element={<AccountView><AdminLineagePage /></AccountView>} />
    <Route path="admin/cards" element={<AccountView><AdminCardsPage /></AccountView>} />
    <Route path="*" element={<MissingView />} />
  </Routes>
}

/** One cookie/provider/player connection; historical feature URLs remain exact aliases. */
export function App() {
  return <Suspense fallback={<div role="status">正在載入貪婪之島…</div>}><Routes>
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/game/*" element={<AuthProvider><I18nProvider><GameRoutes /></I18nProvider></AuthProvider>} />
    <Route path="*" element={<ExistingAlias />} />
  </Routes></Suspense>
}

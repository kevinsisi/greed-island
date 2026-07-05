import { Navigate, Route, Routes } from 'react-router-dom'
import { GameShell } from './components/layout/GameShell'
import { WorldStateProvider } from './state/WorldStateContext'
import { AuthProvider } from './state/AuthContext'
import { I18nProvider } from './i18n'
import { HubPage } from './pages/HubPage'
import { AreaPage } from './pages/AreaPage'
import { BuildingPage } from './pages/BuildingPage'
import { CodexPage } from './pages/CodexPage'
import { TimelinePage } from './pages/TimelinePage'
import { AccountPage } from './pages/AccountPage'
import { ProfilePage } from './pages/ProfilePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SettingsPage } from './pages/SettingsPage'
import { SocialPage } from './pages/SocialPage'
import { AdminPage } from './pages/AdminPage'
import { AdminNpcsPage } from './pages/AdminNpcsPage'
import { AdminLineagePage } from './pages/AdminLineagePage'
import { AdminWorldPage } from './pages/AdminWorldPage'
import { AdminCardsPage } from './pages/AdminCardsPage'
import { EcologyPage } from './pages/EcologyPage'
import { MarketPage } from './pages/MarketPage'
import { PropertyBrowserPage } from './pages/PropertyBrowserPage'

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <WorldStateProvider>
          <GameShell>
            <Routes>
              <Route path="/" element={<HubPage />} />
              <Route path="/area/:tileId" element={<AreaPage />} />
              <Route path="/building/:buildingId" element={<BuildingPage />} />
              <Route path="/codex" element={<CodexPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/social" element={<SocialPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/ecology" element={<EcologyPage />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/properties" element={<PropertyBrowserPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/world" element={<AdminWorldPage />} />
              <Route path="/admin/npcs" element={<AdminNpcsPage />} />
              <Route path="/admin/lineage" element={<AdminLineagePage />} />
              <Route path="/admin/cards" element={<AdminCardsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </GameShell>
        </WorldStateProvider>
      </AuthProvider>
    </I18nProvider>
  )
}

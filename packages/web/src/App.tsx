import { Navigate, Route, Routes } from 'react-router-dom'
import { GameShell } from './components/layout/GameShell'
import { WorldStateProvider } from './state/WorldStateContext'
import { AuthProvider } from './state/AuthContext'
import { I18nProvider } from './i18n'
import { HubPage } from './pages/HubPage'
import { AreaPage } from './pages/AreaPage'
import { CodexPage } from './pages/CodexPage'
import { TimelinePage } from './pages/TimelinePage'
import { AccountPage } from './pages/AccountPage'

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <WorldStateProvider>
          <GameShell>
            <Routes>
              <Route path="/" element={<HubPage />} />
              <Route path="/area/:tileId" element={<AreaPage />} />
              <Route path="/codex" element={<CodexPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </GameShell>
        </WorldStateProvider>
      </AuthProvider>
    </I18nProvider>
  )
}

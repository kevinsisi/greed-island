import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { WorldStateProvider } from './state/WorldStateContext'
import { DashboardPage } from './pages/DashboardPage'
import { MapPage } from './pages/MapPage'
import { NpcsPage } from './pages/NpcsPage'
import { EventsPage } from './pages/EventsPage'
import { CardsPage } from './pages/CardsPage'
import { SinceLastVisitPage } from './pages/SinceLastVisitPage'

export function App() {
  return (
    <WorldStateProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/since" element={<SinceLastVisitPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/npcs" element={<NpcsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </WorldStateProvider>
  )
}

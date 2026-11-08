import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useFamily } from './store/useFamily'
import { canManage, isActive } from './lib/permissions'
import { AppShell } from './components/layout/AppShell'
import { Toaster } from './components/ui'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'

const HomePage = lazy(() => import('./pages/HomePage'))
const TreePage = lazy(() => import('./pages/TreePage'))
const ListPage = lazy(() => import('./pages/ListPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const PersonPage = lazy(() => import('./pages/PersonPage'))
const PersonEditPage = lazy(() => import('./pages/PersonEditPage'))
const KinshipPage = lazy(() => import('./pages/KinshipPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const RemindersPage = lazy(() => import('./pages/RemindersPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const MyRequestsPage = lazy(() => import('./pages/MyRequestsPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const AdminRoutes = lazy(() => import('./pages/admin'))

function Splash() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
    </div>
  )
}

function RequireUser({ children }: { children: ReactNode }) {
  const user = useFamily((s) => s.user)
  const loc = useLocation()
  if (!user) return <Navigate to="/giris" replace state={{ from: loc.pathname + loc.search }} />
  if (!isActive(user)) return <Navigate to="/bekleme" replace />
  return <>{children}</>
}

function RequireManager({ children }: { children: ReactNode }) {
  const user = useFamily((s) => s.user)
  if (!canManage(user)) return <Navigate to="/" replace />
  return <>{children}</>
}

// Embedded builds (no real URL bar) keep routes in memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

export default function App() {
  const ready = useFamily((s) => s.ready)
  const init = useFamily((s) => s.init)
  useEffect(() => {
    void init()
  }, [init])
  if (!ready) return <Splash />
  return (
    <Router basename={import.meta.env.VITE_ROUTER === 'memory' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <Toaster />
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/giris" element={<LoginPage />} />
          <Route path="/bekleme" element={<PendingPage />} />
          <Route
            element={
              <RequireUser>
                <AppShell />
              </RequireUser>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="agac" element={<TreePage />} />
            <Route path="liste" element={<ListPage />} />
            <Route path="ara" element={<SearchPage />} />
            <Route path="kisi/:id" element={<PersonPage />} />
            <Route path="kisi/:id/duzenle" element={<PersonEditPage />} />
            <Route path="yeni" element={<PersonEditPage />} />
            <Route path="akrabalik" element={<KinshipPage />} />
            <Route path="zaman" element={<TimelinePage />} />
            <Route path="harita" element={<MapPage />} />
            <Route path="hatirlatici" element={<RemindersPage />} />
            <Route path="istatistik" element={<StatsPage />} />
            <Route path="bildirimler" element={<NotificationsPage />} />
            <Route path="taleplerim" element={<MyRequestsPage />} />
            <Route path="hesap" element={<AccountPage />} />
            <Route
              path="admin/*"
              element={
                <RequireManager>
                  <AdminRoutes />
                </RequireManager>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

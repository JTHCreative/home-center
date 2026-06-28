import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar, { MobileTopBar } from './components/Sidebar.jsx'
import { MenuIcon } from './components/Icons.jsx'
import { readStored, writeStored } from './lib/storage.js'
// In-app on-screen keyboard — disabled for now while running on iPad (the
// device provides its own native keyboard). Re-mount <VirtualKeyboard /> below
// to bring it back for a kiosk display with no native keyboard.
// import VirtualKeyboard from './components/VirtualKeyboard.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SmartHome from './pages/SmartHome.jsx'
import Stocks from './pages/Stocks.jsx'
import Calendar from './pages/Calendar.jsx'
import Meals from './pages/Meals.jsx'
import Goals from './pages/Goals.jsx'
import Settings from './pages/Settings.jsx'
import Alarms from './pages/Alarms.jsx'
import Traffic from './pages/Traffic.jsx'
import AlarmManager from './components/AlarmManager.jsx'

export default function App() {
  const location = useLocation()
  // Mobile nav drawer state (ignored at `md`+ where the sidebar is always shown).
  const [navOpen, setNavOpen] = useState(false)
  // Collapse the desktop sidebar to give pages the full width. Device-local
  // (not synced across devices) since it's a per-screen preference.
  const [collapsed, setCollapsedState] = useState(() => readStored('sidebar-collapsed', false))
  const setCollapsed = (v) => {
    setCollapsedState(v)
    writeStored('sidebar-collapsed', v)
  }
  // Close the drawer whenever the route changes (e.g. tapping a nav link).
  useEffect(() => setNavOpen(false), [location.pathname])

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <ErrorBoundary fallback={null}>
        <Sidebar
          mobileOpen={navOpen}
          onClose={() => setNavOpen(false)}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(true)}
        />
      </ErrorBoundary>
      {/* Floating button to re-open the sidebar once it's collapsed (md+ only). */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show sidebar"
          className="fixed left-3 top-3 z-50 hidden rounded-xl border border-border bg-surface/90 p-2.5 text-gray-200 shadow-glow backdrop-blur active:scale-95 md:flex"
        >
          <MenuIcon className="h-6 w-6" />
        </button>
      )}
      {/* Content column: a mobile top bar (phones only) above the scrolling page. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary fallback={null}>
          <MobileTopBar onMenu={() => setNavOpen(true)} />
        </ErrorBoundary>
        <main
          className={[
            'scroll-area flex-1 p-4 pb-[calc(1rem+var(--kb,0px))] transition-[padding] duration-200 md:p-8 md:pb-[calc(2rem+var(--kb,0px))]',
            // Clear the floating "show sidebar" button when collapsed (md+).
            collapsed ? 'md:pl-20' : '',
          ].join(' ')}
        >
          {/* A page crash shows a recovery card instead of blanking the kiosk;
              keying by path clears it when the user navigates elsewhere. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/smart-home" element={<SmartHome />} />
              <Route path="/stocks" element={<Stocks />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/meals" element={<Meals />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/traffic" element={<Traffic />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/alarms" element={<Alarms />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
      {/* In-app on-screen keyboard disabled for now (iPad uses its native one):
      <ErrorBoundary fallback={null}>
        <VirtualKeyboard />
      </ErrorBoundary> */}
      {/* App-wide alarm engine: rings + popup over everything, on any page. */}
      <ErrorBoundary fallback={null}>
        <AlarmManager />
      </ErrorBoundary>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar, { MobileTopBar } from './components/Sidebar.jsx'
import { ChevronLeft, ChevronRight } from './components/Icons.jsx'
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
        <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} />
      </ErrorBoundary>
      {/* Hide/show the sidebar via an edge tab (md+ only; phones use the drawer).
          The tab sits on the sidebar's right edge when open, and at the screen
          edge when collapsed — same size/shape, just a flipped chevron. */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        className={[
          'fixed top-1/2 z-50 hidden h-16 w-6 -translate-y-1/2 items-center justify-center',
          'rounded-r-xl border border-l-0 border-border bg-surface text-gray-300 shadow-lg',
          'transition-[left] duration-200 active:scale-95 md:flex',
          collapsed ? 'left-0' : 'left-64',
        ].join(' ')}
      >
        {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
      </button>
      {/* Content column: a mobile top bar (phones only) above the scrolling page. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary fallback={null}>
          <MobileTopBar onMenu={() => setNavOpen(true)} />
        </ErrorBoundary>
        <main
          className="scroll-area flex-1 p-4 pb-[calc(1rem+var(--kb,0px))] transition-[padding] duration-200 md:p-8 md:pb-[calc(2rem+var(--kb,0px))]"
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

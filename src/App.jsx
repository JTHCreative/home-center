import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import VirtualKeyboard from './components/VirtualKeyboard.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SmartHome from './pages/SmartHome.jsx'
import Stocks from './pages/Stocks.jsx'
import Calendar from './pages/Calendar.jsx'
import Meals from './pages/Meals.jsx'
import Goals from './pages/Goals.jsx'
import Settings from './pages/Settings.jsx'
import Alarms from './pages/Alarms.jsx'
import AlarmManager from './components/AlarmManager.jsx'

export default function App() {
  const location = useLocation()
  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <ErrorBoundary fallback={null}>
        <Sidebar />
      </ErrorBoundary>
      <main
        className="scroll-area flex-1 p-8 transition-[padding] duration-200"
        style={{ paddingBottom: 'calc(2rem + var(--kb, 0px))' }}
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
            <Route path="/settings" element={<Settings />} />
            <Route path="/alarms" element={<Alarms />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <ErrorBoundary fallback={null}>
        <VirtualKeyboard />
      </ErrorBoundary>
      {/* App-wide alarm engine: rings + popup over everything, on any page. */}
      <ErrorBoundary fallback={null}>
        <AlarmManager />
      </ErrorBoundary>
    </div>
  )
}

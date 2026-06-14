import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import VirtualKeyboard from './components/VirtualKeyboard.jsx'
import SmartHome from './pages/SmartHome.jsx'
import Stocks from './pages/Stocks.jsx'
import Calendar from './pages/Calendar.jsx'
import Meals from './pages/Meals.jsx'
import Goals from './pages/Goals.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <Sidebar />
      <main className="scroll-area flex-1 p-8">
        <Routes>
          <Route path="/" element={<Navigate to="/smart-home" replace />} />
          <Route path="/smart-home" element={<SmartHome />} />
          <Route path="/stocks" element={<Stocks />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/meals" element={<Meals />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/smart-home" replace />} />
        </Routes>
      </main>
      <VirtualKeyboard />
    </div>
  )
}

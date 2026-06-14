import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { SettingsProvider } from './lib/settings.jsx'
import './index.css'

// HashRouter keeps deep links working when served as static files in a kiosk
// (no server-side route config needed).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </SettingsProvider>
  </React.StrictMode>,
)

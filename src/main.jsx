import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { SettingsProvider } from './lib/settings.jsx'
import './index.css'

// Spotify OAuth popup callback: this window was opened by login(); hand the
// authorization code back to the opener and close, without booting the app.
const authParams = new URLSearchParams(window.location.search)
if (window.opener && authParams.has('state') && (authParams.has('code') || authParams.has('error'))) {
  window.opener.postMessage(
    {
      type: 'spotify-auth',
      code: authParams.get('code'),
      state: authParams.get('state'),
      error: authParams.get('error'),
    },
    window.location.origin,
  )
  window.close()
} else {
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
}

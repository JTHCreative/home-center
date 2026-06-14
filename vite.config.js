import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On GitHub Pages the app is served from /<repo>/, so production builds need a
// matching base. Locally (dev/preview) we serve from root. Override the repo
// name with VITE_BASE if you fork/rename or use a custom domain.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.VITE_BASE || '/home-center/' : '/',
  plugins: [react()],
  server: {
    // Host on 0.0.0.0 so the Pi can serve the kiosk browser from another device
    // if needed during development; preview uses the same.
    host: true,
    port: 5173,
  },
}))

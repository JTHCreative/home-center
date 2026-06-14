import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Host on 0.0.0.0 so the Pi can serve the kiosk browser from another device if
// needed during development; preview uses the same.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})

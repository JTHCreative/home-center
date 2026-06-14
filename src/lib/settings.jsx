/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect } from 'react'
import { useLocalState } from './storage.js'
import { setMasterVolume, startSoundscape, stopSoundscape } from './soundscapes.js'

// Theme catalog. `sound` is the soundscape id (see soundscapes.js); swatch
// colors are for the Settings previews and mirror index.css.
export const THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    sound: null,
    soundLabel: 'Silent',
    colors: { bg: '#0D1117', surface: '#161B22', accent: '#58A6FF' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    sound: 'waves',
    soundLabel: 'Waves',
    colors: { bg: '#081628', surface: '#0E243A', accent: '#38BDF8' },
  },
  {
    id: 'forest',
    name: 'Forest',
    sound: 'forest',
    soundLabel: 'Forest birds',
    colors: { bg: '#0D1A11', surface: '#15271B', accent: '#6EE787' },
  },
  {
    id: 'moon',
    name: 'Moon & Sky',
    sound: 'crickets',
    soundLabel: 'Cricket chirps',
    colors: { bg: '#0B1026', surface: '#151A3A', accent: '#A78BFA' },
  },
]

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useLocalState('theme', 'midnight')
  const [soundOn, setSoundOn] = useLocalState('sound-on', false)
  const [volume, setVolume] = useLocalState('sound-volume', 50) // 0–100

  // Apply the theme palette.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Start/stop the soundscape when the theme or on/off state changes.
  useEffect(() => {
    const t = THEMES.find((x) => x.id === theme)
    if (soundOn && t?.sound) startSoundscape(t.sound, volume / 100)
    else stopSoundscape()
    // volume handled by its own effect to avoid restarting on every slider tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, soundOn])

  useEffect(() => {
    setMasterVolume(volume / 100)
  }, [volume])

  useEffect(() => () => stopSoundscape(), [])

  return (
    <SettingsContext.Provider
      value={{ theme, setTheme, soundOn, setSoundOn, volume, setVolume }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

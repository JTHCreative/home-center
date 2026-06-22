/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect } from 'react'
import { useLocalState } from './storage.js'
import { setMasterVolume, startSoundscape, stopSoundscape } from './soundscapes.js'

// Theme catalog. `sound` is the soundscape id (see soundscapes.js); swatch
// colors are for the Settings previews and mirror index.css.
export const THEMES = [
  {
    id: 'slate',
    name: 'Slate',
    sound: null,
    soundLabel: 'Silent',
    colors: { bg: '#16181C', surface: '#1E2126', accent: '#8FA3B8' },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    sound: null,
    soundLabel: 'Silent',
    colors: { bg: '#1C1917', surface: '#292524', accent: '#D4956A' },
  },
  {
    id: 'forest',
    name: 'Forest',
    sound: 'forest',
    soundLabel: 'Forest birds',
    colors: { bg: '#151D17', surface: '#1C2820', accent: '#6BAF7A' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    sound: 'waves',
    soundLabel: 'Waves',
    colors: { bg: '#141C26', surface: '#1B2537', accent: '#6A9EC0' },
  },
  {
    id: 'twilight',
    name: 'Twilight',
    sound: 'crickets',
    soundLabel: 'Cricket chirps',
    colors: { bg: '#1A1620', surface: '#231E2E', accent: '#9B84C0' },
  },
]

const SettingsContext = createContext(null)

// Legacy theme ids → nearest equivalent in the current catalog, so existing
// saved preferences still land on a valid theme after renames.
const LEGACY_THEME_MAP = {
  midnight: 'slate', // old neutral grey/navy default → new neutral grey Slate
  moon: 'twilight',
  grove: 'forest',
  peat: 'twilight',
}

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useLocalState('theme', 'slate')
  const [soundOn, setSoundOn] = useLocalState('sound-on', false)
  const [volume, setVolume] = useLocalState('sound-volume', 50) // 0–100

  // Migrate any legacy theme id forward once on mount.
  useEffect(() => {
    if (LEGACY_THEME_MAP[theme]) setTheme(LEGACY_THEME_MAP[theme])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

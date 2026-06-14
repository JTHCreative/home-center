import Card, { PageHeader } from '../components/Card.jsx'
import Toggle from '../components/Toggle.jsx'
import Slider from '../components/Slider.jsx'
import { CheckIcon, MuteIcon, VolumeIcon } from '../components/Icons.jsx'
import { THEMES, useSettings } from '../lib/settings.jsx'

export default function Settings() {
  const { theme, setTheme, soundOn, setSoundOn, volume, setVolume } = useSettings()
  const current = THEMES.find((t) => t.id === theme)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Theme & ambient sound" />

      {/* Theme picker */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">Theme</h2>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {THEMES.map((t) => {
          const active = t.id === theme
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={[
                'relative overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.98]',
                active ? 'border-accent shadow-glow' : 'border-border',
              ].join(' ')}
              style={{ backgroundColor: t.colors.surface }}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg">
                  <CheckIcon className="h-4 w-4" />
                </span>
              )}
              {/* Swatch */}
              <div className="mb-3 flex gap-1.5">
                {[t.colors.bg, t.colors.surface, t.colors.accent].map((c, i) => (
                  <span
                    key={i}
                    className="h-8 w-8 rounded-lg border border-white/10"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="font-bold text-white">{t.name}</div>
              <div
                className="mt-0.5 font-mono text-xs"
                style={{ color: t.colors.accent }}
              >
                {t.soundLabel}
              </div>
            </button>
          )
        })}
      </div>

      {/* Sound controls */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">Ambient Sound</h2>
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {soundOn ? (
              <VolumeIcon className="h-6 w-6 text-accent" />
            ) : (
              <MuteIcon className="h-6 w-6 text-gray-500" />
            )}
            <div>
              <div className="font-semibold text-white">Play ambient sound</div>
              <div className="text-sm text-gray-400">
                {current?.sound
                  ? `Plays “${current.soundLabel}” with the ${current.name} theme`
                  : `The ${current?.name} theme is silent — pick Ocean, Forest, or Moon & Sky for sound`}
              </div>
            </div>
          </div>
          <Toggle
            checked={soundOn}
            label="Ambient sound"
            onChange={setSoundOn}
          />
        </div>

        <div className={soundOn ? 'mt-6' : 'mt-6 opacity-40'}>
          <div className="mb-2 flex items-center justify-between text-sm text-gray-400">
            <span>Volume</span>
            <span className="font-mono text-white">{volume}</span>
          </div>
          <Slider
            value={volume}
            disabled={!soundOn}
            ariaLabel="Ambient volume"
            onChange={setVolume}
          />
        </div>
      </Card>

      <p className="mt-4 text-xs text-gray-600">
        Sounds are generated on the device (Web Audio) — no files or network
        needed. Browsers may wait for your first tap before audio starts.
      </p>
    </div>
  )
}

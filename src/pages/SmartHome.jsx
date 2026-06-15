import { useLocalState } from '../lib/storage.js'
import Card, { PageHeader } from '../components/Card.jsx'
import Toggle from '../components/Toggle.jsx'
import Slider from '../components/Slider.jsx'
import { PowerIcon, VolumeIcon } from '../components/Icons.jsx'
import { DEFAULT_SMART_HOME as DEFAULT_STATE } from '../lib/seeds.js'

// Device model is persisted (and shared) via useLocalState so toggle/brightness
// state survives reboots. The seed lives in lib/seeds.js so the Home dashboard
// can render the same controls from one source of truth.

const INPUTS = ['HDMI 1', 'HDMI 2', 'TV', 'Apple TV', 'Cast']

export default function SmartHome() {
  const [state, setState] = useLocalState('smart-home', DEFAULT_STATE)

  // --- Controller helpers (HA swap-in points) -------------------------------
  const setLight = (room, id, patch) =>
    setState((s) => ({
      ...s,
      lights: {
        ...s.lights,
        [room]: s.lights[room].map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      },
    }))

  const setMedia = (patch) =>
    setState((s) => ({ ...s, media: { ...s.media, ...patch } }))

  const setPlug = (id, patch) =>
    setState((s) => ({
      ...s,
      plugs: s.plugs.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Smart Home" subtitle="Lights, media, and plugs" />

      {/* Lights by room */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">Lights</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Object.entries(state.lights).map(([room, lights]) => (
          <Card key={room}>
            <h3 className="mb-4 text-base font-bold text-white">{room}</h3>
            <div className="space-y-5">
              {lights.map((light) => (
                <div key={light.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={
                        light.on ? 'text-white' : 'text-gray-500'
                      }
                    >
                      {light.name}
                    </span>
                    <Toggle
                      checked={light.on}
                      label={`${room} ${light.name}`}
                      onChange={(on) => setLight(room, light.id, { on })}
                    />
                  </div>
                  <Slider
                    value={light.brightness}
                    disabled={!light.on}
                    ariaLabel={`${light.name} brightness`}
                    onChange={(brightness) =>
                      setLight(room, light.id, { brightness })
                    }
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Media controls */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">TV / Media</h2>
      <Card className="mb-8" glow={state.media.power}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <button
            type="button"
            onClick={() => setMedia({ power: !state.media.power })}
            className={[
              'flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl transition-colors active:scale-95',
              state.media.power
                ? 'bg-accent/20 text-accent shadow-glow'
                : 'bg-white/5 text-gray-500',
            ].join(' ')}
            aria-label="TV power"
          >
            <PowerIcon className="h-9 w-9" />
          </button>

          <div className="flex-1">
            <div className="mb-2 flex items-center gap-3 text-gray-300">
              <VolumeIcon className="h-6 w-6" />
              <span className="font-mono text-lg text-white">
                {state.media.volume}
              </span>
            </div>
            <Slider
              value={state.media.volume}
              disabled={!state.media.power}
              ariaLabel="Volume"
              onChange={(volume) => setMedia({ volume })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {INPUTS.map((input) => (
              <button
                key={input}
                type="button"
                disabled={!state.media.power}
                onClick={() => setMedia({ input })}
                className={[
                  'rounded-xl px-4 py-3 text-sm font-semibold transition-colors active:scale-95 disabled:opacity-40',
                  state.media.input === input && state.media.power
                    ? 'bg-accent/15 text-accent shadow-glow'
                    : 'bg-white/5 text-gray-300',
                ].join(' ')}
              >
                {input}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Smart plugs grid */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">Smart Plugs</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {state.plugs.map((plug) => (
          <button
            key={plug.id}
            type="button"
            onClick={() => setPlug(plug.id, { on: !plug.on })}
            className={[
              'flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all active:scale-[0.98]',
              plug.on
                ? 'border-accent/50 bg-accent/10 shadow-glow'
                : 'border-border bg-surface',
            ].join(' ')}
          >
            <PowerIcon
              className={[
                'h-7 w-7',
                plug.on ? 'text-accent' : 'text-gray-600',
              ].join(' ')}
            />
            <div>
              <div className="font-semibold text-white">{plug.name}</div>
              <div
                className={[
                  'font-mono text-xs uppercase',
                  plug.on ? 'text-gain' : 'text-gray-500',
                ].join(' ')}
              >
                {plug.on ? 'On' : 'Off'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

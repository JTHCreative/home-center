// Procedural ambient soundscapes via the Web Audio API. No audio files needed,
// so it works fully offline on the Pi. Each soundscape is built from filtered
// noise plus scheduled synth voices (waves, birds, crickets).

let ctx = null
let master = null
let cleanups = [] // teardown fns for the active soundscape

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    // Browsers start the context suspended until a user gesture; resume on the
    // first interaction so a persisted "sound on" setting starts playing.
    const resume = () => ctx.state === 'suspended' && ctx.resume()
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  }
  return ctx
}

function noiseBuffer(c, seconds = 3) {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

export function setMasterVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v))
}

export function stopSoundscape() {
  cleanups.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore teardown errors */
    }
  })
  cleanups = []
}

export function startSoundscape(name, volume = 0.5) {
  stopSoundscape()
  if (!name) return
  const c = getCtx()
  setMasterVolume(volume)
  if (c.state === 'suspended') c.resume()
  if (name === 'waves') buildWaves(c)
  else if (name === 'forest') buildForest(c)
  else if (name === 'crickets') buildCrickets(c)
}

// --- Waves: low-pass noise with a slow swell every ~7s. ----------------------
function buildWaves(c) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  src.loop = true
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 500
  const g = c.createGain()
  g.gain.value = 0.1
  src.connect(lp).connect(g).connect(master)
  src.start()

  const tick = () => {
    const now = c.currentTime
    g.gain.cancelScheduledValues(now)
    g.gain.setValueAtTime(g.gain.value, now)
    g.gain.linearRampToValueAtTime(0.55, now + 3.5)
    g.gain.linearRampToValueAtTime(0.08, now + 7)
    lp.frequency.cancelScheduledValues(now)
    lp.frequency.setValueAtTime(lp.frequency.value, now)
    lp.frequency.linearRampToValueAtTime(950, now + 3.5)
    lp.frequency.linearRampToValueAtTime(350, now + 7)
  }
  tick()
  const id = setInterval(tick, 7000)
  cleanups.push(() => {
    clearInterval(id)
    try {
      src.stop()
    } catch {
      /* already stopped */
    }
    src.disconnect()
    lp.disconnect()
    g.disconnect()
  })
}

// --- Forest: soft wind (band-pass noise) plus random bird chirps. ------------
function buildForest(c) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  src.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1000
  bp.Q.value = 0.6
  const g = c.createGain()
  g.gain.value = 0.05
  src.connect(bp).connect(g).connect(master)
  src.start()

  const chirp = () => {
    const now = c.currentTime
    const o = c.createOscillator()
    o.type = 'sine'
    const og = c.createGain()
    og.gain.value = 0
    o.connect(og).connect(master)
    const base = 1800 + Math.random() * 1600
    const notes = 2 + Math.floor(Math.random() * 3)
    let t = now
    for (let i = 0; i < notes; i++) {
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t)
      o.frequency.linearRampToValueAtTime(base * 1.35, t + 0.06)
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(0.14, t + 0.012)
      og.gain.linearRampToValueAtTime(0, t + 0.09)
      t += 0.12
    }
    o.start(now)
    o.stop(t + 0.1)
  }

  const initial = setTimeout(chirp, 800)
  const id = setInterval(() => Math.random() < 0.7 && chirp(), 2600)
  cleanups.push(() => {
    clearTimeout(initial)
    clearInterval(id)
    try {
      src.stop()
    } catch {
      /* already stopped */
    }
    src.disconnect()
    bp.disconnect()
    g.disconnect()
  })
}

// --- Moon & Sky: low night pad plus rhythmic cricket trills. -----------------
function buildCrickets(c) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  src.loop = true
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 200
  const g = c.createGain()
  g.gain.value = 0.03
  src.connect(lp).connect(g).connect(master)
  src.start()

  const cricket = () => {
    const now = c.currentTime
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = 4500 + Math.random() * 700
    const og = c.createGain()
    og.gain.value = 0
    o.connect(og).connect(master)
    let t = now
    const pulses = 4 + Math.floor(Math.random() * 3)
    for (let i = 0; i < pulses; i++) {
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(0.06, t + 0.005)
      og.gain.linearRampToValueAtTime(0, t + 0.02)
      t += 0.03
    }
    o.start(now)
    o.stop(t + 0.05)
  }

  const initial = setTimeout(cricket, 500)
  const id = setInterval(cricket, 1200)
  cleanups.push(() => {
    clearTimeout(initial)
    clearInterval(id)
    try {
      src.stop()
    } catch {
      /* already stopped */
    }
    src.disconnect()
    lp.disconnect()
    g.disconnect()
  })
}

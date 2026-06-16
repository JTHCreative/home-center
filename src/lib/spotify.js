// Spotify integration for the dashboard player.
//
// Two layers:
//  1. Embed parsing (no auth) — turn a share link/URI into an embed URL.
//  2. Full playback — OAuth (Authorization Code + PKCE) in a popup, then the
//     Web Playback SDK to stream full tracks on an in-app device. Requires a
//     Spotify app Client ID (VITE_SPOTIFY_CLIENT_ID) and a Premium account.
//
// Tokens are kept in localStorage only (per-kiosk) and never synced via
// Firestore — each device authenticates its own Spotify session/device.

// --- Embed (no auth) ---------------------------------------------------------
/** Parse a Spotify share link or URI into { type, id }. */
export function parseSpotify(input) {
  const s = (input || '').trim()
  if (!s) return null
  let m = s.match(/spotify:(playlist|track|album|artist|show|episode):([A-Za-z0-9]+)/)
  if (m) return { type: m[1], id: m[2] }
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|track|album|artist|show|episode)\/([A-Za-z0-9]+)/)
  if (m) return { type: m[1], id: m[2] }
  return null
}
export const spotifyEmbedUrl = (p) => `https://open.spotify.com/embed/${p.type}/${p.id}?utm_source=generator`

// --- OAuth (PKCE) ------------------------------------------------------------
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
export const hasSpotifyClientId = Boolean(CLIENT_ID)

const TOKENS_KEY = 'home-center:spotify-tokens'
const PKCE_KEY = 'spotify-pkce'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ')

// Redirect lands back on the app root (handled in main.jsx). Must be registered
// verbatim in the Spotify app's Redirect URIs.
const redirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}`

const authSubs = new Set()
export function subscribeAuth(fn) {
  authSubs.add(fn)
  fn(isAuthed())
  return () => authSubs.delete(fn)
}
const emitAuth = () => authSubs.forEach((fn) => fn(isAuthed()))

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY))
  } catch {
    return null
  }
}
function writeTokens(t) {
  if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
  else localStorage.removeItem(TOKENS_KEY)
}
export function isAuthed() {
  return !!readTokens()?.refresh_token
}

function randomString(len) {
  const a = new Uint8Array(len)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('').slice(0, len)
}
async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Open the Spotify login popup and resolve once tokens are stored. */
export async function login() {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID')
  const verifier = randomString(96)
  const state = randomString(16)
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }))
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await pkceChallenge(verifier),
    scope: SCOPES,
    state,
  })
  const popup = window.open(
    `https://accounts.spotify.com/authorize?${params.toString()}`,
    'spotify-login',
    'width=480,height=720',
  )
  if (!popup) throw new Error('Popup blocked — allow popups and try again.')

  return new Promise((resolve, reject) => {
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'spotify-auth') return
      window.removeEventListener('message', onMessage)
      const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || '{}')
      sessionStorage.removeItem(PKCE_KEY)
      if (e.data.error || !e.data.code || e.data.state !== saved.state) {
        reject(new Error(e.data.error || 'Login failed.'))
        return
      }
      try {
        await exchangeCode(e.data.code, saved.verifier)
        emitAuth()
        resolve(true)
      } catch (err) {
        reject(err)
      }
    }
    window.addEventListener('message', onMessage)
  })
}

async function exchangeCode(code, verifier) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error('Token exchange failed.')
  const t = await res.json()
  writeTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + t.expires_in * 1000,
  })
}

/** Valid access token, refreshing if it's expired (or about to be). */
export async function getToken() {
  let t = readTokens()
  if (!t) return null
  if (Date.now() < t.expires_at - 60_000) return t.access_token
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) return t.access_token // let the caller fail loudly if it's truly dead
  const r = await res.json()
  t = {
    access_token: r.access_token,
    refresh_token: r.refresh_token || t.refresh_token,
    expires_at: Date.now() + r.expires_in * 1000,
  }
  writeTokens(t)
  return t.access_token
}

export function logout() {
  writeTokens(null)
  disconnectPlayer()
  emitAuth()
}

// --- Web Playback SDK --------------------------------------------------------
let player = null
let deviceId = null
let sdkLoading = null
const playerSubs = new Set()
let playerState = { ready: false, error: null, playback: null }

export function subscribePlayer(fn) {
  playerSubs.add(fn)
  fn(playerState)
  return () => playerSubs.delete(fn)
}
function setPlayerState(patch) {
  playerState = { ...playerState, ...patch }
  playerSubs.forEach((fn) => fn(playerState))
}

function loadSdk() {
  if (window.Spotify) return Promise.resolve()
  if (sdkLoading) return sdkLoading
  sdkLoading = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://sdk.scdn.co/spotify-player.js'
    s.async = true
    document.body.appendChild(s)
  })
  return sdkLoading
}

/** Create and connect the in-app player once the user is authenticated. */
export async function initPlayer() {
  if (player || !hasSpotifyClientId || !isAuthed()) return
  await loadSdk()
  player = new window.Spotify.Player({
    name: 'Home Center',
    getOAuthToken: (cb) => getToken().then((t) => t && cb(t)),
    volume: 0.5,
  })
  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id
    setPlayerState({ ready: true, error: null })
  })
  player.addListener('not_ready', () => setPlayerState({ ready: false }))
  player.addListener('player_state_changed', (s) => setPlayerState({ playback: s }))
  player.addListener('initialization_error', ({ message }) => setPlayerState({ error: message }))
  player.addListener('authentication_error', ({ message }) => setPlayerState({ error: message }))
  player.addListener('account_error', () =>
    setPlayerState({ error: 'Spotify Premium is required for in-app playback.' }),
  )
  await player.connect()
}

export function disconnectPlayer() {
  if (player) player.disconnect()
  player = null
  deviceId = null
  playerState = { ready: false, error: null, playback: null }
  playerSubs.forEach((fn) => fn(playerState))
}

export const togglePlay = () => player?.togglePlay()
export const nextTrack = () => player?.nextTrack()
export const previousTrack = () => player?.previousTrack()

/** Start playback of a parsed {type,id}. Targets the in-app device by default,
 *  or `targetDeviceId` (a Spotify Connect device) when casting elsewhere. */
export async function play(parsed, targetDeviceId) {
  const dev = targetDeviceId || deviceId
  if (!parsed || !dev) return
  const token = await getToken()
  if (!token) return
  const uri = `spotify:${parsed.type}:${parsed.id}`
  const body = parsed.type === 'track' || parsed.type === 'episode' ? { uris: [uri] } : { context_uri: uri }
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${dev}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// --- Spotify Connect (cast to a device) --------------------------------------
/** The in-app Web Playback device id, once it's connected (null otherwise). */
export const localDeviceId = () => deviceId

/** List the account's available Spotify Connect devices. Returns [] on failure. */
export async function getDevices() {
  const token = await getToken()
  if (!token) return []
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.devices || []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      isActive: d.is_active,
      volume: d.volume_percent,
    }))
  } catch {
    return []
  }
}

/** Move playback to a Spotify Connect device (the "cast" action). `play` keeps
 *  it playing on the new device; pass false to transfer without auto-playing. */
export async function transferPlayback(targetDeviceId, play = true) {
  if (!targetDeviceId) return
  const token = await getToken()
  if (!token) return
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [targetDeviceId], play }),
  })
}

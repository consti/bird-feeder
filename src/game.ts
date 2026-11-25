// The live garden as the browser knows it: your bird, everyone else's, the food, and the socket that keeps them in sync.
import { useSyncExternalStore } from 'react'
import { birds, canEat, reach, TABLE_Y, type BirdId, type FoodId } from './data'

export type Player = {
  id: number
  bird: BirdId
  score: number
  bot?: boolean
  x: number
  y: number
  z: number
  yaw: number
  air: boolean | number
  // animation deadlines, in performance.now() time
  stuffed: number
  hop: number
  peck: number
}
export type Item = { id: number; kind: FoodId; x: number; z: number; asked?: number }

const species = Object.keys(birds) as BirdId[]
const fresh = { stuffed: 0, hop: 0, peck: 0 }

export const world = {
  online: false,
  me: { id: 0, bird: species[Math.floor(Math.random() * species.length)], score: 0, x: Math.random() * 3 - 1.5, y: 3.5, z: Math.random() * 2, yaw: 0, air: true, ...fresh } as Player,
  others: new Map<number, Player>(),
  items: new Map<number, Item>(),
}

// what the keyboard or the touch stick currently asks for; read by the flight loop every frame
export const input = { x: 0, z: 0, flap: false }

// React re-renders on arrivals, departures, food and scores. Positions change every frame and are read directly.
let version = 0
const listeners = new Set<() => void>()
const changed = () => (version++, listeners.forEach((f) => f()))
const subscribe = (f: () => void) => (listeners.add(f), () => listeners.delete(f))
export const useWorld = () => useSyncExternalStore(subscribe, () => version)

// ---------- sound ----------

let audio: AudioContext | undefined
// browsers only allow sound after a key press or tap, so those call this
export const unlockAudio = () => (audio ??= new AudioContext())

function tone(from: number, to: number, secs: number, type: OscillatorType, gain: number) {
  if (!audio) return
  const osc = audio.createOscillator()
  const vol = audio.createGain()
  const t = audio.currentTime
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(to, t + secs)
  vol.gain.setValueAtTime(gain, t)
  vol.gain.exponentialRampToValueAtTime(0.001, t + secs)
  osc.connect(vol).connect(audio.destination)
  osc.start(t)
  osc.stop(t + secs)
}
// big birds caw, small birds tweet
const call = (bird: BirdId, gain: number) => (birds[bird].size > 1.4 ? tone(420, 290, 0.28, 'sawtooth', gain) : tone(2400, 3700, 0.12, 'sine', gain))

// ---------- socket ----------

const url: string = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
let ws: WebSocket | undefined
const send = (m: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m))
const byId = (id: number) => (id === world.me.id ? world.me : world.others.get(id))

function connect() {
  ws = new WebSocket(url)
  ws.onopen = () => send({ t: 'hi', bird: world.me.bird })
  ws.onclose = () => {
    world.online = false
    world.me.id = 0
    world.others.clear()
    world.items.clear()
    changed()
    setTimeout(connect, 3000) // you can keep flying alone meanwhile
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    const now = performance.now()
    if (m.t === 'pos') {
      // [id, x, y, z, yaw, air] for every bird, 15 times a second
      for (const [id, x, y, z, yaw, air] of m.p) {
        const p = world.others.get(id)
        if (p) Object.assign(p, { x, y, z, yaw, air })
      }
      return
    }
    if (m.t === 'welcome') {
      world.online = true
      world.me.id = m.you
      world.me.score = 0
      for (const p of m.players) if (p.id !== m.you) world.others.set(p.id, { ...fresh, ...p })
      for (const it of m.items) world.items.set(it.id, it)
    } else if (m.t === 'join') {
      if (m.p.id !== world.me.id) world.others.set(m.p.id, { ...fresh, ...world.others.get(m.p.id), ...m.p })
    } else if (m.t === 'leave') {
      world.others.delete(m.id)
    } else if (m.t === 'drop') {
      for (const it of m.items) world.items.set(it.id, it)
    } else if (m.t === 'ate') {
      world.items.delete(m.item)
      const p = byId(m.by)
      if (p) {
        p.score = m.score
        p.peck = now + 500
        if (m.kind === 'bread') p.stuffed = now + 6000 // full of bread: fat and slow
        if (p === world.me) m.kind === 'bread' ? tone(300, 120, 0.4, 'triangle', 0.12) : tone(900, 1500, 0.08, 'square', 0.05)
      }
    } else if (m.t === 'caw') {
      const p = byId(m.id)
      if (p) {
        p.hop = now + 600
        call(p.bird, p === world.me ? 0.1 : 0.04)
      }
    }
    changed()
  }
}
connect()

// ---------- what you can do ----------

export function setBird(bird: BirdId) {
  world.me.bird = bird
  send({ t: 'hi', bird })
  changed()
}

export const feed = (kind: FoodId) => send({ t: 'feed', kind })

export function caw() {
  unlockAudio()
  // offline there is nobody to hear it, so answer yourself
  if (!send({ t: 'caw' })) {
    world.me.hop = performance.now() + 600
    call(world.me.bird, 0.1)
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

// called 15 times a second by the flight loop: report where you are and grab any food in reach
export function sync() {
  const me = world.me
  const now = performance.now()
  send({ t: 'pos', x: r2(me.x), y: r2(me.y), z: r2(me.z), yaw: r2(me.yaw), air: +me.air })
  for (const it of world.items.values()) {
    // ask again after half a second in case the server thought you were still too far away
    if (canEat(me.bird, it.kind) && now - (it.asked ?? 0) > 500 && Math.hypot(me.x - it.x, me.y - TABLE_Y, me.z - it.z) < reach(me.bird)) {
      it.asked = now
      send({ t: 'eat', item: it.id })
    }
  }
}

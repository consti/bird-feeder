// The live garden as the browser knows it: your bird, everyone else's, the food, and the socket that keeps them in sync.
import { useSyncExternalStore } from 'react'
import { birds, canEat, MAX_HP, reach, TABLE_Y, weapons, type BirdId, type FoodId, type WeaponId } from './data'

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
  hp: number
  out: boolean // knocked out, waiting to come back
  // animation deadlines, in performance.now() time
  stuffed: number
  hop: number
  peck: number
  hurt: number
}
export type Item = { id: number; kind: FoodId; x: number; z: number; asked?: number }
type V3 = [number, number, number]
// something short-lived to draw: a shot on its way, or the feathers of a knocked-out bird
export type Fx = { id: number; kind: WeaponId | 'poof'; from: V3; to: V3; t0: number; ms: number; color: string }

const species = Object.keys(birds) as BirdId[]
const fresh = { hp: MAX_HP, out: false, stuffed: 0, hop: 0, peck: 0, hurt: 0 }
const arsenal = Object.keys(weapons) as WeaponId[]

export const world = {
  online: false,
  me: { id: 0, bird: species[Math.floor(Math.random() * species.length)], score: 0, x: Math.random() * 3 - 1.5, y: 3.5, z: Math.random() * 2, yaw: 0, air: true, ...fresh } as Player,
  others: new Map<number, Player>(),
  items: new Map<number, Item>(),
  fx: [] as Fx[],
  fired: {} as Partial<Record<WeaponId, number>>, // when you last fired each weapon, for the cooldowns
  toast: '', // the latest news: an unlock or a knockout
  toastId: 0, // so the same news twice still shows twice
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
// pew, bloop, splat, zap: [from Hz, to Hz, seconds, waveform, flight time of the shot in ms]
const shots: Record<WeaponId, [number, number, number, OscillatorType, number]> = {
  seed: [1900, 900, 0.07, 'square', 160],
  bread: [320, 180, 0.18, 'sine', 280],
  poop: [600, 70, 0.3, 'triangle', 350],
  laser: [1500, 180, 0.25, 'sawtooth', 220],
}

let fxId = 0
function show(kind: Fx['kind'], from: V3, to: V3, ms: number, color = '') {
  const now = performance.now()
  world.fx = world.fx.filter((f) => now - f.t0 < f.ms) // forget the ones that have finished
  world.fx.push({ id: ++fxId, kind, from, to, t0: now, ms, color })
}
const chest = (p: Player): V3 => [p.x, p.y + 0.3 * birds[p.bird].size, p.z]

function news(text: string) {
  world.toast = text
  world.toastId++
}

// update a score; if that unlocked a weapon for you, say so and return true
function scored(p: Player, score: number) {
  const before = p.score
  p.score = score
  const got = p === world.me && arsenal.findLast((id) => before < weapons[id].unlock && score >= weapons[id].unlock)
  if (!got) return false
  news(`Unlocked ${weapons[got].emoji} ${weapons[got].name}! Key ${arsenal.indexOf(got) + 1}: it ${weapons[got].how}.`)
  tone(700, 1400, 0.3, 'triangle', 0.1)
  return true
}

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
    Object.assign(world.me, fresh, { id: 0 })
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
        scored(p, m.score)
        p.hp = m.hp
        p.peck = now + 500
        if (m.kind === 'bread') p.stuffed = now + 6000 // full of bread: fat and slow
        if (p === world.me) m.kind === 'bread' ? tone(300, 120, 0.4, 'triangle', 0.12) : tone(900, 1500, 0.08, 'square', 0.05)
      }
    } else if (m.t === 'shot') {
      const by = byId(m.by)
      if (!by) return
      const id = m.w as WeaponId
      const [from, to, secs, wave, ms] = shots[id]
      tone(from, to, secs, wave, by === world.me ? 0.08 : 0.03)
      // a miss still flies: straight ahead, or straight down for the poop bomb
      const far = weapons[id].range
      if (!m.hits.length) show(id, chest(by), id === 'poop' ? [by.x, 0, by.z] : [by.x + Math.sin(by.yaw) * far, by.y + 0.3, by.z + Math.cos(by.yaw) * far], ms)
      for (const [victim, hp] of m.hits) {
        const q = byId(victim)
        if (!q) continue
        show(id, chest(by), chest(q), ms)
        q.hp = hp
        q.hurt = now + 400
        if (id === 'bread') q.stuffed = now + 5000
        if (q === world.me) tone(200, 90, 0.2, 'square', 0.1)
      }
    } else if (m.t === 'ko') {
      const q = byId(m.id)
      const by = byId(m.by)
      const unlocked = by && scored(by, m.score)
      if (q) {
        q.out = true
        q.hp = 0
        show('poof', chest(q), chest(q), 700, birds[q.bird].belly)
        const who = (p?: Player) => (p ? `${birds[p.bird].name}${p === world.me ? ' (you)' : ''}` : 'Somebody')
        if (!unlocked) news(`💥 ${who(by)} knocked out ${who(q)} with ${weapons[m.w as WeaponId].name}`)
        if (q === world.me) tone(500, 60, 0.6, 'sawtooth', 0.12)
      }
    } else if (m.t === 'up') {
      const q = byId(m.id)
      if (q) Object.assign(q, { out: false, hp: MAX_HP })
      // you come back somewhere above the garden; everyone else reports their own place
      if (q === world.me) Object.assign(q, { x: Math.random() * 4 - 2, y: 3.5, z: Math.random() * 4 - 2, stuffed: 0 })
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

// the server has the last word on unlocks, cooldowns and who gets hit; checking here too keeps the buttons honest
export function fire(id: WeaponId) {
  const me = world.me
  const now = performance.now()
  if (!world.online || me.out || me.score < weapons[id].unlock || now - (world.fired[id] ?? -1e9) < weapons[id].cooldown) return
  unlockAudio()
  world.fired[id] = now
  send({ t: 'fire', w: id })
  changed()
}

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

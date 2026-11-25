// One process: serves the built site and runs the shared garden over a WebSocket at /ws.
// Clients report their own position; the server owns the food, the scores and the resident birds.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { WebSocketServer } from 'ws'
import { birds, canEat, foods, KO_BONUS, MAX_HP, MAX_Y, reach, TABLE_Y, weapons, WORLD_R } from './src/data.ts'

const MAX_PLAYERS = 40
const MAX_ITEMS = 60
const RESIDENTS = [['crow', 'laser', -1.62, 2.5, -0.67], ['robin', 'seed', 2.3, 0.84, 0.3], ['bluetit', 'bread', 2.9, 0.95, -1.8]] // bird, the weapon it shoots back with, its perch
const healthy = () => ({ hp: MAX_HP, out: false, back: 0, safe: 0, fired: {} })
const r2 = (n) => Math.round(n * 100) / 100

const dist = resolve(import.meta.dirname, 'dist')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const zipped = new Map() // shortcut: cached until restart, so rebuild means restart

async function serveFile(req, res) {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = resolve(dist, '.' + (path.endsWith('/') ? path + 'index.html' : path))
    if (!file.startsWith(dist + sep)) throw new Error('outside dist') // path traversal guard
    if (!zipped.has(file)) zipped.set(file, await promisify(gzip)(await readFile(file)))
    const gz = req.headers['accept-encoding']?.includes('gzip')
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(gz && { 'content-encoding': 'gzip' }),
    })
    res.end(gz ? zipped.get(file) : await readFile(file))
  } catch {
    res.writeHead(404).end('Not found')
  }
}

export async function start(port) {
  const players = new Map() // humans and residents alike
  const items = new Map() // food on the table
  let nextId = 1
  let seconds = 0

  const server = createServer(serveFile)
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 })

  const all = (m) => {
    const s = JSON.stringify(m)
    for (const ws of wss.clients) if (ws.readyState === 1) ws.send(s)
  }
  const visitors = () => players.size - RESIDENTS.length // humans who are actually in the garden
  const pub = ({ id, bird, score, bot, x, y, z, yaw, air, hp, out }) => ({ id, bird, score, bot, x, y, z, yaw, air, hp, out }) // leaves out the socket and other private fields

  function drop(kind, n) {
    const fresh = []
    for (; n > 0 && items.size < MAX_ITEMS; n--) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 1.1
      const it = { id: nextId++, kind, x: r2(Math.cos(a) * r), z: r2(Math.sin(a) * r), born: Date.now() }
      items.set(it.id, it)
      fresh.push(it)
    }
    if (fresh.length) all({ t: 'drop', items: fresh })
  }

  function eat(p, it) {
    items.delete(it.id)
    if (it.kind !== 'bread') {
      // bread fills you up and feeds you nothing; real food scores and heals
      p.score++
      p.hp = Math.min(MAX_HP, p.hp + 1)
    }
    all({ t: 'ate', item: it.id, by: p.id, kind: it.kind, score: p.score, hp: p.hp })
  }

  // Every weapon hits at once; the browsers draw the seed, the baguette or the beam on its way.
  function shoot(p, name, now) {
    const w = weapons[name]
    p.fired[name] = now
    const hit = [...players.values()]
      .filter((q) => q !== p && !q.out && now > q.safe && !(p.bot && q.bot)) // residents don't shoot each other
      .map((q) => ({ q, flat: Math.hypot(q.x - p.x, q.z - p.z), d: Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) }))
      // a poop bomb lands on everyone below you; everything else flies to the nearest bird in range
      .filter(({ q, flat, d }) => (name === 'poop' ? p.y - q.y > 0.4 && flat < w.range : d < w.range))
      .sort((a, b) => a.d - b.d)
      .slice(0, name === 'poop' ? Infinity : 1)
      .map(({ q }) => q)
    for (const q of hit) {
      q.hp = Math.max(0, q.hp - w.damage)
      if (q.bot) q.grudge ||= now + 700 // residents shoot back
    }
    all({ t: 'shot', w: name, by: p.id, hits: hit.map((q) => [q.id, q.hp]) })
    for (const q of hit) {
      if (q.hp) continue
      // knocked out: gone in a puff of feathers, back in three seconds
      q.out = true
      q.back = now + 3000
      if (q.bot) [q.x, q.y, q.z, q.target] = [...q.home, 0]
      p.score += KO_BONUS
      all({ t: 'ko', id: q.id, by: p.id, w: name, score: p.score })
    }
  }

  for (const [bird, weapon, ...home] of RESIDENTS) {
    const id = nextId++
    players.set(id, { id, bird, bot: true, weapon, home, x: home[0], y: home[1], z: home[2], yaw: 0.4, air: false, score: 0, rest: 0, target: 0, grudge: 0, ...healthy() })
  }

  // residents wait on their perch, fly to food they like, eat it and fly home
  function moveResident(b, dt, now) {
    if (b.grudge && now > b.grudge) {
      b.grudge = 0
      shoot(b, b.weapon, now)
    }
    if (!b.target && now > b.rest) {
      // food has to lie there for 3 s first, so visitors get a head start
      const tasty = [...items.values()].filter((it) => it.kind !== 'bread' && canEat(b.bird, it.kind) && now - it.born > 3000)
      b.target = tasty[Math.floor(Math.random() * tasty.length)]?.id ?? 0
    }
    const it = items.get(b.target)
    if (!it) b.target = 0
    const [tx, ty, tz] = it ? [it.x, TABLE_Y, it.z] : b.home
    const d = Math.hypot(tx - b.x, ty - b.y, tz - b.z)
    b.air = d > 0.05
    if (b.air) {
      const step = Math.min(d, 3 * dt) / d
      b.yaw = Math.atan2(tx - b.x, tz - b.z)
      b.x += (tx - b.x) * step
      b.y += (ty - b.y) * step
      b.z += (tz - b.z) * step
    } else if (it) {
      eat(b, it)
      b.target = 0
      b.rest = now + 2000 + Math.random() * 4000
    } else {
      b.yaw = 0.4 + Math.sin(now / 1400 + b.id) * 0.5 // keeping an eye on the visitors
    }
  }

  wss.on('connection', (ws) => {
    if (wss.clients.size > MAX_PLAYERS) return ws.close(1013, 'The garden is full')
    const p = { id: nextId++, ws, bird: null, x: 0, y: 3, z: 0, yaw: 0, air: true, score: 0, budget: 0, fedAt: 0, cawAt: 0, seen: 0, ...healthy() }
    ws.alive = true
    ws.on('pong', () => (ws.alive = true))
    ws.on('error', () => {}) // an oversized or broken frame closes that socket, not the server
    ws.on('close', () => {
      if (players.delete(p.id)) all({ t: 'leave', id: p.id })
      if (visitors()) return
      // the last visitor left: the next one finds a fresh garden, not residents with a week's head start
      items.clear()
      for (const b of players.values()) Object.assign(b, healthy(), { score: 0, grudge: 0 })
    })
    ws.on('message', (raw) => {
      if (++p.budget > 40) return // messages per second, refilled below
      let m
      try {
        m = JSON.parse(raw)
      } catch {
        return
      }
      if (!m || typeof m !== 'object') return
      const now = Date.now()

      if (m.t === 'hi' && typeof m.bird === 'string' && Object.hasOwn(birds, m.bird)) {
        const first = !p.bird
        p.bird = m.bird
        if (first) ws.send(JSON.stringify({ t: 'welcome', you: p.id, players: [...players.values()].map(pub), items: [...items.values()] }))
        else if (players.has(p.id)) all({ t: 'join', p: pub(p) }) // changed species
      } else if (!p.bird) {
        return // nothing else counts until you have said which bird you are
      } else if (m.t === 'pos' && [m.x, m.y, m.z, m.yaw].every(Number.isFinite)) {
        p.seen = now
        const k = Math.min(1, WORLD_R / Math.hypot(m.x, m.z))
        p.x = m.x * k
        p.y = Math.min(Math.max(m.y, 0), MAX_Y)
        p.z = m.z * k
        p.yaw = m.yaw
        p.air = !!m.air
        // You enter the garden with your first position, not before: a tab in the background
        // connects but never reports one, and used to hang in the air as a ghost.
        if (!players.has(p.id)) {
          players.set(p.id, p)
          all({ t: 'join', p: pub(p) })
        }
      } else if (!players.has(p.id)) {
        return
      } else if (m.t === 'eat') {
        const it = items.get(m.item)
        // 0.6 of slack: the server's idea of where you are is a few frames old
        if (it && !p.out && canEat(p.bird, it.kind) && Math.hypot(p.x - it.x, p.y - TABLE_Y, p.z - it.z) < reach(p.bird) + 0.6) eat(p, it)
      } else if (m.t === 'feed' && typeof m.kind === 'string' && Object.hasOwn(foods, m.kind) && now - p.fedAt > 1500) {
        p.fedAt = now
        drop(m.kind, 6)
      } else if (m.t === 'fire' && typeof m.w === 'string' && Object.hasOwn(weapons, m.w)) {
        const w = weapons[m.w]
        // 50 ms of grace, because the browser enforces the same cooldown on its own clock
        if (!p.out && p.score >= w.unlock && now - (p.fired[m.w] ?? 0) > w.cooldown - 50) shoot(p, m.w, now)
      } else if (m.t === 'caw' && now - p.cawAt > 800) {
        p.cawAt = now
        all({ t: 'caw', id: p.id })
      }
    })
  })

  const tick = setInterval(() => {
    if (!visitors()) return // nobody is in the garden, so nothing moves
    const now = Date.now()
    for (const p of players.values()) {
      if (p.out && now > p.back) {
        Object.assign(p, healthy(), { safe: now + 2000 }) // two seconds of peace after coming back
        all({ t: 'up', id: p.id })
      }
      if (p.bot && !p.out) moveResident(p, 1 / 15, now)
    }
    all({ t: 'pos', p: [...players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), +p.air]) })
  }, 1000 / 15)

  const chores = setInterval(() => {
    seconds++
    const now = Date.now()
    for (const p of players.values()) {
      p.budget = 0
      if (p.ws && now - p.seen > 15000) p.ws.terminate() // went silent: out of the garden
    }
    // a kind neighbour keeps a little food on the table
    const kinds = Object.keys(foods).filter((k) => k !== 'bread')
    if (seconds % 4 === 0 && visitors() && items.size < 12) drop(kinds[Math.floor(Math.random() * kinds.length)], 3)
    if (seconds % 30 === 0)
      for (const ws of wss.clients) {
        if (!ws.alive) {
          ws.terminate() // no pong since the last ping: the connection is dead
          continue
        }
        ws.alive = false
        ws.ping()
      }
  }, 1000)

  await new Promise((ready) => server.listen(port, ready))
  return {
    port: server.address().port,
    stop() {
      clearInterval(tick)
      clearInterval(chores)
      for (const ws of wss.clients) ws.terminate()
      server.close()
    },
  }
}

if (import.meta.main) start(process.env.PORT ?? 8787).then(({ port }) => console.log(`Bird garden on http://localhost:${port}`))

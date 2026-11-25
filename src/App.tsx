import { Component, lazy, Suspense, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { birds, canEat, foods, seasons, type BirdId, type FoodId, type SeasonId } from './data'
import { caw, feed, input, setBird, unlockAudio, useWorld, world } from './game'

// three.js is the heavy part, so it loads after the text is on screen
const Scene = lazy(() => import('./Scene'))

// shortcut: assumes northern-hemisphere seasons, add a hemisphere switch if visitors from the south matter
const thisSeason = (['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as const)[new Date().getMonth()]
const species = Object.keys(birds) as BirdId[]
const menu = Object.keys(foods) as FoodId[]

// ---------- flight controls: keyboard on the focused garden, a stick and two buttons on touch screens ----------

const steer: Record<string, 'up' | 'down' | 'left' | 'right'> = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' }
const held = { up: false, down: false, left: false, right: false }

function onKey(e: KeyboardEvent, down: boolean) {
  // a focused button inside the garden keeps its own keys, and Cmd+C stays copy
  if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (k === ' ') input.flap = down
  else if (k === 'c') down && !e.repeat && caw()
  else if (Object.hasOwn(steer, k)) {
    held[steer[k]] = down
    input.x = +held.right - +held.left
    input.z = +held.up - +held.down
  } else return
  unlockAudio()
  e.preventDefault() // or Space and the arrows would scroll the page
}

function letGo() {
  held.up = held.down = held.left = held.right = input.flap = false
  input.x = input.z = 0
}

const unit = (n: number) => Math.max(-1, Math.min(1, n))

// touch pointers stay with the element they started on, so no explicit capture is needed
function Stick() {
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    input.x = unit(((e.clientX - r.left) / r.width) * 2 - 1)
    input.z = -unit(((e.clientY - r.top) / r.height) * 2 - 1)
    el.style.setProperty('--x', `${input.x}`)
    el.style.setProperty('--y', `${-input.z}`)
  }
  const stop = (e: PointerEvent<HTMLDivElement>) => {
    input.x = input.z = 0
    e.currentTarget.style.setProperty('--x', '0')
    e.currentTarget.style.setProperty('--y', '0')
  }
  return <div className="stick" aria-hidden="true" onPointerDown={(e) => (unlockAudio(), move(e))} onPointerMove={(e) => e.buttons && move(e)} onPointerUp={stop} onPointerCancel={stop} />
}

// ---------- page ----------

// keeps the guide readable when WebGL is missing
class SceneGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p className="no3d">The 3D garden needs WebGL, which this browser didn't provide. The guide below still works.</p> : this.props.children
  }
}

// with a value these are toggles; without one they are plain action buttons
function Chips<T extends string>({ label, items, value, onPick }: { label: string; items: Record<T, { name: string; emoji: string }>; value?: T; onPick: (id: T) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {(Object.keys(items) as T[]).map((id) => (
        <button key={id} aria-pressed={value && value === id} onClick={() => onPick(id)}>
          <span aria-hidden="true">{items[id].emoji}</span>
          {items[id].name}
        </button>
      ))}
    </div>
  )
}

const Dot = ({ bird }: { bird: BirdId }) => <span className="dot" style={{ background: birds[bird].belly, borderColor: birds[bird].wing }} />

export default function App() {
  useWorld()
  const [season, setSeason] = useState<SeasonId>(thisSeason)
  const [food, setFood] = useState<FoodId | null>(null) // the last food you put out, for the note

  const me = world.me
  const others = [...world.others.values()]
  const board = [me, ...others].sort((a, b) => b.score - a.score).slice(0, 6)
  if (!board.includes(me)) board[5] = me
  const diet = menu.filter((f) => f !== 'bread' && canEat(me.bird, f))
  const { sky, emoji, name, tip } = seasons[season]

  return (
    <>
      <header className="hero">
        <h1>Feed the Birds</h1>
        <p>A tiny guide to running the most popular restaurant in your garden. Now with you as a guest.</p>
      </header>

      <main>
        <section id="feeder">
          <h2>Fly in the garden</h2>
          <p>You are a bird, and so is everyone else who is here right now. Fly to the table and eat what your species eats. Bread is the trap: anyone can eat it, it scores nothing, and it leaves you fat and slow.</p>

          <div className="picker">
            <div className="chips" role="group" aria-label="Choose your bird">
              {species.map((id) => (
                <button key={id} aria-pressed={me.bird === id} onClick={() => setBird(id)}>
                  <Dot bird={id} />
                  {birds[id].name}
                </button>
              ))}
            </div>
            <p className="fact" aria-live="polite">
              <strong>{birds[me.bird].name}.</strong> {birds[me.bird].fact} <strong>Eats: {diet.map((f) => `${foods[f].emoji} ${foods[f].name}`).join(', ')}.</strong>
            </p>
          </div>

          <div
            className="stage"
            style={{ background: `linear-gradient(${sky[0]}, ${sky[1]})` }}
            tabIndex={0}
            role="application"
            aria-label="The bird garden. Steer with W A S D or the arrow keys, hold Space to flap, press C to call."
            onKeyDown={(e) => onKey(e, true)}
            onKeyUp={(e) => onKey(e, false)}
            onBlur={letGo}
            onPointerDown={(e) => e.currentTarget.focus({ preventScroll: true })}
          >
            <div className="canvas">
              <SceneGuard>
                <Suspense fallback={null}>
                  <Scene season={season} />
                </Suspense>
              </SceneGuard>
            </div>

            <Chips label="Season" items={seasons} value={season} onPick={setSeason} />

            <div className="hud">
              {world.online ? `● Live · ${others.filter((p) => !p.bot).length + 1} visiting` : '○ Offline · reconnecting'}
              <ol>
                {board.map((p) => (
                  <li key={p.id} className={p === me ? 'you' : p.bot ? 'bot' : undefined}>
                    <Dot bird={p.bird} />
                    {birds[p.bird].name}
                    {p === me && ' (you)'}
                    <b>{p.score}</b>
                  </li>
                ))}
              </ol>
            </div>

            <p className="cta">
              <span className="idle">Click the garden to take off</span>
              <span className="keys">WASD or arrows steer · hold Space to flap · C calls</span>
            </p>

            <div className="touch">
              <Stick />
              <div className="pads">
                <button className="small" onClick={caw}>
                  Call
                </button>
                <button
                  onPointerDown={() => (unlockAudio(), (input.flap = true))}
                  onPointerUp={() => (input.flap = false)}
                  onPointerCancel={() => (input.flap = false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  Flap
                </button>
              </div>
            </div>
          </div>

          <h3>Put out food</h3>
          <Chips label="Put out food" items={foods} onPick={(id) => (feed(id), setFood(id))} />

          <div className="info" aria-live="polite">
            <p className={food === 'bread' ? 'note warn' : 'note'}>
              <strong>{food ? `${foods[food].emoji} ${foods[food].name}` : 'On the table'}</strong>{' '}
              {food ? `${foods[food].note}${food === 'bread' ? '' : ` Eaten by: ${foods[food].birds.map((b) => birds[b].name).join(', ')}.`}` : 'Tap a food to scatter it on the table for everyone. The resident crow, robin and blue tit will want their share.'}
            </p>
            <p className="tip">
              <strong>
                {emoji} {name}
              </strong>{' '}
              {tip}
            </p>
          </div>

          <aside className="crow-tip">
            <h3>
              <span aria-hidden="true">🐦‍⬛</span> Befriending crows
            </h3>
            <p>Crows are too big for hanging feeders, so use a flat tray or the ground. Offer unsalted peanuts in the shell, in the same spot at the same time each day. They will be watching you long before you notice them. Give it a couple of weeks and they'll be waiting for you.</p>
          </aside>
        </section>

        <section id="rules">
          <h2>Golden rules</h2>
          <p>Six habits that keep your visitors healthy.</p>
          <ul className="rules">
            <li><strong>🧼 Keep it clean</strong> Wash feeders every one to two weeks and let them dry before refilling. Dirty feeders spread disease.</li>
            <li><strong>💧 Always offer water</strong> A shallow dish, a few centimetres deep, refreshed daily. In winter, keep it ice-free.</li>
            <li><strong>🐈 Mind the cats</strong> Place feeders about 2 m from shrubs: close enough for a quick escape, too far for an ambush.</li>
            <li><strong>🪟 Mind the windows</strong> Put feeders closer than 1 m or farther than 10 m from glass. In between is where the worst collisions happen.</li>
            <li><strong>🥄 Little and often</strong> Put out only what gets eaten in a day or two, so nothing goes stale or invites rats.</li>
            <li><strong>🚫 Never serve</strong> Salted food, mouldy food, milk, or fat from the roasting tin. Birds can't handle salt or lactose, and soft fat smears their feathers.</li>
          </ul>
        </section>
      </main>

      <footer>No birds were fed bread in the making of this page. What happens in the garden is on you.</footer>
    </>
  )
}

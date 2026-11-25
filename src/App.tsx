import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { birds, foods, seasons, type BirdId, type FoodId, type SeasonId } from './data'

// three.js is the heavy part, so it loads after the text is on screen
const Scene = lazy(() => import('./Scene'))

// shortcut: assumes northern-hemisphere seasons, add a hemisphere switch if visitors from the south matter
const thisSeason = (['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as const)[new Date().getMonth()]
const NOBODY: BirdId[] = []

// keeps the guide readable when WebGL is missing
class SceneGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p className="no3d">The 3D garden needs WebGL, which this browser didn't provide. The bird buttons below still work.</p> : this.props.children
  }
}

function Chips<T extends string>({ label, items, value, onPick }: { label: string; items: Record<T, { name: string; emoji: string }>; value: T | null; onPick: (id: T) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {(Object.keys(items) as T[]).map((id) => (
        <button key={id} data-id={id} aria-pressed={value === id} onClick={() => onPick(id)}>
          <span aria-hidden="true">{items[id].emoji}</span>
          {items[id].name}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [food, setFood] = useState<FoodId | null>(null)
  const [season, setSeason] = useState<SeasonId>(thisSeason)
  const [picked, setPicked] = useState<BirdId | null>(null)

  const guests: BirdId[] = food ? foods[food].birds : NOBODY
  const crowAtTable = guests.includes('crow')
  const listed: BirdId[] = crowAtTable ? guests : [...guests, 'crow']
  const { sky, emoji, name, tip } = seasons[season]

  return (
    <>
      <header className="hero">
        <h1>Feed the Birds</h1>
        <p>A tiny guide to running the most popular restaurant in your garden.</p>
      </header>

      <main>
        <section id="feeder">
          <h2>What's on the menu?</h2>
          <p>Put something on the table and see who drops by.</p>
          <Chips label="Food" items={foods} value={food} onPick={(id) => (setFood(id), setPicked(null))} />

          <div className="stage" style={{ background: `linear-gradient(${sky[0]}, ${sky[1]})` }}>
            <div className="canvas" role="img" aria-label={`A 3D garden in ${name.toLowerCase()} with a bird table. The birds in it are listed as buttons below.`}>
              <SceneGuard>
                <Suspense fallback={null}>
                  <Scene season={season} food={food} guests={guests} picked={picked} onPick={setPicked} />
                </Suspense>
              </SceneGuard>
            </div>
            <span className="hint">Drag to look around</span>
            <Chips label="Season" items={seasons} value={season} onPick={setSeason} />
          </div>

          <div className="info" aria-live="polite">
            <p className="note">
              <strong>On the table</strong> {food ? foods[food].note : 'Nothing yet. Pick a food above. Somebody in the tree is already watching.'}
            </p>
            <p className="tip">
              <strong>
                {emoji} {name}
              </strong>{' '}
              {tip}
            </p>
          </div>

          <div className="guests">
            <div className="chips" role="group" aria-label="Birds in the garden">
              {listed.map((id) => (
                <button key={id} aria-pressed={picked === id} onClick={() => setPicked(picked === id ? null : id)}>
                  <span className="dot" style={{ background: birds[id].belly, borderColor: birds[id].wing }} />
                  {birds[id].name}
                  {id === 'crow' && !crowAtTable && ' (in the tree)'}
                </button>
              ))}
            </div>
            <p className="fact" aria-live="polite">
              {picked ? (
                <>
                  <strong>{birds[picked].name}.</strong> {birds[picked].fact}
                </>
              ) : (
                'Tap a bird, here or in the garden, to learn its secret.'
              )}
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

      <footer>No birds were fed bread in the making of this page.</footer>
    </>
  )
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { start } from './server.js'

test('two birds share a garden: join, feed, eat, leave', async () => {
  const { port, stop } = await start(0)

  async function fly(bird) {
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    const inbox = []
    ws.onmessage = (e) => inbox.push(JSON.parse(e.data))
    await new Promise((open) => (ws.onopen = open))
    const say = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m))
    const next = async (t) => {
      for (let i = 0; i < 200; i++) {
        const k = inbox.findIndex((m) => m.t === t)
        if (k >= 0) return inbox.splice(k, 1)[0]
        await sleep(10)
      }
      throw new Error(`no "${t}" message arrived`)
    }
    say({ t: 'hi', bird })
    return { ws, say, next, inbox, me: (await next('welcome')).you }
  }

  const crow = await fly('crow')
  const robin = await fly('robin')
  assert.equal((await crow.next('join')).p.bird, 'crow')
  assert.equal((await crow.next('join')).p.bird, 'robin', 'the crow sees the robin arrive')

  // junk must not hurt: bad JSON, wrong types, unknown birds and foods
  crow.say('not json')
  crow.say({ t: 'pos', x: 'NaN', y: null })
  crow.say({ t: 'hi', bird: 'dragon' })
  crow.say({ t: 'feed', kind: ['peanuts'] })

  crow.say({ t: 'feed', kind: 'peanuts' })
  const { items } = await robin.next('drop')
  assert.equal(items.length, 6)
  assert.equal(items[0].kind, 'peanuts')
  const nut = items[0]

  // a robin doesn't eat peanuts, and a crow can't eat from across the garden
  robin.say({ t: 'pos', x: nut.x, y: 1.505, z: nut.z, yaw: 0 })
  robin.say({ t: 'eat', item: nut.id })
  crow.say({ t: 'pos', x: 4, y: 4, z: 0, yaw: 0 })
  crow.say({ t: 'eat', item: nut.id })
  // then the crow lands next to it
  crow.say({ t: 'pos', x: nut.x, y: 1.505, z: nut.z, yaw: 0 })
  crow.say({ t: 'eat', item: nut.id })
  assert.deepEqual(await robin.next('ate'), { t: 'ate', item: nut.id, by: crow.me, kind: 'peanuts', score: 1 }, 'only the crow next to the peanut gets it')

  // anyone can eat bread, and it scores nothing
  robin.say({ t: 'feed', kind: 'bread' })
  const slice = (await robin.next('drop')).items[0]
  robin.say({ t: 'pos', x: slice.x, y: 1.505, z: slice.z, yaw: 0 })
  robin.say({ t: 'eat', item: slice.id })
  const ate = await robin.next('ate')
  assert.equal(ate.by, robin.me)
  assert.equal(ate.score, 0)

  // positions are broadcast, and clamped to the island
  crow.say({ t: 'pos', x: 999, y: -5, z: 0, yaw: 0 })
  await sleep(150)
  robin.inbox.length = 0 // drop older position updates
  const seen = (await robin.next('pos')).p.find(([id]) => id === crow.me)
  assert.deepEqual(seen.slice(1, 4), [4.3, 0, 0])

  robin.ws.close()
  assert.equal((await crow.next('leave')).id, robin.me)
  stop()
})

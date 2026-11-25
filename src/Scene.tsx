import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { birds, foods, MAX_Y, seasons, TABLE_Y, WORLD_R, type Bird, type Food, type SeasonId } from './data'
import { input, sync, useWorld, world, type Player } from './game'

type V3 = [number, number, number]

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const TARGET = new THREE.Vector3(0, 1.9, 0)
const UP = new THREE.Vector3(0, 1, 0)
// places to land besides the ground, as [x, y, z, radius]: the table, the bird bath, the crow's branch
const PERCHES = [[0, TABLE_Y, 0, 1.35], [2.3, 0.84, 0.3, 0.45], [-1.62, 2.47, -0.67, 0.4]]

const ball = new THREE.SphereGeometry(1, 14, 10)
const rock = new THREE.IcosahedronGeometry(1, 1)
const branchTilt = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(1.1, 0.16, 0.66).normalize())
const goal = new THREE.Vector3()
const fwd = new THREE.Vector3()
const turn = new THREE.Quaternion()

const Mat = ({ c }: { c: string }) => <meshStandardMaterial color={c} flatShading roughness={0.6} />

function Blob({ p, s, c }: { p: V3; s: V3 | number; c: string }) {
  return (
    <mesh geometry={ball} position={p} scale={s} castShadow>
      <Mat c={c} />
    </mesh>
  )
}

function Cyl({ p, args, c, children }: { p: V3; args: [number, number, number, number]; c: string; children?: ReactNode }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={args} />
      <Mat c={c} />
      {children}
    </mesh>
  )
}

function Rig() {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls>(null!)
  useEffect(() => {
    const c = (controls.current = new OrbitControls(camera, gl.domElement))
    c.target.copy(TARGET)
    c.enablePan = c.enableZoom = false // zoom off so the mouse wheel keeps scrolling the page
    c.minPolarAngle = 1
    c.maxPolarAngle = 1.5
    c.minAzimuthAngle = -1.1
    c.maxAzimuthAngle = 1.1
    c.update()
    return () => c.dispose()
  }, [camera, gl])
  useEffect(() => {
    // pull back on narrow screens so the table and the tree both stay in frame
    const target = controls.current.target
    camera.position.sub(target).setLength(6 * Math.max(1, 1.2 / (size.width / size.height))).add(target)
    camera.lookAt(target)
  }, [camera, size])
  useFrame((_, dt) => {
    // look between the garden's centre and your bird, so you never fly out of the picture
    const target = controls.current.target
    goal.set(world.me.x, world.me.y + 0.4, world.me.z).lerp(TARGET, 0.4).sub(target).multiplyScalar(calm ? 1 : 1 - Math.exp(-dt * 3))
    target.add(goal)
    camera.position.add(goal)
  })
  return null
}

// Your own flight: steering, flapping, gravity and landing. Everyone else's birds just follow what the server reports.
function Flight() {
  const vel = useRef(new THREE.Vector3())
  const sent = useRef(0)
  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05) // a background tab must not teleport you
    const me = world.me
    const v = vel.current
    const now = performance.now()
    const slow = now < me.stuffed ? 0.4 : 1
    const speed = (3.8 - 0.4 * birds[me.bird].size) * slow // small birds are nimbler

    // steer relative to where the camera looks, so "up" is always "away from you"
    camera.getWorldDirection(fwd).setY(0).normalize()
    const k = Math.min(1, dt * 6)
    v.x += ((fwd.x * input.z - fwd.z * input.x) * speed - v.x) * k
    v.z += ((fwd.z * input.z + fwd.x * input.x) * speed - v.z) * k
    v.y = input.flap ? Math.min(v.y + 16 * dt, 3 * slow) : Math.max(v.y - 7 * dt, -4)

    const wasY = me.y
    me.x += v.x * dt
    me.y = Math.min(me.y + v.y * dt, MAX_Y)
    me.z += v.z * dt
    const r = Math.hypot(me.x, me.z)
    if (r > WORLD_R) {
      me.x *= WORLD_R / r
      me.z *= WORLD_R / r
    }

    // land on the highest perch you came down onto; you can fly up through them from below
    let floor = 0
    for (const [px, py, pz, pr] of PERCHES) if (wasY >= py - 0.01 && Math.hypot(me.x - px, me.z - pz) < pr) floor = Math.max(floor, py)
    me.air = me.y > floor
    if (!me.air) {
      me.y = floor
      v.y = 0
    }
    if (Math.hypot(v.x, v.z) > 0.3) me.yaw = Math.atan2(v.x, v.z)

    if (now - sent.current > 66) {
      sent.current = now
      sync()
    }
  })
  return null
}

function BirdModel({ p, mine }: { p: Player; mine?: boolean }) {
  const b: Bird = birds[p.bird]
  const outer = useRef<THREE.Group>(null!)
  const inner = useRef<THREE.Group>(null!)
  const wingL = useRef<THREE.Group>(null!)
  const wingR = useRef<THREE.Group>(null!)
  const beak = b.beak ?? '#3a3128'
  const size = b.size * 0.75

  useLayoutEffect(() => void outer.current.position.set(p.x, p.y, p.z), [p])

  useFrame((_, dt) => {
    const o = outer.current
    const now = performance.now()
    const t = now / 1000 + p.id
    // your own bird is exact; the others glide between the server's 15 updates a second
    goal.set(p.x, p.y, p.z)
    if (mine) o.position.copy(goal)
    else o.position.lerp(goal, 1 - Math.exp(-dt * 12))
    o.quaternion.slerp(turn.setFromAxisAngle(UP, p.yaw), 1 - Math.exp(-dt * 10))

    const flap = p.air ? Math.sin(t * 24) * 0.9 : -1.35
    wingR.current.rotation.z = flap
    wingL.current.rotation.z = -flap
    const i = inner.current
    // lean into the flight, peck after eating, hop when calling
    i.rotation.x = p.air ? 0.3 : now < p.peck ? Math.abs(Math.sin(t * 16)) * 0.9 : 0
    i.position.y = now < p.hop && !calm ? Math.abs(Math.sin(t * 14)) * 0.2 : 0
    const fat = now < p.stuffed ? 1.45 : 1 // full of bread
    i.scale.set(size * fat, size, size * fat)
  })

  return (
    <group ref={outer}>
      <group ref={inner}>
        <Blob p={[0, 0.3, 0]} s={[0.2, 0.19, 0.25]} c={b.back} />
        <Blob p={[0, 0.27, 0.07]} s={[0.175, 0.17, 0.2]} c={b.belly} />
        <Blob p={[0, 0.5, 0.12]} s={0.13} c={b.head} />
        {b.cap && <Blob p={[0, 0.57, 0.1]} s={[0.12, 0.075, 0.125]} c={b.cap} />}
        <Blob p={[0.07, 0.53, 0.225]} s={0.022} c={b.eye ?? '#111111'} />
        <Blob p={[-0.07, 0.53, 0.225]} s={0.022} c={b.eye ?? '#111111'} />
        <mesh position={[0, 0.5, 0.27]} rotation-x={Math.PI / 2} castShadow>
          <coneGeometry args={[0.035, 0.12, 6]} />
          <Mat c={beak} />
        </mesh>
        <group ref={wingR} position={[0.17, 0.4, 0]}>
          <Blob p={[0.13, 0, 0]} s={[0.15, 0.02, 0.12]} c={b.wing} />
        </group>
        <group ref={wingL} position={[-0.17, 0.4, 0]}>
          <Blob p={[-0.13, 0, 0]} s={[0.15, 0.02, 0.12]} c={b.wing} />
        </group>
        <group position={[0, 0.3, -0.2]} rotation-x={b.tailUp ? 1 : -0.1}>
          <Blob p={[0, 0, -0.1]} s={[0.07, 0.015, 0.13]} c={b.wing} />
        </group>
        <Blob p={[0.06, 0.07, 0]} s={[0.012, 0.08, 0.012]} c="#3a3128" />
        <Blob p={[-0.06, 0.07, 0]} s={[0.012, 0.08, 0.012]} c="#3a3128" />
        {mine && (
          // the pink arrow that says "this one is you"
          <mesh position={[0, 0.92, 0.05]} rotation-x={Math.PI}>
            <coneGeometry args={[0.08, 0.16, 4]} />
            <meshBasicMaterial color="#ff2d78" toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  )
}

function Garden({ season }: { season: SeasonId }) {
  const { grass, leaf } = seasons[season]
  const bark = '#6b4a31'
  const stone = '#b9b6ae'
  return (
    <>
      <Cyl p={[0, -0.66, 0]} args={[4.4, 3.4, 1.2, 28]} c="#7a5a3c" />
      <Cyl p={[0, -0.06, 0]} args={[4.5, 4.5, 0.12, 28]} c={grass} />

      <group position={[-2.5, 0, -1.2]}>
        <Cyl p={[0, 1.7, 0]} args={[0.16, 0.26, 3.4, 8]} c={bark} />
        <mesh position={[0.55, 2.38, 0.33]} quaternion={branchTilt} castShadow>
          <cylinderGeometry args={[0.06, 0.09, 1.35, 6]} />
          <Mat c={bark} />
        </mesh>
        {([[-0.2, 4, -0.2, 1.1], [-0.9, 3.4, 0.3, 0.8], [0.5, 3.6, -0.6, 0.8], [0, 4.7, 0, 0.75]] as const).map(([x, y, z, r], i) => (
          <mesh key={i} geometry={rock} position={[x, y, z]} scale={r} castShadow>
            <Mat c={leaf} />
          </mesh>
        ))}
      </group>

      {([[2.9, 0.35, -1.8, 0.6], [3.4, 0.3, -1, 0.45], [-3.6, 0.3, 0.6, 0.5]] as const).map(([x, y, z, r], i) => (
        <mesh key={i} geometry={rock} position={[x, y, z]} scale={r} castShadow>
          <Mat c={leaf} />
        </mesh>
      ))}

      {/* bird bath, because rule two is "always offer water" */}
      <Cyl p={[2.3, 0.35, 0.3]} args={[0.1, 0.14, 0.7, 8]} c={stone} />
      <Cyl p={[2.3, 0.76, 0.3]} args={[0.5, 0.3, 0.14, 16]} c={stone} />
      <Cyl p={[2.3, 0.835, 0.3]} args={[0.44, 0.44, 0.01, 16]} c={season === 'winter' ? '#dcecf7' : '#5fb0e6'} />

      {/* bird table */}
      <Cyl p={[0, 0.75, 0]} args={[0.07, 0.09, 1.5, 8]} c="#8a5a34" />
      <Cyl p={[0, TABLE_Y - 0.045, 0]} args={[1.4, 1.3, 0.09, 28]} c="#a9743f" />
      <mesh position={[0, TABLE_Y + 0.01, 0]} rotation-x={Math.PI / 2} castShadow>
        <torusGeometry args={[1.4, 0.04, 6, 32]} />
        <Mat c="#8a5a34" />
      </mesh>
    </>
  )
}

function Snow() {
  const points = useRef<THREE.Points>(null!)
  const flakes = useMemo(() => Float32Array.from({ length: 900 }, () => (Math.random() - 0.5) * 10), [])
  useFrame((_, dt) => {
    if (calm) return
    const pos = points.current.geometry.attributes.position
    for (let i = 1; i < pos.array.length; i += 3) pos.array[i] = pos.array[i] < -5 ? 5 : pos.array[i] - dt * 0.6
    pos.needsUpdate = true
  })
  return (
    <points ref={points} position={[0, 2, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[flakes, 3]} />
      </bufferGeometry>
      <pointsMaterial color="white" size={0.07} />
    </points>
  )
}

export default function Scene({ season }: { season: SeasonId }) {
  useWorld()
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: [0, 2.8, 5.9], fov: 40 }}>
      <Rig />
      <Flight />
      <hemisphereLight args={['#ffffff', seasons[season].grass, 1.6]} />
      <directionalLight position={[4, 8, 5]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <Garden season={season} />
      {season === 'winter' && <Snow />}

      {[...world.items.values()].map((it) => {
        const { color, size, round }: Food['pile'] = foods[it.kind].pile
        const s = Math.max(size, 0.07) // single seeds have to be big enough to aim for
        return (
          <mesh key={it.id} geometry={ball} position={[it.x, TABLE_Y + s * (round ? 1 : 0.6), it.z]} rotation-y={it.id} scale={round ? s : [s, s * 0.6, s * 1.5]} castShadow>
            <Mat c={color} />
          </mesh>
        )
      })}

      <BirdModel p={world.me} mine />
      {[...world.others.values()].map((p) => (
        <BirdModel key={p.id} p={p} />
      ))}
    </Canvas>
  )
}

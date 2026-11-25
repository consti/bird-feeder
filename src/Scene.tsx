import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { birds, foods, seasons, type Bird, type BirdId, type Food, type FoodId, type SeasonId } from './data'

type V3 = [number, number, number]

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const TARGET = new THREE.Vector3(0, 1.9, 0)
const TABLE_Y = 1.505
const UP = new THREE.Vector3(0, 1, 0)
const ids = Object.keys(birds) as BirdId[]

// small birds wait far out of frame; the crow waits on its branch, watching
const homes = Object.fromEntries(
  ids.map((id, i) => [id, id === 'crow' ? new THREE.Vector3(-1.62, 2.5, -0.67) : new THREE.Vector3(i % 2 ? 11 : -11, 5 + (i % 3), -3 - (i % 4))]),
) as Record<BirdId, THREE.Vector3>

const ball = new THREE.SphereGeometry(1, 14, 10)
const rock = new THREE.IcosahedronGeometry(1, 1)
const branchTilt = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(1.1, 0.16, 0.66).normalize())
const gap = new THREE.Vector3()
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
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.copy(TARGET)
    controls.enablePan = controls.enableZoom = false // zoom off so the mouse wheel keeps scrolling the page
    controls.minPolarAngle = 1
    controls.maxPolarAngle = 1.5
    controls.minAzimuthAngle = -1.1
    controls.maxAzimuthAngle = 1.1
    controls.update()
    return () => controls.dispose()
  }, [camera, gl])
  useEffect(() => {
    // pull back on narrow screens so the tree and the table both stay in frame
    camera.position.sub(TARGET).setLength(6 * Math.max(1, 1.5 / (size.width / size.height))).add(TARGET)
    camera.lookAt(TARGET)
  }, [camera, size])
  return null
}

function BirdModel({ id, phase, slot, picked, onPick }: { id: BirdId; phase: number; slot?: THREE.Vector3; picked: boolean; onPick: (id: BirdId) => void }) {
  const b: Bird = birds[id]
  const outer = useRef<THREE.Group>(null!)
  const inner = useRef<THREE.Group>(null!)
  const wingL = useRef<THREE.Group>(null!)
  const wingR = useRef<THREE.Group>(null!)
  const to = slot ?? homes[id]
  const beak = b.beak ?? '#3a3128'

  useFrame((_, dt) => {
    const o = outer.current
    const t = performance.now() / 1000 + phase
    const d = gap.subVectors(to, o.position).length()
    const flying = d > 0.01
    // cruise, then slow down for the landing; the crow takes its time
    if (flying) o.position.addScaledVector(gap, (calm ? d : Math.min(d, THREE.MathUtils.clamp(d * 2.5, 1, id === 'crow' ? 6 : 9) * dt)) / d)
    o.visible = !!slot || id === 'crow' || d > 0.5

    // in the air face where you're going, at the table face the food, on the branch keep an eye on the visitor
    const yaw = d > 0.3 ? Math.atan2(gap.x, gap.z) : slot ? Math.atan2(-to.x, -to.z) : 0.4 + (calm ? 0 : Math.sin(t * 0.7) * 0.4)
    o.quaternion.slerp(turn.setFromAxisAngle(UP, yaw), calm ? 1 : 1 - Math.exp(-dt * 8))

    const flap = flying ? Math.sin(t * 24) * 0.9 : -1.35
    wingR.current.rotation.z = flap
    wingL.current.rotation.z = -flap
    // lean into the flight, peck at the table
    inner.current.rotation.x = flying ? 0.3 : slot && !calm ? Math.max(0, Math.sin(t * 2.2)) ** 6 * 0.9 : 0
    inner.current.position.y = picked && !calm ? Math.abs(Math.sin(t * 7)) * 0.15 : 0
  })

  return (
    <group
      ref={outer}
      position={homes[id]}
      onClick={(e) => (e.stopPropagation(), onPick(id))}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <group ref={inner} scale={b.size * 0.75}>
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

function Pile({ food }: { food: FoodId }) {
  const { color, size, count, round }: Food['pile'] = foods[food].pile
  return (
    <group position={[0, TABLE_Y, 0]}>
      {Array.from({ length: count }, (_, i) => {
        const r = 0.45 * Math.sqrt(i / count) // golden-angle spiral
        const a = i * 2.4
        return (
          <mesh key={i} geometry={ball} position={[Math.cos(a) * r, size * (round ? 1 : 0.6), Math.sin(a) * r]} rotation-y={a} scale={round ? size : [size, size * 0.6, size * 1.5]} castShadow>
            <Mat c={color} />
          </mesh>
        )
      })}
    </group>
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

export default function Scene({ season, food, guests, picked, onPick }: { season: SeasonId; food: FoodId | null; guests: BirdId[]; picked: BirdId | null; onPick: (id: BirdId | null) => void }) {
  // guests spread along the far edge of the table so they face the visitor
  const slots = useMemo(
    () =>
      new Map(
        guests.map((id, i) => {
          const a = (i - (guests.length - 1) / 2) * 0.7
          return [id, new THREE.Vector3(Math.sin(a) * 1.15, TABLE_Y, -Math.cos(a) * 1.15)]
        }),
      ),
    [guests],
  )
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: [0, 2.8, 5.9], fov: 40 }} onPointerMissed={() => onPick(null)}>
      <Rig />
      <hemisphereLight args={['#ffffff', seasons[season].grass, 1.6]} />
      <directionalLight position={[4, 8, 5]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <Garden season={season} />
      {food && <Pile key={food} food={food} />}
      {season === 'winter' && <Snow />}
      {ids.map((id, i) => (
        <BirdModel key={id} id={id} phase={i} slot={slots.get(id)} picked={picked === id} onPick={onPick} />
      ))}
    </Canvas>
  )
}

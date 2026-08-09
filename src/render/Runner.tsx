/**
 * Løperen: en enkel lav-poly skiløper — hode, torso, armer med staver, og
 * ski. Staven på hver side gir ett raskt utslag idet spilleren tapper den
 * siden, ellers henger den i hvile. Hodelykta henger på og lyser framover
 * ned i tåka.
 */

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Matrix4, Object3D, Vector3, type Group, type SpotLight } from 'three'
import { createPose, samplePose } from '../engine/simStore'
import type { SimStore } from '../engine/simStore'
import { clamp } from '../sim/rng'
import type { World } from '../sim/world/types'
import { GEAR, RUNNER } from './palette'

// --- Kropp ---
const HEAD_RADIUS = 0.17
const TORSO_RADIUS = 0.3
const TORSO_LENGTH = 0.72
const TORSO_Y = TORSO_RADIUS + TORSO_LENGTH / 2
const TORSO_TOP = TORSO_RADIUS * 2 + TORSO_LENGTH
/** Sitter et halvt hoderadius nedi torsotoppen, så det ikke blir hals-gap. */
const HEAD_Y = TORSO_TOP + HEAD_RADIUS * 0.5

/** Hvor lykta sitter over bakken — like over hodet. */
const LAMP_Y = HEAD_Y + HEAD_RADIUS * 0.9
/** Hvor langt framme lykta sikter, i lokale koordinater. */
const AIM = new Vector3(0, -0.55, -14)

// --- Armer og staver ---
const SHOULDER_Y = TORSO_TOP - 0.15
const SHOULDER_X = TORSO_RADIUS + 0.06
/** Armen vinkler litt ut fra kroppen i hvile. */
const SHOULDER_OUT = 0.22
const ARM_RADIUS = 0.07
const ARM_LENGTH = 0.42
const POLE_RADIUS = 0.025
const POLE_LENGTH = 0.75
/** Hvor mye stav/arm henger bakover i hvile, radianer. */
const REST_ANGLE = -0.3
/** Utslaget ett tapp gir, radianer. */
const SWING_AMPLITUDE = 1.0
/** Hvor lenge ett stavtak varer, sekunder. Godt under korteste realistiske
 *  intervall mellom to tapp på samme side (~0.64 s ved MIN_INTERVAL). */
const SWING_DURATION = 0.32

// --- Ski ---
const SKI_LENGTH = 1.7
const SKI_WIDTH = 0.08
const SKI_THICKNESS = 0.03
const SKI_GAUGE = 0.4
/** Skiene stikker lenger fram enn bak — se `-Z er framover` under. */
const SKI_FORWARD_OFFSET = -0.2

const UP = new Vector3(0, 1, 0)

/** Vinkelen til én arm/stav-pivot: hvile pluss et raskt utslag fra siste tapp. */
function swingAngle(now: number, tapAt: number | null): number {
  if (tapAt === null) return REST_ANGLE
  const phase = clamp((now - tapAt) / SWING_DURATION, 0, 1)
  return REST_ANGLE + SWING_AMPLITUDE * Math.sin(Math.PI * phase)
}

/** Arm + stav for én side. Pivoten (foreldregruppa) roteres i useFrame. */
function armAndPole(sign: 1 | -1) {
  return (
    <group rotation={[0, 0, sign * SHOULDER_OUT]}>
      <mesh position={[0, -ARM_LENGTH / 2, 0]}>
        <capsuleGeometry args={[ARM_RADIUS, Math.max(ARM_LENGTH - ARM_RADIUS * 2, 0.01), 3, 8]} />
        <meshStandardMaterial color={RUNNER} flatShading roughness={0.85} metalness={0} />
      </mesh>
      <mesh position={[0, -(ARM_LENGTH + POLE_LENGTH / 2), 0]}>
        <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS * 1.6, POLE_LENGTH, 6]} />
        <meshStandardMaterial color={GEAR} flatShading roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  )
}

export function Runner({
  store,
  world,
  intensity,
  angle,
}: {
  store: SimStore
  world: World
  intensity: number
  angle: number
}) {
  const group = useRef<Group>(null)
  const lamp = useRef<SpotLight>(null)
  const aim = useRef<Object3D>(null)
  const leftPivot = useRef<Group>(null)
  const rightPivot = useRef<Group>(null)

  /** Sim-tid for siste tapp vi allerede har lest av, per side. */
  const leftTapAt = useRef<number | null>(null)
  const rightTapAt = useRef<number | null>(null)
  /** Siste `lastTapTime` vi har sortert inn i en av sidene over. */
  const seenTapTime = useRef<number | null>(null)

  useLayoutEffect(() => {
    // Spotlighten sikter mot et objekt, ikke en retning. Målet er barn av
    // gruppa, så det følger løperen uten noe mer bokføring.
    if (lamp.current && aim.current) lamp.current.target = aim.current
  }, [])

  const pose = useRef(createPose())
  const forward = useRef(new Vector3())
  const matrix = useRef(new Matrix4())
  const origin = useRef(new Vector3())

  useFrame(() => {
    const g = group.current
    if (!g) return

    const p = samplePose(store, world, 'skier', pose.current)
    g.position.set(p.x, p.y, p.z)

    // Matrix4.lookAt legger lokal +Z mot (eye - target). Med øyet i origo
    // og målet framover blir lokal -Z framover — samme konvensjon som lys
    // og kamera bruker.
    forward.current.set(p.tx, p.ty, p.tz)
    matrix.current.lookAt(origin.current, forward.current, UP)
    g.quaternion.setFromRotationMatrix(matrix.current)

    // Nytt tapp registrert siden sist? Book det inn på riktig side, så de
    // to stavene svinger uavhengig av hverandre.
    const cadence = store.curr.skier.cadence
    if (cadence.lastTapTime !== seenTapTime.current) {
      seenTapTime.current = cadence.lastTapTime
      if (cadence.lastTapTime !== null) {
        const tapRef = cadence.lastSide === 'L' ? leftTapAt : rightTapAt
        tapRef.current = cadence.lastTapTime
      }
    }

    const now = store.curr.t
    if (leftPivot.current) leftPivot.current.rotation.x = swingAngle(now, leftTapAt.current)
    if (rightPivot.current) rightPivot.current.rotation.x = swingAngle(now, rightTapAt.current)
  })

  return (
    <group ref={group}>
      <mesh position={[0, HEAD_Y, 0]}>
        <sphereGeometry args={[HEAD_RADIUS, 8, 6]} />
        <meshStandardMaterial color={RUNNER} flatShading roughness={0.85} metalness={0} />
      </mesh>

      <mesh position={[0, TORSO_Y, 0]}>
        <capsuleGeometry args={[TORSO_RADIUS, TORSO_LENGTH, 4, 12]} />
        <meshStandardMaterial color={RUNNER} flatShading roughness={0.85} metalness={0} />
      </mesh>

      <group ref={leftPivot} position={[-SHOULDER_X, SHOULDER_Y, 0]}>
        {armAndPole(-1)}
      </group>
      <group ref={rightPivot} position={[SHOULDER_X, SHOULDER_Y, 0]}>
        {armAndPole(1)}
      </group>

      {[-1, 1].map((sign) => (
        <mesh
          key={sign}
          position={[sign * SKI_GAUGE, SKI_THICKNESS / 2, SKI_FORWARD_OFFSET]}
        >
          <boxGeometry args={[SKI_WIDTH, SKI_THICKNESS, SKI_LENGTH]} />
          <meshStandardMaterial color={GEAR} flatShading roughness={0.6} metalness={0.1} />
        </mesh>
      ))}

      <object3D ref={aim} position={AIM} />
      <spotLight
        ref={lamp}
        position={[0, LAMP_Y, 0]}
        intensity={intensity}
        angle={angle}
        penumbra={0.55}
        distance={70}
        decay={1.4}
        color="#dce8ff"
      />
    </group>
  )
}

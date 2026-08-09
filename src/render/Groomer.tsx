/**
 * Løypemaskinen. En grå boks i riktig størrelse, ikke noe mer.
 *
 * Karosseriet henger under en tom node som heter «vehicleRoot». Den er hele
 * poenget med filen: en GLB kan settes inn der senere uten at posisjonering,
 * lys eller noe annet må røres.
 */

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Matrix4, Vector3, type Group, type Object3D, type SpotLight } from 'three'
import { createPose, samplePose, type SimStore } from '../engine/simStore'
import type { World } from '../sim/world/types'
import { GEAR } from './palette'

/** Målene på en ekte tråkkemaskin, i meter. */
const BODY_WIDTH = 3
const BODY_HEIGHT = 2.5
const BODY_LENGTH = 6
/** Beltene stikker litt ut til side og løfter kroppen. */
const TRACK_WIDTH = 0.6
const TRACK_HEIGHT = 0.7

/** Lyskasterne sitter på taket, ett par framover. */
const LAMP_Y = BODY_HEIGHT + TRACK_HEIGHT * 0.5
const LAMP_X = BODY_WIDTH * 0.32
const AIM = new Vector3(0, -2, -26)

const UP = new Vector3(0, 1, 0)
const BODY_COLOUR = '#6c727d'

export function Groomer({
  store,
  world,
  intensity,
}: {
  store: SimStore
  world: World
  intensity: number
}) {
  const group = useRef<Group>(null)
  const aim = useRef<Object3D>(null)
  const left = useRef<SpotLight>(null)
  const right = useRef<SpotLight>(null)

  const pose = useRef(createPose())
  const forward = useRef(new Vector3())
  const matrix = useRef(new Matrix4())
  const origin = useRef(new Vector3())

  useLayoutEffect(() => {
    // Spotlighter sikter mot et objekt, ikke en retning. Målet er barn av
    // gruppa, så det følger maskinen uten noe mer bokføring.
    if (!aim.current) return
    if (left.current) left.current.target = aim.current
    if (right.current) right.current.target = aim.current
  }, [])

  useFrame(() => {
    const g = group.current
    if (!g) return

    const p = samplePose(store, world, 'groomer', pose.current)
    g.position.set(p.x, p.y, p.z)

    // Matrix4.lookAt legger lokal +Z mot (eye - target). Med øyet i origo og
    // målet framover blir lokal -Z framover — samme konvensjon som lys og kamera.
    forward.current.set(p.tx, p.ty, p.tz)
    matrix.current.lookAt(origin.current, forward.current, UP)
    g.quaternion.setFromRotationMatrix(matrix.current)
  })

  return (
    <group ref={group}>
      <group name="vehicleRoot">
        <mesh position={[0, TRACK_HEIGHT + BODY_HEIGHT / 2, 0]}>
          <boxGeometry args={[BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH]} />
          <meshStandardMaterial color={BODY_COLOUR} flatShading roughness={0.75} metalness={0.15} />
        </mesh>
        {[-1, 1].map((sign) => (
          <mesh
            key={sign}
            position={[sign * (BODY_WIDTH / 2 + TRACK_WIDTH / 2 - 0.1), TRACK_HEIGHT / 2, 0]}
          >
            <boxGeometry args={[TRACK_WIDTH, TRACK_HEIGHT, BODY_LENGTH * 0.95]} />
            <meshStandardMaterial color={GEAR} flatShading roughness={0.9} metalness={0} />
          </mesh>
        ))}
      </group>

      <object3D ref={aim} position={AIM} />
      <spotLight
        ref={left}
        position={[-LAMP_X, LAMP_Y, -BODY_LENGTH / 2]}
        intensity={intensity}
        angle={0.7}
        penumbra={0.5}
        distance={90}
        decay={1.3}
        color="#fff3d6"
      />
      <spotLight
        ref={right}
        position={[LAMP_X, LAMP_Y, -BODY_LENGTH / 2]}
        intensity={intensity}
        angle={0.7}
        penumbra={0.5}
        distance={90}
        decay={1.3}
        color="#fff3d6"
      />
    </group>
  )
}

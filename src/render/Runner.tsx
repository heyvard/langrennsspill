/**
 * Løperen: en grå kapsel. Ingen karaktermodell, ingen animasjon.
 * Hodelykta henger på den og lyser framover ned i tåka.
 */

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Matrix4, Object3D, Vector3, type Group, type SpotLight } from 'three'
import { sampleS } from '../engine/simStore'
import type { SimStore } from '../engine/simStore'
import type { Track } from '../sim/track'
import { RUNNER } from './palette'

const RADIUS = 0.34
const BODY = 0.95
const HEIGHT = BODY + RADIUS * 2
/** Hvor hodelykta sitter over bakken. */
const LAMP_Y = 1.45
/** Hvor langt framme lykta sikter, i lokale koordinater. */
const AIM = new Vector3(0, -0.55, -14)

const UP = new Vector3(0, 1, 0)

export function Runner({
  store,
  track,
  intensity,
  angle,
}: {
  store: SimStore
  track: Track
  intensity: number
  angle: number
}) {
  const group = useRef<Group>(null)
  const lamp = useRef<SpotLight>(null)
  const aim = useRef<Object3D>(null)

  useLayoutEffect(() => {
    // Spotlighten sikter mot et objekt, ikke en retning. Målet er barn av
    // gruppa, så det følger løperen uten noe mer bokføring.
    if (lamp.current && aim.current) lamp.current.target = aim.current
  }, [])

  const forward = useRef(new Vector3())
  const matrix = useRef(new Matrix4())

  useFrame(() => {
    const g = group.current
    if (!g) return

    const s = sampleS(store, track.loopLength)
    const p = track.positionAt(s)
    const t = track.tangentAt(s)

    g.position.set(p.x, p.y, p.z)

    // Matrix4.lookAt legger lokal +Z mot (eye - target). Med øyet i origo
    // og målet framover blir lokal -Z framover — samme konvensjon som lys
    // og kamera bruker.
    forward.current.set(t.x, t.y, t.z)
    matrix.current.lookAt(new Vector3(0, 0, 0), forward.current, UP)
    g.quaternion.setFromRotationMatrix(matrix.current)
  })

  return (
    <group ref={group}>
      <mesh position={[0, HEIGHT / 2, 0]}>
        <capsuleGeometry args={[RADIUS, BODY, 4, 12]} />
        <meshStandardMaterial color={RUNNER} flatShading roughness={0.85} metalness={0} />
      </mesh>

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

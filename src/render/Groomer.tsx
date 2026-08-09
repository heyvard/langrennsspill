/**
 * Løypemaskinen. Karosseriet er en optimalisert GLB (public/models/groomer.glb,
 * se glTF-transform-pipelinen som produserte den) som lastes inn i en tom
 * node som heter «vehicleRoot». Den er hele poenget med gruppa: posisjonering,
 * lys og orientering under er uavhengig av hva som ligger i vehicleRoot.
 */

import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, Matrix4, Vector3, type Group, type Object3D, type SpotLight } from 'three'
import { createPose, samplePose, type SimStore } from '../engine/simStore'
import type { World } from '../sim/world/types'

// BASE_URL varierer mellom lokal dev ('/') og GitHub Pages-bygget
// ('/langrennsspill/', se vite.config.ts) — må brukes, ikke hardkodes.
const MODEL_PATH = `${import.meta.env.BASE_URL}models/groomer.glb`
useGLTF.preload(MODEL_PATH, false)

/** Modellrommets akser er kalibrert visuelt mot kjøreretning og bakkenivå. */
const MODEL_YAW = -Math.PI / 2
const MODEL_SCALE = 3.8

/** Lyskasterne sitter på taket, ett par framover. */
const LAMP_Y = 2.7
const LAMP_X = 1.5
const AIM = new Vector3(0, -2, -26)

const UP = new Vector3(0, 1, 0)

function GroomerModel() {
  const { scene } = useGLTF(MODEL_PATH, false)

  // Regnes ut fra scene-objektet før det henger under det poserte kjøretøyet
  // — ellers ville boksen blitt målt i verdensrom, forurenset av gruppas
  // faktiske kjøreposisjon, og korreksjonen ville skjøvet modellen langt av gårde.
  const offset = useMemo(() => {
    const box = new Box3().setFromObject(scene)
    const center = box.getCenter(new Vector3())
    if (import.meta.env.DEV) {
      console.debug('[Groomer] reell størrelse (m):', box.getSize(new Vector3()))
    }
    // Samme konvensjon som resten av gruppa: origo ved bakkenivå, ikke ved
    // geometrisk senter. Senter i XZ, løft slik at bunnen treffer lokal y=0.
    return [-center.x, -box.min.y, -center.z] as const
  }, [scene])

  return (
    <group rotation={[0, MODEL_YAW, 0]} scale={MODEL_SCALE}>
      <primitive object={scene} position={offset} />
    </group>
  )
}

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
        <Suspense fallback={null}>
          <GroomerModel />
        </Suspense>
      </group>

      <object3D ref={aim} position={AIM} />
      <spotLight
        ref={left}
        position={[-LAMP_X, LAMP_Y, -3]}
        intensity={intensity}
        angle={0.7}
        penumbra={0.5}
        distance={90}
        decay={1.3}
        color="#fff3d6"
      />
      <spotLight
        ref={right}
        position={[LAMP_X, LAMP_Y, -3]}
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

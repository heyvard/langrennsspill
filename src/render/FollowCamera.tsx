/**
 * Tredjepersonskamera bak det kjøretøyet man styrer. Mykt etterheng, litt lav
 * vinkel — lavt nok til at tåka og hodelykta fyller bildet.
 *
 * Løypemaskinen er stor og treg, så den får kameraet lenger bak og høyere.
 * Bytter man modus, glir kameraet over av seg selv: dempingen gjør resten.
 */

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { createPose, samplePose, type SimStore } from '../engine/simStore'
import type { Mode } from '../sim/types'
import type { HeightField } from '../sim/world/terrain'
import type { World } from '../sim/world/types'

type Rig = { distance: number; height: number; lookAhead: number }

const RIGS: Record<Mode, Rig> = {
  skier: { distance: 7.5, height: 2.3, lookAhead: 9 },
  groomer: { distance: 14, height: 6, lookAhead: 14 },
}

/** Etterheng. Lavt tall gir tregere, mykere kamera. */
const SMOOTHING = 4.5
/** Kameraet skal aldri havne under snøen. */
const MIN_CLEARANCE = 1.2

export function FollowCamera({
  store,
  world,
  height,
}: {
  store: SimStore
  world: World
  height: HeightField
}) {
  const pose = useRef(createPose())
  const desired = useRef(new Vector3())
  const target = useRef(new Vector3())
  const lookAt = useRef(new Vector3())
  const started = useRef(false)

  useFrame((state, delta) => {
    const mode = store.curr.mode
    const rig = RIGS[mode]
    const p = samplePose(store, world, mode, pose.current)

    desired.current.set(
      p.x - p.tx * rig.distance,
      p.y - p.ty * rig.distance + rig.height,
      p.z - p.tz * rig.distance,
    )
    // Hold kameraet over bakken selv når løypa stuper.
    const ground = height.heightAt(desired.current.x, desired.current.z)
    desired.current.y = Math.max(desired.current.y, ground + MIN_CLEARANCE)

    target.current.set(
      p.x + p.tx * rig.lookAhead,
      p.y + p.ty * rig.lookAhead + 1,
      p.z + p.tz * rig.lookAhead,
    )

    if (!started.current) {
      // Første bilde: hopp på plass i stedet for å svaie inn fra origo.
      state.camera.position.copy(desired.current)
      lookAt.current.copy(target.current)
      started.current = true
    } else {
      // Rammeuavhengig demping — samme følelse uansett bildefrekvens.
      const k = 1 - Math.exp(-SMOOTHING * Math.min(delta, 0.1))
      state.camera.position.lerp(desired.current, k)
      lookAt.current.lerp(target.current, k)
    }

    state.camera.lookAt(lookAt.current)
  })

  return null
}

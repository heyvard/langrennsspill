/**
 * Tredjepersonskamera bak løperen. Mykt etterheng, litt lav vinkel —
 * lavt nok til at tåka og hodelykta fyller bildet.
 */

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { sampleS, type SimStore } from '../engine/simStore'
import type { Track } from '../sim/track'

/** Avstand bak løperen, meter. */
const DISTANCE = 7.5
/** Høyde over sporet, meter. */
const HEIGHT = 2.3
/** Hvor langt foran løperen blikket hviler, meter. */
const LOOK_AHEAD = 9
/** Etterheng. Lavt tall gir tregere, mykere kamera. */
const SMOOTHING = 4.5
/** Kameraet skal aldri havne under snøen. */
const MIN_CLEARANCE = 1.2

export function FollowCamera({ store, track }: { store: SimStore; track: Track }) {
  const desired = useRef(new Vector3())
  const lookAt = useRef(new Vector3())
  const started = useRef(false)

  useFrame((state, delta) => {
    const s = sampleS(store, track.loopLength)
    const p = track.positionAt(s)
    const t = track.tangentAt(s)

    desired.current.set(
      p.x - t.x * DISTANCE,
      p.y - t.y * DISTANCE + HEIGHT,
      p.z - t.z * DISTANCE,
    )
    // Hold kameraet over bakken selv når sporet stuper.
    const ground = track.terrainHeightAt(desired.current.x, desired.current.z)
    desired.current.y = Math.max(desired.current.y, ground + MIN_CLEARANCE)

    const target = new Vector3(
      p.x + t.x * LOOK_AHEAD,
      p.y + t.y * LOOK_AHEAD + 1,
      p.z + t.z * LOOK_AHEAD,
    )

    if (!started.current) {
      // Første bilde: hopp på plass i stedet for å svaie inn fra origo.
      state.camera.position.copy(desired.current)
      lookAt.current.copy(target)
      started.current = true
    } else {
      // Rammeuavhengig demping — samme følelse uansett bildefrekvens.
      const k = 1 - Math.exp(-SMOOTHING * Math.min(delta, 0.1))
      state.camera.position.lerp(desired.current, k)
      lookAt.current.lerp(target, k)
    }

    state.camera.lookAt(lookAt.current)
  })

  return null
}

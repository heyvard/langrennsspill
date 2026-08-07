/**
 * Driveren: fast timestep med akkumulator, frikoblet fra render-loopen.
 * Rendringen interpolerer mellom prev og curr — den styrer aldri simuleringen.
 */

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { now, type TapSource } from '../input/useTaps'
import type { Params } from '../sim/constants'
import { partitionTaps, step } from '../sim/physics'
import { clamp } from '../sim/rng'
import type { Track } from '../sim/track'
import type { Tap } from '../sim/types'
import type { SimStore } from './simStore'

/** Tak på hvor mye tid ett bilde får hente inn. Beskytter mot fanebytte. */
const MAX_FRAME_DT = 0.25
/** Tak på faste steg per bilde. Uten dette kan loopen spiralere. */
const MAX_STEPS_PER_FRAME = 10

export function useSimLoop(
  store: SimStore,
  track: Track,
  paramsRef: { current: Params },
  source: TapSource,
) {
  const accumulator = useRef(0)
  const lastWall = useRef<number | null>(null)
  /** Vegg-tid som svarer til sim-tid 0. Oversetter tapp inn i sim-klokka. */
  const simOrigin = useRef(0)
  const pending = useRef<Tap[]>([])

  // Negativ prioritet: R3F sorterer stigende, så simuleringen er ferdig før
  // kamera og løper leser den. Bare positive prioriteter slår av auto-render.
  useFrame(() => {
    const p = paramsRef.current
    const wall = now()

    if (lastWall.current === null) {
      lastWall.current = wall
      simOrigin.current = wall - store.curr.t
      return
    }

    accumulator.current += Math.min(wall - lastWall.current, MAX_FRAME_DT)
    lastWall.current = wall

    // Tapp kommer med vegg-tid; her oversettes de til sim-tid.
    for (const tap of source.pull()) {
      pending.current.push({ t: tap.t - simOrigin.current, side: tap.side })
    }

    const dt = p.FIXED_DT
    let steps = 0
    while (accumulator.current >= dt && steps < MAX_STEPS_PER_FRAME) {
      const { due, rest } = partitionTaps(pending.current, store.curr.t + dt)
      pending.current = rest
      store.prev = store.curr
      store.curr = step(store.curr, due, dt, track, p)
      accumulator.current -= dt
      steps++
    }

    if (steps === MAX_STEPS_PER_FRAME) {
      // Vi kom ikke i mål. Slipp restetiden heller enn å henge etter for alltid.
      accumulator.current = 0
    }

    store.steps += steps
    store.alpha = clamp(accumulator.current / dt, 0, 1)
    // Hold klokkene i sync, også når vi nettopp kastet tid.
    simOrigin.current = wall - store.curr.t - accumulator.current
  }, -1)
}

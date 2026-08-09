/**
 * Driveren: fast timestep med akkumulator, frikoblet fra render-loopen.
 * Rendringen interpolerer mellom prev og curr — den styrer aldri simuleringen.
 *
 * Her oversettes også inndata til den formen simuleringen vil ha den:
 * hendelser fordeles på det faste steget de hører hjemme i, mens hold leses
 * av som nivå.
 */

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { now, type InputEvent, type InputSource } from '../input/useInput'
import type { Params } from '../sim/constants'
import { step } from '../sim/physics'
import { clamp } from '../sim/rng'
import type { Side, StepInput, Tap } from '../sim/types'
import type { World } from '../sim/world/types'
import type { SimStore } from './simStore'

/** Tak på hvor mye tid ett bilde får hente inn. Beskytter mot fanebytte. */
const MAX_FRAME_DT = 0.25
/** Tak på faste steg per bilde. Uten dette kan loopen spiralere. */
const MAX_STEPS_PER_FRAME = 10

/** Opp er gass, ned er revers, begge eller ingen er tomgang. */
function throttleFrom(holds: { U: boolean; D: boolean }): -1 | 0 | 1 {
  if (holds.U === holds.D) return 0
  return holds.U ? 1 : -1
}

/** Rattet: venstre eller høyre, begge er rett fram. */
function steerFrom(holds: { L: boolean; R: boolean }): -1 | 0 | 1 {
  if (holds.L === holds.R) return 0
  return holds.R ? 1 : -1
}

export function useSimLoop(
  store: SimStore,
  world: World,
  paramsRef: { current: Params },
  source: InputSource,
) {
  const accumulator = useRef(0)
  const lastWall = useRef<number | null>(null)
  /** Vegg-tid som svarer til sim-tid 0. Oversetter hendelser inn i sim-klokka. */
  const simOrigin = useRef(0)
  const pending = useRef<InputEvent[]>([])

  // Negativ prioritet: R3F sorterer stigende, så simuleringen er ferdig før
  // kamera og kjøretøy leser den. Bare positive prioriteter slår av auto-render.
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

    // Hendelser kommer med vegg-tid; her oversettes de til sim-tid.
    for (const event of source.pull()) {
      pending.current.push({ ...event, t: event.t - simOrigin.current })
    }

    const holds = source.holds()
    const throttle = throttleFrom(holds)
    const steer = steerFrom(holds)
    const dt = p.FIXED_DT
    let steps = 0

    while (accumulator.current >= dt && steps < MAX_STEPS_PER_FRAME) {
      const tEnd = store.curr.t + dt
      const taps: Tap[] = []
      let turn: Side | null = null
      let modeToggles = 0
      const rest: InputEvent[] = []

      for (const event of pending.current) {
        // Hendelser som ligger bak tEnd er også forfalt: et inndata som kom
        // litt for sent skal aldri forsvinne, det utføres nå.
        if (event.t >= tEnd) {
          rest.push(event)
          continue
        }
        if (event.kind === 'tap') taps.push({ t: event.t, side: event.side })
        else if (event.kind === 'swipe') turn = event.side
        else modeToggles++
      }
      pending.current = rest
      taps.sort((a, b) => a.t - b.t)

      const input: StepInput = { taps, throttle, steer, turn, modeToggles }
      store.prev = store.curr
      store.curr = step(store.curr, input, dt, world, p)
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

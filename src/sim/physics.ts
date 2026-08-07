/**
 * 1D-fysikk langs sporet. Deterministisk, fast timestep, ingen NaN.
 *
 * Fortegn: theta = atan(gradientAt(s)), så positiv theta er motbakke.
 * Gravitasjonsleddet må derfor være negativt for at utforbakke skal
 * akselerere — briefens `G * sin(theta)` skrevet ut i denne konvensjonen.
 */

import type { Params } from './constants'
import { applyTap, evaluateTap, initialCadence } from './cadence'
import { clamp } from './rng'
import type { Track } from './track'
import type { State, Tap } from './types'

export function initialState(): State {
  return { t: 0, s: 0, v: 0, cadence: initialCadence() }
}

/**
 * Er tappet forfalt ved slutten av dette steget?
 * Tapp som ligger bak `tEnd` regnes også som forfalt — et input som kom
 * inn litt for sent skal aldri forsvinne, det utføres nå.
 */
export function isDue(tap: Tap, tEnd: number): boolean {
  return tap.t < tEnd
}

/** Deler tapp i de som skal utføres innen tEnd, og de som må vente. */
export function partitionTaps(taps: Tap[], tEnd: number): { due: Tap[]; rest: Tap[] } {
  const due: Tap[] = []
  const rest: Tap[] = []
  for (const tap of taps) (isDue(tap, tEnd) ? due : rest).push(tap)
  due.sort((a, b) => a.t - b.t)
  return { due, rest }
}

/**
 * Ett fast tidssteg. `taps` er tappene som hører til dette steget —
 * de med t >= state.t + dt ignoreres og hører hjemme i et senere steg.
 */
export function step(state: State, taps: Tap[], dt: number, track: Track, p: Params): State {
  if (!Number.isFinite(dt) || dt <= 0) return state

  const tEnd = state.t + dt
  const theta = Math.atan(track.gradientAt(state.s))

  let v = state.v
  let cadence = state.cadence

  // Impulser først, så de virker gjennom hele steget.
  const { due } = partitionTaps(taps, tEnd)
  for (const tap of due) {
    const evaluated = evaluateTap(tap, cadence, v, theta, p)
    v += evaluated.impulse
    cadence = applyTap(tap, evaluated.quality)
  }

  const aGravity = -p.G * Math.sin(theta)
  // Friksjon virker bare mens løperen faktisk glir — ellers ville den
  // dyttet farten under null.
  const aFriction = v > 0 ? -p.MU * p.G * Math.cos(theta) : 0
  const aDrag = -p.K_DRAG * v * v

  v += (aGravity + aFriction + aDrag) * dt

  if (!Number.isFinite(v)) v = 0
  v = clamp(v, 0, Math.max(p.MAX_SPEED, 0))

  return {
    t: tEnd,
    s: track.wrap(state.s + v * dt),
    v,
    cadence,
  }
}

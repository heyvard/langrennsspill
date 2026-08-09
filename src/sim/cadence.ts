/**
 * Takt-modellen. Dette er hele spillet.
 *
 * Rene funksjoner av tapp-hendelser og tid — ingen skjult tilstand,
 * ingen tidskilde. Alt som må huskes ligger i CadenceState.
 */

import type { Params } from './constants'
import { clamp } from './rng'
import type { CadenceState, Side, Tap, TapEval } from './types'

export function initialCadence(): CadenceState {
  return { lastTapTime: null, lastSide: null, lastQuality: 0 }
}

/**
 * Ønsket tid mellom tapp ved gitt fart. Krymper når farten stiger, så
 * rytmen må rampes opp — men bunner på MIN_INTERVAL, og det er dét som
 * hindrer at spillet degenererer til rå mashing: tapper du raskere enn
 * gulvet, vokser feilen og quality faller mot 0.
 */
export function targetInterval(v: number, p: Params): number {
  const raw = p.BASE_INTERVAL - v * p.INTERVAL_SPEED_FACTOR
  // MIN over MAX ville gitt et tomt intervall — la MIN vinne.
  return clamp(raw, p.MIN_INTERVAL, Math.max(p.MAX_INTERVAL, p.MIN_INTERVAL))
}

/**
 * Hvor mye tapping biter i denne hellingen.
 * Full effekt på flatt og i motbakke. Når det heller brattere nedover enn
 * TUCK_THRESHOLD huker løperen seg ned, og fra TUCK_RANGE radianer brattere
 * gjør tapping ingenting. Det er hvilepausene i rytmen.
 *
 * @param theta atan(gradient). Negativ = utfor.
 */
export function slopeFactor(theta: number, p: Params): number {
  const steepness = -theta - p.TUCK_THRESHOLD
  if (steepness <= 0) return 1
  return clamp(1 - steepness / Math.max(p.TUCK_RANGE, 1e-6), 0, 1)
}

export function sideFactor(side: Side, cadence: CadenceState, p: Params): number {
  if (cadence.lastSide === null) return 1
  return side === cadence.lastSide ? p.WRONG_SIDE_PENALTY : 1
}

/**
 * Vurderer ett tapp. Aller første tapp har ingen forrige å måle mot:
 * det gir ingen fart, men etablerer rytmen.
 *
 * @param grip Hvor godt frasparket biter, 0–1. Kommer fra prepareringen:
 *   i et ferskt spor står skia stille under kicken, i løssnø glipper den.
 *   Dette er den fysiske grunnen til at preparering betyr noe i langrenn.
 */
export function evaluateTap(
  tap: Tap,
  cadence: CadenceState,
  v: number,
  theta: number,
  grip: number,
  p: Params,
): TapEval {
  const slope = slopeFactor(theta, p)
  const side = sideFactor(tap.side, cadence, p)

  if (cadence.lastTapTime === null) {
    return { quality: 0, sideFactor: side, slopeFactor: slope, grip, impulse: 0 }
  }

  const elapsed = tap.t - cadence.lastTapTime
  const error = Math.abs(elapsed - targetInterval(v, p))
  const quality = clamp(1 - error / Math.max(p.TIMING_WINDOW, 1e-6), 0, 1)

  return {
    quality,
    sideFactor: side,
    slopeFactor: slope,
    grip,
    impulse: p.TAP_IMPULSE * quality * side * slope * grip,
  }
}

/** Festet i sporet der man står. 1 i ferskt spor, GRIP_UNGROOMED i løssnø. */
export function gripFrom(freshness: number, p: Params): number {
  return clamp(p.GRIP_UNGROOMED + (1 - p.GRIP_UNGROOMED) * clamp(freshness, 0, 1), 0, 1)
}

/** Ny takt-tilstand etter et registrert tapp. Tappet er alt som huskes. */
export function applyTap(tap: Tap, quality: number): CadenceState {
  return { lastTapTime: tap.t, lastSide: tap.side, lastQuality: quality }
}

/** Når neste tapp forventes. null før rytmen er i gang. Kun for HUD-pulsen. */
export function nextExpectedTime(cadence: CadenceState, v: number, p: Params): number | null {
  if (cadence.lastTapTime === null) return null
  return cadence.lastTapTime + targetInterval(v, p)
}

/** Hvilken side som står for tur. null før rytmen er i gang. */
export function nextExpectedSide(cadence: CadenceState): Side | null {
  if (cadence.lastSide === null) return null
  return cadence.lastSide === 'L' ? 'R' : 'L'
}

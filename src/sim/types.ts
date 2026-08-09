/** Ren TS. Ingen import av three eller react. */

import type { Placement } from './traversal'

export type Side = 'L' | 'R'

export type Tap = { t: number; side: Side }

/** Takt-tilstanden. Alt cadence.ts trenger å huske mellom tapp. */
export type CadenceState = {
  /** Tidspunkt for forrige tapp, eller null før det første. */
  lastTapTime: number | null
  /** Siden forrige tapp traff, eller null før det første. */
  lastSide: Side | null
  /** Quality på siste tapp — kun for HUD, påvirker ikke fysikken. */
  lastQuality: number
}

/** Oppdelt resultat av ett tapp — HUD-et viser faktorene hver for seg. */
export type TapEval = {
  quality: number
  sideFactor: number
  slopeFactor: number
  /** Hvor godt frasparket bet, 0–1. Kommer fra prepareringen under skia. */
  grip: number
  /** Fartsendring i m/s som tappet gir. */
  impulse: number
}

/** Et punkt i verden. Egen type så sim/ slipper å kjenne THREE.Vector3. */
export type Vec3 = { x: number; y: number; z: number }

/** Hvilket kjøretøy spilleren styrer. Byttes med M, kun for testing. */
export type Mode = 'skier' | 'groomer'

export type SkierState = {
  placement: Placement
  /** Fart langs løypa i m/s, alltid i [0, MAX_SPEED]. Skiløperen rygger ikke. */
  v: number
  cadence: CadenceState
}

export type GroomerState = {
  placement: Placement
  /** Fart i m/s. Negativ er revers — løypemaskinen er det eneste som rygger. */
  v: number
}

/**
 * Hele simuleringens tilstand. Begge kjøretøy beholder sin egen posisjon,
 * så man kan preparere en strekning, bytte, og kjenne forskjellen på samme sted.
 */
export type State = {
  /** Sim-tid i sekunder. Starter på 0. */
  t: number
  mode: Mode
  skier: SkierState
  groomer: GroomerState
  /**
   * Svingvalget som venter på neste kryss. Settes av et sveip innenfor
   * JUNCTION_PREVIEW_DISTANCE, og nullstilles idet krysset er passert.
   */
  pendingTurn: Side | null
}

/** Alt spilleren gjør i løpet av ett fast steg. */
export type StepInput = {
  taps: Tap[]
  /** -1 revers, 0 tomgang, 1 gass. Bare løypemaskinen bryr seg. */
  throttle: -1 | 0 | 1
  /** Sveip registrert i dette steget, eller null. */
  turn: Side | null
  /** Hvor mange ganger M ble trykket i dette steget. */
  modeToggles: number
}

export const IDLE_INPUT: StepInput = { taps: [], throttle: 0, turn: null, modeToggles: 0 }

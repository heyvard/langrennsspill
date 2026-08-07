/** Ren TS. Ingen import av three eller react. */

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

/** Hele simuleringens tilstand. Skalar langs sporet. */
export type State = {
  /** Sim-tid i sekunder. Starter på 0. */
  t: number
  /** Posisjon langs sporet i meter, alltid i [0, LOOP_LENGTH). */
  s: number
  /** Fart langs sporet i m/s, alltid i [0, MAX_SPEED]. */
  v: number
  cadence: CadenceState
}

/** Oppdelt resultat av ett tapp — HUD-et viser faktorene hver for seg. */
export type TapEval = {
  quality: number
  sideFactor: number
  slopeFactor: number
  /** Fartsendring i m/s som tappet gir. */
  impulse: number
}

/** Et punkt i verden. Egen type så sim/ slipper å kjenne THREE.Vector3. */
export type Vec3 = { x: number; y: number; z: number }

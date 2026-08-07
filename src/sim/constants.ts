/**
 * Alle tunbare tall bor her. Ingen magiske tall andre steder i sim/.
 *
 * `Params` sendes inn i sim-funksjonene — den importeres aldri som en global.
 * Det holder simuleringen ren og lar testene variere konstanter fritt.
 *
 * RANGES er ikke pynt: leva-panelet genereres mekanisk fra det, så en ny
 * konstant kan ikke legges til uten å få slider. Typen håndhever det.
 */

export type Params = {
  // --- Fysikk ---
  /** Tyngdeakselerasjon, m/s². */
  G: number
  /** Glidefriksjonskoeffisient ski mot snø. */
  MU: number
  /** Luftmotstand, akselerasjon per (m/s)². */
  K_DRAG: number
  /** Hard klamring av farten oppover, m/s. */
  MAX_SPEED: number
  /** Fast timestep i sekunder. Determinisme gjelder per valgt dt. */
  FIXED_DT: number

  // --- Takt ---
  /** Ønsket tid mellom tapp ved stillstand, sekunder. */
  BASE_INTERVAL: number
  /** Hvor mye intervallet krymper per m/s fart. */
  INTERVAL_SPEED_FACTOR: number
  /** Gulv for intervallet. Hindrer at spillet degenererer til rå mashing. */
  MIN_INTERVAL: number
  /** Tak for intervallet. */
  MAX_INTERVAL: number
  /** Bomming utover dette gir quality 0, sekunder. */
  TIMING_WINDOW: number
  /** Fartsøkning i m/s for et perfekt tapp. */
  TAP_IMPULSE: number
  /** Faktor når tappet ikke veksler side. */
  WRONG_SIDE_PENALTY: number
  /** Utforhelling der løperen begynner å huke seg ned, radianer. */
  TUCK_THRESHOLD: number
  /** Hvor mange radianer brattere til tapping er helt uvirksomt. */
  TUCK_RANGE: number

  // --- Spor og terreng ---
  /** Ønsket omkrets på sløyfa i meter. Sporet skaleres for å treffe den. */
  LOOP_LENGTH: number
  /** Hvor mye sløyfa avviker fra en sirkel, 0 = sirkelrund. */
  TRACK_WOBBLE: number
  /** Høydeutslag i terrenget, meter. Høyt gir ubestigelige vegger. */
  TERRAIN_AMPLITUDE: number
  /** Grunnfrekvens i terrengstøyen, 1/meter. Høyt gir kortere bakker. */
  TERRAIN_FREQUENCY: number
}

/**
 * Innkjørte verdier. Med disse gir perfekt takt ~32 km/t i snitt (20–40
 * over runden, så bakkene merkes), slurvete takt ~10 km/t, og bare-én-side
 * omtrent ingenting. MAX_SPEED nås aldri i praksis — den er en sikkerhetsklamme.
 */
export const DEFAULTS: Params = {
  G: 9.81,
  MU: 0.035,
  K_DRAG: 0.014,
  MAX_SPEED: 25,
  FIXED_DT: 1 / 120,

  BASE_INTERVAL: 0.6,
  INTERVAL_SPEED_FACTOR: 0.02,
  MIN_INTERVAL: 0.32,
  MAX_INTERVAL: 0.9,
  TIMING_WINDOW: 0.22,
  TAP_IMPULSE: 0.8,
  WRONG_SIDE_PENALTY: 0.35,
  TUCK_THRESHOLD: 0.03,
  TUCK_RANGE: 0.035,

  LOOP_LENGTH: 1200,
  TRACK_WOBBLE: 0.22,
  // Gir median stigning ~4 %, p95 ~12 %. Høyere amplitude eller frekvens
  // lager bakker løperen ikke kommer opp.
  TERRAIN_AMPLITUDE: 7,
  TERRAIN_FREQUENCY: 0.0045,
}

export type Range = { min: number; max: number; step: number }

export const RANGES: Record<keyof Params, Range> = {
  G: { min: 0, max: 20, step: 0.01 },
  MU: { min: 0, max: 0.2, step: 0.001 },
  K_DRAG: { min: 0, max: 0.05, step: 0.0001 },
  MAX_SPEED: { min: 1, max: 60, step: 0.5 },
  FIXED_DT: { min: 1 / 240, max: 1 / 30, step: 1 / 960 },

  BASE_INTERVAL: { min: 0.2, max: 1.5, step: 0.005 },
  INTERVAL_SPEED_FACTOR: { min: 0, max: 0.08, step: 0.0005 },
  MIN_INTERVAL: { min: 0.1, max: 1, step: 0.005 },
  MAX_INTERVAL: { min: 0.2, max: 2, step: 0.005 },
  TIMING_WINDOW: { min: 0.02, max: 0.6, step: 0.005 },
  TAP_IMPULSE: { min: 0, max: 3, step: 0.01 },
  WRONG_SIDE_PENALTY: { min: 0, max: 1, step: 0.01 },
  TUCK_THRESHOLD: { min: 0, max: 0.4, step: 0.001 },
  TUCK_RANGE: { min: 0.005, max: 0.4, step: 0.001 },

  LOOP_LENGTH: { min: 200, max: 5000, step: 10 },
  TRACK_WOBBLE: { min: 0, max: 0.6, step: 0.005 },
  TERRAIN_AMPLITUDE: { min: 0, max: 20, step: 0.1 },
  TERRAIN_FREQUENCY: { min: 0.0005, max: 0.02, step: 0.0001 },
}

/** Rekkefølgen sliderne skal stå i, gruppert som de tunes. */
export const PARAM_GROUPS: { label: string; keys: (keyof Params)[] }[] = [
  { label: 'Fysikk', keys: ['G', 'MU', 'K_DRAG', 'MAX_SPEED', 'FIXED_DT'] },
  {
    label: 'Takt',
    keys: [
      'BASE_INTERVAL',
      'INTERVAL_SPEED_FACTOR',
      'MIN_INTERVAL',
      'MAX_INTERVAL',
      'TIMING_WINDOW',
      'TAP_IMPULSE',
      'WRONG_SIDE_PENALTY',
      'TUCK_THRESHOLD',
      'TUCK_RANGE',
    ],
  },
  {
    label: 'Spor',
    keys: ['LOOP_LENGTH', 'TRACK_WOBBLE', 'TERRAIN_AMPLITUDE', 'TERRAIN_FREQUENCY'],
  },
]

/** Standard seed. Rendering og sim må alltid bruke samme. */
export const DEFAULT_SEED = 1337

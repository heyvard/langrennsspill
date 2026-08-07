/**
 * Stemningspaletten. Ett klokkeslett inn, alle farger og lysstyrker ut.
 * Stemningen er produktet, så den bor ett sted og ikke spredt utover.
 */

import { Color } from 'three'

/** Snøen: én matt, litt blålig hvit. Ingen teksturer. */
export const SNOW = new Color('#dde5f0')
/** Sporet i snøen — samme snø, litt dypere og kaldere. */
export const GROOVE = new Color('#94a6c0')
/** Granskogen. Mørk barskoggrønn — leser grønt i sol, nesten svart i tåka. */
export const SPRUCE = new Color('#2e4a34')
/** Løperen. Grå kapsel, ikke noe mer. Lys nok til å lese mot snøen
 *  etter at ACES-tonemappingen har trykket midttonene ned. */
export const RUNNER = new Color('#c3c8d0')

export type Mood = {
  fog: Color
  /** Multiplikator på fogDensity-slideren. Dagen har tynnere dis enn kvelden. */
  fogScale: number
  ambient: Color
  ambientIntensity: number
  skyColor: Color
  groundColor: Color
  hemiIntensity: number
  sunColor: Color
  sunIntensity: number
  /** Sola står høyt midt på dagen og synker mot vest utover kvelden. */
  sunPosition: [number, number, number]
  /** 0 i dagslys, 1 når det er mørkt. Ganges inn i hodelyktas styrke. */
  lampFactor: number
}

const DAY = {
  fog: new Color('#cfe0f2'),
  ambient: new Color('#e2effd'),
  sky: new Color('#8fc0ee'),
  // Snøen kaster lyset tilbake opp i undersida av alt.
  ground: new Color('#c6d4e6'),
  sun: new Color('#fff6e6'),
}

const AFTERNOON = {
  fog: new Color('#93a7c4'),
  ambient: new Color('#a8bcd9'),
  sky: new Color('#b9cbe4'),
  ground: new Color('#5d6b80'),
  sun: new Color('#ffd7ac'),
}

const NIGHT = {
  fog: new Color('#070b14'),
  ambient: new Color('#16243f'),
  sky: new Color('#1b2b48'),
  ground: new Color('#080d16'),
  sun: new Color('#20304f'),
}

/**
 * Sola midt på dagen. Lavt nok til at lyset streifer terrenget — en sol rett
 * overhodet gir alle fasettene samme lys, og da forsvinner flatshadingen som
 * er hele looken. Norsk vintersol står lavt uansett.
 */
const DAY_SUN_POS: [number, number, number] = [-110, 95, -80]
/** … og lavt i vest mot skumring. Samme retning som før. */
const DUSK_SUN_POS: [number, number, number] = [-140, 40, -90]

/** Klokkeslettene Dag/Kveld-bryteren snapper til. */
export const DAY_HOUR = 12
export const EVENING_HOUR = 20

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * @param hour Klokkeslett. 12 er høylys dag, 15 sen ettermiddag,
 *   18–19 skumring, 21+ natt.
 */
export function moodAt(hour: number): Mood {
  // To trinn: først dag → ettermiddag, så ettermiddag → natt. Tallene er
  // valgt så alt fra 15.5 og utover er nøyaktig som før dagsmodusen kom.
  const afternoon = smoothstep(11, 15.5, hour)
  const night = smoothstep(15.5, 21, hour)

  const mix = (d: Color, a: Color, n: Color) => d.clone().lerp(a, afternoon).lerp(n, night)

  const sunLow = smoothstep(11, 18, hour)
  const sunPosition = DAY_SUN_POS.map((v, i) => v + (DUSK_SUN_POS[i] - v) * sunLow) as [
    number,
    number,
    number,
  ]

  return {
    fog: mix(DAY.fog, AFTERNOON.fog, NIGHT.fog),
    fogScale: 0.5 + 0.5 * afternoon,
    ambient: mix(DAY.ambient, AFTERNOON.ambient, NIGHT.ambient),
    // 1.5 → 1.15 (ettermiddag) → 0.17 (natt).
    ambientIntensity: 1.5 - 0.35 * afternoon - 0.98 * night,
    skyColor: mix(DAY.sky, AFTERNOON.sky, NIGHT.sky),
    groundColor: mix(DAY.ground, AFTERNOON.ground, NIGHT.ground),
    // 1.3 → 0.9 → 0.18.
    hemiIntensity: 1.3 - 0.4 * afternoon - 0.72 * night,
    sunColor: mix(DAY.sun, AFTERNOON.sun, NIGHT.sun),
    // 2.0 midt på dagen, 1.1 på ettermiddagen. Sola er under horisonten
    // lenge før midnatt.
    sunIntensity: (2.0 - 0.9 * afternoon) * (1 - smoothstep(15, 19.5, hour)),
    sunPosition,
    lampFactor: smoothstep(15.5, 19.5, hour),
  }
}

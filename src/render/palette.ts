/**
 * Stemningspaletten. Ett klokkeslett inn, alle farger og lysstyrker ut.
 * Stemningen er produktet, så den bor ett sted og ikke spredt utover.
 */

import { Color } from 'three'

/** Snøen: én matt, litt blålig hvit. Ingen teksturer. */
export const SNOW = new Color('#dde5f0')
/** Sporet i snøen — samme snø, litt dypere og kaldere. */
export const GROOVE = new Color('#94a6c0')
/** Granskogen. Nesten svart, så tåka gjør jobben. */
export const SPRUCE = new Color('#1a2a2b')
/** Løperen. Grå kapsel, ikke noe mer. Lys nok til å lese mot snøen
 *  etter at ACES-tonemappingen har trykket midttonene ned. */
export const RUNNER = new Color('#c3c8d0')

export type Mood = {
  fog: Color
  ambient: Color
  ambientIntensity: number
  skyColor: Color
  groundColor: Color
  hemiIntensity: number
  sunColor: Color
  sunIntensity: number
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * @param hour Klokkeslett. 15 er sen ettermiddag, 18–19 skumring, 21+ natt.
 */
export function moodAt(hour: number): Mood {
  const night = smoothstep(15.5, 21, hour)

  return {
    fog: AFTERNOON.fog.clone().lerp(NIGHT.fog, night),
    ambient: AFTERNOON.ambient.clone().lerp(NIGHT.ambient, night),
    ambientIntensity: 1.15 - 0.98 * night,
    skyColor: AFTERNOON.sky.clone().lerp(NIGHT.sky, night),
    groundColor: AFTERNOON.ground.clone().lerp(NIGHT.ground, night),
    hemiIntensity: 0.9 - 0.72 * night,
    sunColor: AFTERNOON.sun.clone().lerp(NIGHT.sun, night),
    // Sola er under horisonten lenge før midnatt.
    sunIntensity: 1.1 * (1 - smoothstep(15, 19.5, hour)),
  }
}

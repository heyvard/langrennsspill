/**
 * Seedet spor. Ren TS — importerer aldri three eller react.
 *
 * Sporet er en lukket sløyfe i xz-planet. Høyden leses fra ett felles
 * høydefelt (terrainHeightAt), som render/ bruker til terrengmesh-et.
 * Det gir to ting gratis:
 *   - sporet ligger nøyaktig på bakken, uten synkronisering
 *   - elevationAt er periodisk av seg selv, fordi xz-kurven er lukket
 */

import { createNoise2D } from 'simplex-noise'
import type { Params } from './constants'
import { makeRng } from './rng'
import type { Vec3 } from './types'

/** Antall støyoktaver i høydefeltet. */
const OCTAVES = 3
/** Amplitudefall per oktav. Lavt tall holder bakkene bestigelige. */
const PERSISTENCE = 0.4
/** Frekvensøkning per oktav. */
const LACUNARITY = 2

/** Oppløsning på buelengde-tabellen. ~0.6 m per steg på en 1200 m sløyfe. */
const ARC_SAMPLES = 2048
/** Halv bredde på sentraldifferansen for gradient og tangent, meter. */
const DIFF_H = 0.5

/** Harmoniske som gjør sløyfa ujevn. Heltall → kurven lukker seg eksakt. */
const WOBBLE_HARMONICS = [2, 3, 5]

export type Track = {
  /** Sporets omkrets i meter. s wrapper modulo denne. */
  loopLength: number
  /** Terrenghøyde i et vilkårlig punkt. Samme kilde for sim og rendering. */
  terrainHeightAt(x: number, z: number): number
  /** Punkt på sporet. y er hentet fra høydefeltet. */
  positionAt(s: number): Vec3
  /** Enhetsvektor framover langs sporet, inkludert stigning. */
  tangentAt(s: number): Vec3
  /** Enhetsvektor vannrett mot høyre for løperen. */
  lateralAt(s: number): Vec3
  /** Høyde over havet på sporet. */
  elevationAt(s: number): number
  /** dy/ds. Positiv = motbakke. */
  gradientAt(s: number): number
  /** Bringer en vilkårlig s inn i [0, loopLength). */
  wrap(s: number): number
}

export function createTrack(seed: number, p: Params): Track {
  const noise2D = createNoise2D(makeRng(seed))
  const shapeRng = makeRng(seed ^ 0x9e3779b9)

  // Vekter og faser for sløyfeformen. Normalisert så TRACK_WOBBLE er
  // det faktiske relative utslaget uansett hvordan lodningen falt.
  const weights = WOBBLE_HARMONICS.map(() => 0.4 + shapeRng())
  const phases = WOBBLE_HARMONICS.map(() => shapeRng() * Math.PI * 2)
  const weightSum = weights.reduce((a, b) => a + b, 0)

  /** Radius som funksjon av vinkel, for en enhetssløyfe. Periodisk i 2π. */
  function unitRadius(phi: number): number {
    let w = 0
    for (let i = 0; i < WOBBLE_HARMONICS.length; i++) {
      w += (weights[i] / weightSum) * Math.sin(WOBBLE_HARMONICS[i] * phi + phases[i])
    }
    return 1 + p.TRACK_WOBBLE * w
  }

  // Buelengden er lineær i radius, så vi måler enhetssløyfa én gang og
  // skalerer den opp til ønsket LOOP_LENGTH.
  let unitLength = 0
  {
    let px = unitRadius(0)
    let pz = 0
    for (let i = 1; i <= ARC_SAMPLES; i++) {
      const phi = (i / ARC_SAMPLES) * Math.PI * 2
      const r = unitRadius(phi)
      const x = r * Math.cos(phi)
      const z = r * Math.sin(phi)
      unitLength += Math.hypot(x - px, z - pz)
      px = x
      pz = z
    }
  }
  const radiusScale = p.LOOP_LENGTH / unitLength

  // Buelengde-tabell: cumulative[i] = lengde fram til phi_i. Strengt voksende.
  const cumulative = new Float64Array(ARC_SAMPLES + 1)
  {
    let px = unitRadius(0) * radiusScale
    let pz = 0
    for (let i = 1; i <= ARC_SAMPLES; i++) {
      const phi = (i / ARC_SAMPLES) * Math.PI * 2
      const r = unitRadius(phi) * radiusScale
      const x = r * Math.cos(phi)
      const z = r * Math.sin(phi)
      cumulative[i] = cumulative[i - 1] + Math.hypot(x - px, z - pz)
      px = x
      pz = z
    }
  }
  const loopLength = cumulative[ARC_SAMPLES]

  function wrap(s: number): number {
    if (!Number.isFinite(s)) return 0
    const m = s % loopLength
    return m < 0 ? m + loopLength : m
  }

  /** Buelengde → vinkel, ved binærsøk i tabellen og lineær interpolasjon. */
  function phiAt(s: number): number {
    const target = wrap(s)
    let lo = 0
    let hi = ARC_SAMPLES
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (cumulative[mid] <= target) lo = mid
      else hi = mid
    }
    const span = cumulative[hi] - cumulative[lo]
    const frac = span > 0 ? (target - cumulative[lo]) / span : 0
    return ((lo + frac) / ARC_SAMPLES) * Math.PI * 2
  }

  function terrainHeightAt(x: number, z: number): number {
    let sum = 0
    let norm = 0
    let amp = 1
    let freq = p.TERRAIN_FREQUENCY
    for (let o = 0; o < OCTAVES; o++) {
      sum += amp * noise2D(x * freq, z * freq)
      norm += amp
      amp *= PERSISTENCE
      freq *= LACUNARITY
    }
    // Normalisert så utslaget holder seg innenfor ±TERRAIN_AMPLITUDE
    // uansett antall oktaver.
    return (sum / norm) * p.TERRAIN_AMPLITUDE
  }

  function positionAt(s: number): Vec3 {
    const phi = phiAt(s)
    const r = unitRadius(phi) * radiusScale
    const x = r * Math.cos(phi)
    const z = r * Math.sin(phi)
    return { x, y: terrainHeightAt(x, z), z }
  }

  function elevationAt(s: number): number {
    return positionAt(s).y
  }

  function gradientAt(s: number): number {
    return (elevationAt(s + DIFF_H) - elevationAt(s - DIFF_H)) / (2 * DIFF_H)
  }

  function tangentAt(s: number): Vec3 {
    const a = positionAt(s - DIFF_H)
    const b = positionAt(s + DIFF_H)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const len = Math.hypot(dx, dy, dz) || 1
    return { x: dx / len, y: dy / len, z: dz / len }
  }

  function lateralAt(s: number): Vec3 {
    const t = tangentAt(s)
    // Kryssprodukt med opp-vektoren, projisert flatt.
    const x = -t.z
    const z = t.x
    const len = Math.hypot(x, z) || 1
    return { x: x / len, y: 0, z: z / len }
  }

  return {
    loopLength,
    terrainHeightAt,
    positionAt,
    tangentAt,
    lateralAt,
    elevationAt,
    gradientAt,
    wrap,
  }
}

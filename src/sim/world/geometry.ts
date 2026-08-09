/**
 * Oppslag langs en kant. Alt er ren geometri mot cachede tabeller — ingen
 * støy samples her, den jobben er gjort ved generering.
 *
 * `s` måles alltid fra `edge.from`, uansett hvilken vei man kjører. `dir`
 * påvirker bare fortegnet på tangent, gradient og sideretning, slik at
 * `theta = atan(edgeGradient(...))` fortsatt er positiv i motbakke.
 */

import type { Params } from '../constants'
import { clamp } from '../rng'
import type { Vec3 } from '../types'
import { NEVER_GROOMED, type WorldEdge } from './types'

/**
 * Halv bredde på sentraldifferansen for gradient og tangent, meter.
 *
 * To meter, ikke en halv: en skiløper kjenner hellingen over sin egen lengde,
 * ikke under hver skisåle. Dette er også den eneste definisjonen av stigning
 * i prosjektet — generatoren måler med nøyaktig samme mål når den avgjør om
 * en kant er brattere enn MAX_GRADIENT.
 */
export const DIFF_H = 2

/**
 * Største indeks der `cumulative[i] <= s`, begrenset til nest siste punkt så
 * det alltid finnes et segment å interpolere i.
 */
function segmentAt(cumulative: Float64Array, s: number): number {
  let lo = 0
  let hi = cumulative.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] <= s) lo = mid
    else hi = mid
  }
  return lo
}

/** Lineær interpolasjon i en verditabell indeksert på buelengde. */
function interpolate(
  cumulative: Float64Array,
  values: Float64Array,
  length: number,
  s: number,
): number {
  const t = clamp(Number.isFinite(s) ? s : 0, 0, length)
  const i = segmentAt(cumulative, t)
  const span = cumulative[i + 1] - cumulative[i]
  const f = span > 0 ? (t - cumulative[i]) / span : 0
  return values[i] + (values[i + 1] - values[i]) * f
}

/** Bringer en vilkårlig s inn på kanten. */
export function clampS(edge: WorldEdge, s: number): number {
  if (!Number.isFinite(s)) return 0
  return clamp(s, 0, edge.length)
}

export function edgePoint(edge: WorldEdge, s: number): Vec3 {
  const t = clampS(edge, s)
  const i = segmentAt(edge.cumulative, t)
  const span = edge.cumulative[i + 1] - edge.cumulative[i]
  const f = span > 0 ? (t - edge.cumulative[i]) / span : 0
  const a = edge.points[i]
  const b = edge.points[i + 1]
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: edge.elevation[i] + (edge.elevation[i + 1] - edge.elevation[i]) * f,
    z: a[1] + (b[1] - a[1]) * f,
  }
}

export function edgeElevation(edge: WorldEdge, s: number): number {
  return interpolate(edge.cumulative, edge.elevation, edge.length, s)
}

/**
 * dy/ds langs en høydeprofil, målt med samme sentraldifferanse overalt.
 * Generatoren kaller denne på profiler som ennå ikke er blitt til kanter.
 */
export function gradientOfProfile(
  cumulative: Float64Array,
  elevation: Float64Array,
  length: number,
  s: number,
): number {
  const h = Math.min(DIFF_H, length / 2)
  if (h <= 0 || length <= 0) return 0
  const t = clamp(Number.isFinite(s) ? s : 0, 0, length)
  const lo = clamp(t - h, 0, length)
  const hi = clamp(t + h, 0, length)
  const span = hi - lo
  if (span <= 0) return 0
  return (
    (interpolate(cumulative, elevation, length, hi) -
      interpolate(cumulative, elevation, length, lo)) /
    span
  )
}

/** Brattest stigning noe sted langs profilen. Definerer `WorldEdge.maxGradient`. */
export function maxGradientOfProfile(
  cumulative: Float64Array,
  elevation: Float64Array,
  length: number,
): number {
  const steps = Math.max(2, Math.ceil(length))
  let worst = 0
  for (let i = 0; i <= steps; i++) {
    const g = Math.abs(gradientOfProfile(cumulative, elevation, length, (i / steps) * length))
    if (g > worst) worst = g
  }
  return worst
}

/**
 * dy/ds i kjøreretningen. Positiv = motbakke.
 * Sentraldifferansen krymper ved endene så den ikke leser utenfor kanten.
 */
export function edgeGradient(edge: WorldEdge, s: number, dir: 1 | -1): number {
  return dir * gradientOfProfile(edge.cumulative, edge.elevation, edge.length, s)
}

/** Enhetsvektor framover i kjøreretningen, inkludert stigning. */
export function edgeTangent(edge: WorldEdge, s: number, dir: 1 | -1): Vec3 {
  const t = clampS(edge, s)
  const h = Math.min(DIFF_H, edge.length / 2)
  const lo = edgePoint(edge, clamp(t - h, 0, edge.length))
  const hi = edgePoint(edge, clamp(t + h, 0, edge.length))
  const dx = (hi.x - lo.x) * dir
  const dy = (hi.y - lo.y) * dir
  const dz = (hi.z - lo.z) * dir
  const len = Math.hypot(dx, dy, dz)
  if (len === 0) return { x: 0, y: 0, z: dir }
  return { x: dx / len, y: dy / len, z: dz / len }
}

/** Enhetsvektor vannrett mot høyre for den som kjører. */
export function edgeLateral(edge: WorldEdge, s: number, dir: 1 | -1): Vec3 {
  const t = edgeTangent(edge, s, dir)
  // Kryssprodukt med opp-vektoren, projisert flatt.
  const x = -t.z
  const z = t.x
  const len = Math.hypot(x, z)
  if (len === 0) return { x: 1, y: 0, z: 0 }
  return { x: x / len, y: 0, z: z / len }
}

/** Retningen kanten peker i xz-planet, som vinkel. Til kryssvalg og skilt. */
export function edgeHeading(edge: WorldEdge, s: number, dir: 1 | -1): number {
  const t = edgeTangent(edge, s, dir)
  return Math.atan2(t.z, t.x)
}

/** Hvor mange bøtter en kant trenger. Alltid minst én. */
export function bucketCount(length: number, p: Params): number {
  const size = Math.max(p.GROOM_BUCKET_LENGTH, 1e-3)
  return Math.max(1, Math.ceil(length / size))
}

/** Bøtta som dekker s. Alltid en gyldig indeks. */
export function bucketIndex(edge: WorldEdge, s: number, p: Params): number {
  const size = Math.max(p.GROOM_BUCKET_LENGTH, 1e-3)
  const i = Math.floor(clampS(edge, s) / size)
  return clamp(i, 0, edge.buckets - 1)
}

/**
 * Antall baner på tvers. Alltid et oddetall, så midtbanen dekker lat = 0 og
 * dermed begge skisporene — ellers ville et spor kunne bli preparert og det
 * andre ikke, av samme passering.
 */
export function laneCount(p: Params): number {
  const n = Math.max(1, Math.round(p.GROOM_LANE_COUNT))
  return n % 2 === 0 ? n + 1 : n
}

/** Halv løypebredde, aldri negativ. */
export function halfWidth(p: Params): number {
  return Math.max(p.TRAIL_HALF_WIDTH, 1e-3)
}

/** Bredden på én bane, meter. */
export function laneWidth(p: Params): number {
  return (2 * halfWidth(p)) / laneCount(p)
}

/**
 * Banen som dekker en sideveis posisjon, målt i meter mot høyre for
 * `from → to`. Alltid en gyldig indeks.
 */
export function laneIndex(lat: number, p: Params): number {
  const half = halfWidth(p)
  const t = clamp(Number.isFinite(lat) ? lat : 0, -half, half)
  return clamp(Math.floor((t + half) / laneWidth(p)), 0, laneCount(p) - 1)
}

/** Cella i `groomedAt` som dekker et punkt. Rutenettet er lagret flatt. */
export function cellIndex(edge: WorldEdge, s: number, lat: number, p: Params): number {
  return laneIndex(lat, p) * edge.buckets + bucketIndex(edge, s, p)
}

/** Hvor ferskt preparert et punkt er, 1 = nettopp, 0 = upreparert eller glemt. */
export function freshnessAt(
  edge: WorldEdge,
  s: number,
  lat: number,
  now: number,
  p: Params,
): number {
  return freshnessOfCell(edge, cellIndex(edge, s, lat, p), now, p)
}

export function freshnessOfCell(
  edge: WorldEdge,
  cell: number,
  now: number,
  p: Params,
): number {
  const groomed = edge.groomedAt[cell]
  if (groomed === undefined || groomed <= NEVER_GROOMED) return 0
  const decay = Math.max(p.GROOM_DECAY_TIME, 1e-6)
  return clamp(1 - (now - groomed) / decay, 0, 1)
}

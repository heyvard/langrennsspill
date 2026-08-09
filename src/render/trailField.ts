/**
 * Hvor løypene ligger, som et oppslag i planet.
 *
 * Løypene er planert — midtlinja følger en glattet høydeprofil, ikke hver
 * knaus i støyfeltet. Terrenget må vite om det, ellers forsvinner traseen ned
 * i bakken der planeringen skjærer. Så terrenget dras mot løypehøyden nær
 * løypa og slippes fri utover: en skjæring der løypa ligger lavt, en fylling
 * der den ligger høyt. Det er også slik en ekte løype er lagt.
 *
 * Det samme oppslaget forteller hvor trærne ikke kan stå. Uten det vokser
 * det gran midt i sporet, fordi serpentinene gjør at løypa svinger tilbake
 * innenfor sin egen korridor.
 */

import { edgePoint } from '../sim/world/geometry'
import type { World } from '../sim/world/types'

/** Avstand mellom punktene løypa registreres med, meter. */
const SAMPLE_SPACING = 4
/**
 * Så langt fra løypa oppslaget svarer. Utenfor er terrenget urørt.
 * Holdt stramt: gjør den bred, blir skjæringen en motorvei gjennom skogen.
 */
export const REACH = 9
/** Rutestørrelse i oppslagsnettet, meter. */
const CELL = 8

export type TrailField = {
  /** Avstand til nærmeste løypepunkt. `REACH` når det ikke er noen i nærheten. */
  distanceTo(x: number, z: number): number
  /**
   * Terrenghøyden justert mot løypa. Nær midtlinja er den løypas egen høyde,
   * lenger ut går den jevnt over i den rå terrenghøyden.
   */
  benchedHeight(x: number, z: number, raw: number): number
}

/** Hvor mye løypehøyden veier på en gitt avstand. 1 på midten, 0 ved REACH. */
function weightAt(distance: number, inner: number): number {
  if (distance <= inner) return 1
  if (distance >= REACH) return 0
  const t = 1 - (distance - inner) / (REACH - inner)
  return t * t * (3 - 2 * t)
}

export function buildTrailField(world: World): TrailField {
  const sx: number[] = []
  const sz: number[] = []
  const sy: number[] = []

  for (const edge of world.edges.values()) {
    const steps = Math.max(1, Math.round(edge.length / SAMPLE_SPACING))
    for (let i = 0; i <= steps; i++) {
      const p = edgePoint(edge, (i / steps) * edge.length)
      sx.push(p.x)
      sz.push(p.z)
      sy.push(p.y)
    }
  }

  // Hvert punkt legges i alle ruter innenfor REACH, så et oppslag bare
  // trenger å se i sin egen rute.
  const grid = new Map<number, number[]>()
  const span = Math.ceil(REACH / CELL)
  const key = (cx: number, cz: number) => cx * 100003 + cz

  for (let i = 0; i < sx.length; i++) {
    const cx0 = Math.floor(sx[i] / CELL)
    const cz0 = Math.floor(sz[i] / CELL)
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const k = key(cx0 + dx, cz0 + dz)
        const list = grid.get(k)
        if (list) list.push(i)
        else grid.set(k, [i])
      }
    }
  }

  /** Nærmeste registrerte punkt, eller -1. */
  function nearest(x: number, z: number): number {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)))
    if (!list) return -1
    let best = -1
    let bestD2 = REACH * REACH
    for (const i of list) {
      const dx = sx[i] - x
      const dz = sz[i] - z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = i
      }
    }
    return best
  }

  return {
    distanceTo(x, z) {
      const i = nearest(x, z)
      if (i < 0) return REACH
      return Math.hypot(sx[i] - x, sz[i] - z)
    },
    benchedHeight(x, z, raw) {
      const i = nearest(x, z)
      if (i < 0) return raw
      const distance = Math.hypot(sx[i] - x, sz[i] - z)
      // Innenfor selve løypebredden ligger bakken nøyaktig i løypehøyde.
      const w = weightAt(distance, 2.5)
      return raw + (sy[i] - raw) * w
    },
  }
}

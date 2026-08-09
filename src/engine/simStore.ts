/**
 * Delt, muterbar tilstand mellom simuleringen og de som tegner den.
 *
 * Bevisst utenfor React: dette skrives 120 ganger i sekundet, og en
 * re-render per steg ville drept både ytelsen og responsen.
 */

import { initialState } from '../sim/physics'
import { clamp } from '../sim/rng'
import type { Mode, State } from '../sim/types'
import { edgePoint, edgeTangent } from '../sim/world/geometry'
import { edgeOf, type World } from '../sim/world/types'

export type SimStore = {
  /** Tilstanden før siste faste steg. */
  prev: State
  /** Tilstanden etter siste faste steg. */
  curr: State
  /** Hvor langt mellom prev og curr rendringen står, 0–1. */
  alpha: number
  /** Faste steg utført siden start. Kun til debug. */
  steps: number
}

export function createSimStore(world: World): SimStore {
  const state = initialState(world)
  return { prev: state, curr: state, alpha: 0, steps: 0 }
}

/**
 * Et kjøretøys posisjon og retning i verden. Gjenbrukbar, så ingen av
 * konsumentene allokerer per bilde.
 */
export type Pose = {
  x: number
  y: number
  z: number
  /** Enhetsvektor framover. */
  tx: number
  ty: number
  tz: number
  v: number
}

export function createPose(): Pose {
  return { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, v: 0 }
}

/**
 * Interpolert posisjon for ett kjøretøy. Posisjonen lerpes i xyz — de to
 * punktene ligger noen centimeter fra hverandre, så det er trygt selv når
 * placementen bytter kant midt i et kryss.
 *
 * Retningen lerpes derimot ikke over et kryss: der er de to tangentene
 * vinklet fra hverandre, og en lineær blanding ville snurret kjøretøyet
 * gjennom svingen i stedet for å svinge det.
 */
export function samplePose(store: SimStore, world: World, mode: Mode, out: Pose): Pose {
  const a = mode === 'skier' ? store.prev.skier : store.prev.groomer
  const b = mode === 'skier' ? store.curr.skier : store.curr.groomer
  const alpha = clamp(store.alpha, 0, 1)

  const pa = edgePoint(edgeOf(world, a.placement.edge), a.placement.s)
  const pb = edgePoint(edgeOf(world, b.placement.edge), b.placement.s)
  out.x = pa.x + (pb.x - pa.x) * alpha
  out.y = pa.y + (pb.y - pa.y) * alpha
  out.z = pa.z + (pb.z - pa.z) * alpha

  const tb = edgeTangent(edgeOf(world, b.placement.edge), b.placement.s, b.placement.dir)
  const switched = a.placement.edge !== b.placement.edge || a.placement.dir !== b.placement.dir
  if (switched) {
    out.tx = tb.x
    out.ty = tb.y
    out.tz = tb.z
  } else {
    const ta = edgeTangent(edgeOf(world, a.placement.edge), a.placement.s, a.placement.dir)
    const tx = ta.x + (tb.x - ta.x) * alpha
    const ty = ta.y + (tb.y - ta.y) * alpha
    const tz = ta.z + (tb.z - ta.z) * alpha
    const len = Math.hypot(tx, ty, tz) || 1
    out.tx = tx / len
    out.ty = ty / len
    out.tz = tz / len
  }

  out.v = a.v + (b.v - a.v) * alpha
  return out
}

/** Interpolert sim-tid. Prepareringens ferskhet måles mot denne. */
export function sampleTime(store: SimStore): number {
  return store.prev.t + (store.curr.t - store.prev.t) * clamp(store.alpha, 0, 1)
}

/**
 * Delt, muterbar tilstand mellom simuleringen og de som tegner den.
 *
 * Bevisst utenfor React: dette skrives 120 ganger i sekundet, og en
 * re-render per steg ville drept både ytelsen og responsen.
 */

import { initialState } from '../sim/physics'
import { clamp } from '../sim/rng'
import type { GroomerState, Mode, SkierState, State, Vec3 } from '../sim/types'
import { edgeLateral, edgePoint, edgeTangent } from '../sim/world/geometry'
import { edgeOf, type WorldEdge, type World } from '../sim/world/types'

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

/** Skiløperen har ingen sideveis posisjon — hun ligger i sporet på midtlinja. */
function lateralOf(state: SkierState | GroomerState): number {
  return 'lat' in state ? state.lat : 0
}

function yawOf(state: SkierState | GroomerState): number {
  return 'yaw' in state ? state.yaw : 0
}

/**
 * Punktet på midtlinja forskjøvet sideveis. `lat` er lagret i kantens eget
 * rom — meter mot høyre for `from → to` — så oppslaget bruker alltid
 * `edgeLateral(edge, s, 1)`, uansett hvilken vei kjøretøyet faktisk kjører.
 */
function lateralPoint(edge: WorldEdge, s: number, lat: number): Vec3 {
  const p = edgePoint(edge, s)
  if (lat === 0) return p
  const lateral = edgeLateral(edge, s, 1)
  return { x: p.x + lateral.x * lat, y: p.y, z: p.z + lateral.z * lat }
}

/**
 * Tangenten dreid med kursavviket. `edgeLateral(edge, s, dir)` er «til høyre
 * for føreren» i faktisk kjøreretning, ulikt `lateralPoint` over.
 */
function yawedTangent(edge: WorldEdge, s: number, dir: 1 | -1, yaw: number): Vec3 {
  const t = edgeTangent(edge, s, dir)
  if (yaw === 0) return t
  const lateral = edgeLateral(edge, s, dir)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return { x: t.x * cos + lateral.x * sin, y: t.y * cos, z: t.z * cos + lateral.z * sin }
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

  const edgeA = edgeOf(world, a.placement.edge)
  const edgeB = edgeOf(world, b.placement.edge)

  const pa = lateralPoint(edgeA, a.placement.s, lateralOf(a))
  const pb = lateralPoint(edgeB, b.placement.s, lateralOf(b))
  out.x = pa.x + (pb.x - pa.x) * alpha
  out.y = pa.y + (pb.y - pa.y) * alpha
  out.z = pa.z + (pb.z - pa.z) * alpha

  const tb = yawedTangent(edgeB, b.placement.s, b.placement.dir, yawOf(b))
  const switched = a.placement.edge !== b.placement.edge || a.placement.dir !== b.placement.dir
  if (switched) {
    out.tx = tb.x
    out.ty = tb.y
    out.tz = tb.z
  } else {
    const ta = yawedTangent(edgeA, a.placement.s, a.placement.dir, yawOf(a))
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

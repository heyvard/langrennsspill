/**
 * Hvor granskogen står. Trærne plasseres én gang for hele verden —
 * deterministisk fra seed — og sorteres i de samme rutene som terrenget, slik
 * at hver rute kan tegnes som én InstancedMesh.
 *
 * Ren plassering, ingen komponenter: det er Forest.tsx som tegner dem.
 */

import { Matrix4, Quaternion, Vector3 } from 'three'
import { makeRng } from '../sim/rng'
import type { HeightField } from '../sim/world/terrain'
import type { World } from '../sim/world/types'
import type { TrailField } from './trailField'
import { CHUNK_SIZE } from './useStreaming'

/** Trær per meter løype. Summen over 13 km blir en tett skog. */
const TREES_PER_METRE = 2.4
/**
 * Fri snø utenfor selve løypekanten, meter. Korridoren regnes fra løypas halve
 * bredde og ut, aldri fra et tall for seg: en bredere løype må skyve skogen
 * med seg, ellers står granene inne i løypebåndet.
 */
const CLEARANCE = 4
/** Så smal blir korridoren aldri, uansett hvor smal løypa er satt. */
const MIN_CORRIDOR = 7
/** Så langt ut fra løypa trær kan stå, meter. Tåka skjuler resten. */
const SPREAD = 55

const UNIT_QUATERNION = new Quaternion()

export type Forest = Map<string, Matrix4[]>

/**
 * Plasserer hele skogen og bøtter den på rute. Kjøres én gang per verden;
 * noen titusen trær koster noen millisekunder, og etter det er det bare
 * oppslag.
 */
export function plantForest(
  world: World,
  height: HeightField,
  trails: TrailField,
  seed: number,
): Forest {
  const rng = makeRng(seed ^ 0x68e31da4)
  const out: Forest = new Map()
  const position = new Vector3()
  const scale = new Vector3()
  // Minst så bredt at kameraet, som henger et stykke ut og bak, ikke får
  // grantopper i linsa.
  const corridor = Math.max(trails.halfWidth + CLEARANCE, MIN_CORRIDOR)

  for (const edge of world.edges.values()) {
    const count = Math.round(edge.length * TREES_PER_METRE)
    for (let i = 0; i < count; i++) {
      // Punkt langs polylinen, uten å gå veien om buelengdeoppslag.
      const t = rng() * (edge.points.length - 1)
      const seg = Math.floor(t)
      const f = t - seg
      const a = edge.points[seg]
      const b = edge.points[seg + 1]
      const px = a[0] + (b[0] - a[0]) * f
      const pz = a[1] + (b[1] - a[1]) * f
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const len = Math.hypot(dx, dz) || 1

      // u² skyver fordelingen mot korridorkanten — tett vegg nær sporet.
      const u = rng()
      const spread = Math.max(SPREAD, corridor + 1)
      const distance = (corridor + (spread - corridor) * u * u) * (rng() < 0.5 ? -1 : 1)
      const x = px + (-dz / len) * distance
      const z = pz + (dx / len) * distance

      // Serpentinene gjør at løypa svinger tilbake innenfor sin egen
      // korridor, så «sju meter ut fra denne kanten» kan være midt i sporet
      // lenger framme. Spør feltet i stedet for å regne på én kant.
      if (trails.distanceTo(x, z) < corridor) continue

      const treeHeight = 5 + rng() * 7
      const radius = 0.55 + rng() * 0.5
      const ground = trails.benchedHeight(x, z, height.heightAt(x, z))
      position.set(x, ground + treeHeight / 2, z)
      scale.set(radius, treeHeight, radius)

      const key = `${Math.floor(x / CHUNK_SIZE)}:${Math.floor(z / CHUNK_SIZE)}`
      const list = out.get(key)
      const matrix = new Matrix4().compose(position, UNIT_QUATERNION, scale)
      if (list) list.push(matrix)
      else out.set(key, [matrix])
    }
  }

  return out
}

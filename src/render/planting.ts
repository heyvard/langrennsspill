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
 * Fri korridor på hver side av løypas midtlinje, meter.
 * Må være bredere enn kameraet står ut fra sporet, ellers vokser det
 * trær rett foran linsa.
 */
const CORRIDOR = 7
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
      const distance = (CORRIDOR + (SPREAD - CORRIDOR) * u * u) * (rng() < 0.5 ? -1 : 1)
      const x = px + (-dz / len) * distance
      const z = pz + (dx / len) * distance

      // Serpentinene gjør at løypa svinger tilbake innenfor sin egen
      // korridor, så «sju meter ut fra denne kanten» kan være midt i sporet
      // lenger framme. Spør feltet i stedet for å regne på én kant.
      if (trails.distanceTo(x, z) < CORRIDOR) continue

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

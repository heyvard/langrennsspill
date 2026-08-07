/**
 * Snøen rundt sporet. Samme høydefelt som sim/ bruker, så bakken løperen
 * kjenner er nøyaktig den bakken du ser.
 */

import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { Track } from '../sim/track'
import { SNOW } from './palette'

/** Halv bredde på terrengflaten. Må dekke sløyfa med litt margin. */
const HALF_EXTENT = 280
/** Meter mellom vertekser. Flatshading gjør fasettene til selve looken. */
const CELL = 2.5

export function Terrain({ track }: { track: Track }) {
  const geometry = useMemo(() => {
    const n = Math.round((HALF_EXTENT * 2) / CELL)
    const verts = new Float32Array((n + 1) * (n + 1) * 3)

    for (let iz = 0; iz <= n; iz++) {
      for (let ix = 0; ix <= n; ix++) {
        const x = -HALF_EXTENT + ix * CELL
        const z = -HALF_EXTENT + iz * CELL
        const o = (iz * (n + 1) + ix) * 3
        verts[o] = x
        verts[o + 1] = track.terrainHeightAt(x, z)
        verts[o + 2] = z
      }
    }

    const indices = new Uint32Array(n * n * 6)
    let k = 0
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const a = iz * (n + 1) + ix
        const b = a + 1
        const c = a + (n + 1)
        const d = c + 1
        indices[k++] = a
        indices[k++] = c
        indices[k++] = b
        indices[k++] = b
        indices[k++] = c
        indices[k++] = d
      }
    }

    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(verts, 3))
    g.setIndex(new BufferAttribute(indices, 1))
    g.computeVertexNormals()
    return g
  }, [track])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={SNOW} flatShading roughness={0.95} metalness={0} />
    </mesh>
  )
}

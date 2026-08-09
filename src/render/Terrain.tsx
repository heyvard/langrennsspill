/**
 * Snøen. Samme høydefelt som sim/ bruker, så bakken løperen kjenner er
 * nøyaktig den bakken du ser.
 *
 * Bygget som ruter rundt spilleren i stedet for én plate: verden er fire
 * kilometer bred, og ett mesh over hele ville vært titalls millioner
 * vertekser. Rutene deler eksakt de samme vertekspunktene på grensene, fordi
 * høyden bare er en funksjon av (x, z) — derfor ingen sømmer.
 */

import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { HeightField } from '../sim/world/terrain'
import { SNOW } from './palette'
import type { TrailField } from './trailField'
import { CHUNK_SIZE, type Chunk } from './useStreaming'

/** Meter mellom vertekser. Flatshading gjør fasettene til selve looken. */
const CELL = 2.5
const CELLS = Math.round(CHUNK_SIZE / CELL)

function buildChunk(chunk: Chunk, height: HeightField, trails: TrailField): BufferGeometry {
  const n = CELLS
  const verts = new Float32Array((n + 1) * (n + 1) * 3)

  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      const x = chunk.x + ix * CELL
      const z = chunk.z + iz * CELL
      const o = (iz * (n + 1) + ix) * 3
      verts[o] = x
      // Løypa er planert, så bakken må følge den — ellers ligger traseen
      // begravd der planeringen skar, og synlig svevende der den fylte.
      verts[o + 1] = trails.benchedHeight(x, z, height.heightAt(x, z))
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
}

function TerrainChunk({
  chunk,
  height,
  trails,
}: {
  chunk: Chunk
  height: HeightField
  trails: TrailField
}) {
  const geometry = useMemo(() => buildChunk(chunk, height, trails), [chunk, height, trails])
  // Ruter forsvinner bak tåka hele tiden. Uten dette vokser GPU-minnet.
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={SNOW} flatShading roughness={0.95} metalness={0} />
    </mesh>
  )
}

export function Terrain({
  chunks,
  height,
  trails,
}: {
  chunks: Chunk[]
  height: HeightField
  trails: TrailField
}) {
  return (
    <>
      {chunks.map((chunk) => (
        <TerrainChunk key={chunk.key} chunk={chunk} height={height} trails={trails} />
      ))}
    </>
  )
}

/**
 * Granskogen. Tettere nær sporkanten så korridoren leses tydelig, tynnere
 * utover der tåka overtar.
 *
 * Én InstancedMesh per rute, og bare de rutene som er innenfor tåka sendes
 * til kortet. Plasseringen kommer ferdig fra forest.ts.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { type Matrix4, type InstancedMesh } from 'three'
import type { Forest } from './planting'
import { SPRUCE } from './palette'
import type { Chunk } from './useStreaming'

function ForestChunk({ matrices }: { matrices: Matrix4[] }) {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i])
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [matrices])

  useEffect(() => {
    const m = mesh.current
    return () => m?.dispose()
  }, [])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, matrices.length]}>
      {/* Enhetskjegle — instansmatrisen skalerer den til hvert tre. */}
      <coneGeometry args={[1, 1, 7]} />
      <meshStandardMaterial color={SPRUCE} flatShading roughness={1} metalness={0} />
    </instancedMesh>
  )
}

export function Trees({ chunks, forest }: { chunks: Chunk[]; forest: Forest }) {
  const populated = useMemo(
    () => chunks.filter((c) => (forest.get(c.key)?.length ?? 0) > 0),
    [chunks, forest],
  )
  return (
    <>
      {populated.map((chunk) => (
        <ForestChunk key={chunk.key} matrices={forest.get(chunk.key)!} />
      ))}
    </>
  )
}

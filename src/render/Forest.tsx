/**
 * Granskog langs sporet. Instansierte kjegler, tettere nær sporkanten
 * så korridoren leses tydelig, tynnere utover der tåka overtar.
 */

import { useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { makeRng } from '../sim/rng'
import type { Track } from '../sim/track'
import { SPRUCE } from './palette'

const COUNT = 3200
/**
 * Fri korridor på hver side av sporets midtlinje, meter.
 * Må være bredere enn kameraet står ut fra sporet, ellers vokser det
 * trær rett foran linsa.
 */
const CORRIDOR = 6
/** Så langt ut fra sporet trær kan stå, meter. Tåka skjuler resten. */
const SPREAD = 55

export function Forest({ track, seed }: { track: Track; seed: number }) {
  const mesh = useRef<InstancedMesh>(null)

  const matrices = useMemo(() => {
    const rng = makeRng(seed ^ 0x5f3759df)
    const out: Matrix4[] = []
    const position = new Vector3()
    const scale = new Vector3()
    const quaternion = new Quaternion()

    for (let i = 0; i < COUNT; i++) {
      const s = rng() * track.loopLength
      // u² skyver fordelingen mot korridorkanten — tett vegg nær sporet.
      const u = rng()
      const distance = CORRIDOR + (SPREAD - CORRIDOR) * u * u
      const side = rng() < 0.5 ? -1 : 1

      const c = track.positionAt(s)
      const lat = track.lateralAt(s)
      const x = c.x + lat.x * distance * side
      const z = c.z + lat.z * distance * side

      const height = 5 + rng() * 7
      const radius = 0.55 + rng() * 0.5

      position.set(x, track.terrainHeightAt(x, z) + height / 2, z)
      scale.set(radius, height, radius)
      quaternion.set(0, 0, 0, 1)
      out.push(new Matrix4().compose(position, quaternion, scale))
    }
    return out
  }, [track, seed])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i])
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [matrices])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      {/* Enhetskjegle — instansmatrisen skalerer den til hvert tre. */}
      <coneGeometry args={[1, 1, 7]} />
      <meshStandardMaterial color={SPRUCE} flatShading roughness={1} metalness={0} />
    </instancedMesh>
  )
}

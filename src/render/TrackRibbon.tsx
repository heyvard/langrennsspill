/**
 * Sporet: to grunne render i snøen. Mørkere og kaldere enn snøen rundt,
 * lagt like over bakken så de ikke z-fighter mot terrengmesh-et.
 */

import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { Track } from '../sim/track'
import { GROOVE } from './palette'

/** Avstand fra midten av sporet ut til hver rende, meter. */
const GAUGE = 0.44
/** Bredden på én rende, meter. */
const WIDTH = 0.17
/** Meter mellom tverrsnitt langs sporet. */
const SEGMENT = 1.5
/** Løftes så vidt over snøen. Fargen gjør resten av jobben. */
const LIFT = 0.035

export function TrackRibbon({ track }: { track: Track }) {
  const geometry = useMemo(() => {
    const segments = Math.max(8, Math.round(track.loopLength / SEGMENT))
    // To render, to vertekser per tverrsnitt, og siste tverrsnitt gjentar
    // det første så sløyfa lukkes.
    const perRibbon = (segments + 1) * 2
    const verts = new Float32Array(perRibbon * 2 * 3)
    const indices = new Uint32Array(segments * 6 * 2)

    let vo = 0
    let io = 0
    for (const sign of [-1, 1]) {
      const base = vo / 3
      for (let i = 0; i <= segments; i++) {
        const s = (i / segments) * track.loopLength
        const c = track.positionAt(s)
        const lat = track.lateralAt(s)
        for (const edge of [-WIDTH / 2, WIDTH / 2]) {
          const off = sign * GAUGE + edge
          const x = c.x + lat.x * off
          const z = c.z + lat.z * off
          verts[vo++] = x
          verts[vo++] = track.terrainHeightAt(x, z) + LIFT
          verts[vo++] = z
        }
      }
      for (let i = 0; i < segments; i++) {
        const a = base + i * 2
        const b = a + 1
        const c = a + 2
        const d = a + 3
        // Vindingen må gi normaler oppover: lateral × tangent peker opp,
        // motsatt rekkefølge ville lagt renda med ansiktet ned i bakken.
        indices[io++] = a
        indices[io++] = b
        indices[io++] = c
        indices[io++] = b
        indices[io++] = d
        indices[io++] = c
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
      <meshStandardMaterial
        color={GROOVE}
        flatShading
        roughness={0.9}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}
